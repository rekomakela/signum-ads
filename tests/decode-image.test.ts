import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createDecodeModule, slugForImage } from '../src/decode/decode-module.js';
import { mockModelClient } from '../src/providers/mock-model-client.js';
import { createDecodeServer, parseDecodeRequest } from '../src/server/decode-server.js';

const provider = {
  provider_id: 'signum.test-vlm',
  provider_name: 'Signum test VLM',
  provider_version: '1.0.0',
  generated_at: '2026-08-15T00:00:00.000Z',
};

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'signum-decode-'));
}

function corpusDirFor(casesDir: string): string {
  return join(casesDir, '.corpus');
}

async function requestJson<T>(port: number, path: string, body?: unknown) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise<{ status: number; body: T }>((resolveRequest, rejectRequest) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: payload === null ? 'GET' : 'POST',
        headers: payload === null ? {} : { 'Content-Type': 'application/json' },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () =>
          resolveRequest({
            status: response.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as T,
          }),
        );
      },
    );
    req.on('error', rejectRequest);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

test('slugForImage derives a stable decoded-* slug', () => {
  const sha = 'a'.repeat(64);
  assert.equal(
    slugForImage('Nike Just Do It.jpg', sha),
    `decoded-nike-just-do-it-${sha.slice(0, 8)}`,
  );
  assert.equal(slugForImage('!!!', sha), `decoded-ad-${sha.slice(0, 8)}`);
});

test('Decode module rejects unsupported, empty, and oversized images', async () => {
  const casesDir = await makeTempDir();
  try {
    await assert.rejects(
      () =>
        createDecodeModule(mockModelClient, {
          provider,
          casesDir,
          corpusDir: corpusDirFor(casesDir),
        }).decodeUpload({
          imageBuffer: Buffer.from('x'),
          mimeType: 'application/pdf',
          originalFilename: 'a.pdf',
        }),
      /Unsupported image type/,
    );

    await assert.rejects(
      () =>
        createDecodeModule(mockModelClient, {
          provider,
          casesDir,
          corpusDir: corpusDirFor(casesDir),
        }).decodeUpload({
          imageBuffer: Buffer.alloc(0),
          mimeType: 'image/jpeg',
          originalFilename: 'a.jpg',
        }),
      /Image is empty/,
    );

    await assert.rejects(
      () =>
        createDecodeModule(mockModelClient, {
          provider,
          casesDir,
          corpusDir: corpusDirFor(casesDir),
        }).decodeUpload({
          imageBuffer: Buffer.alloc(21 * 1024 * 1024),
          mimeType: 'image/jpeg',
          originalFilename: 'a.jpg',
        }),
      /Image is too large/,
    );
  } finally {
    await rm(casesDir, { recursive: true, force: true });
  }
});

test('Decode module decodes an upload and persists a Decoded Case', async () => {
  const casesDir = await makeTempDir();
  try {
    const imageBuffer = Buffer.from('fake-image-bytes');

    const result = await createDecodeModule(mockModelClient, {
      provider,
      casesDir,
      corpusDir: corpusDirFor(casesDir),
    }).decodeUpload({
      imageBuffer,
      mimeType: 'image/jpeg',
      originalFilename: 'Test Ad.jpg',
    });

    assert.ok(result.slug.startsWith('decoded-test-ad-'));
    assert.equal(result.decode.schema_version, 'decode-draft.v1');
    assert.equal(result.decode.asset.path, `${casesDir}/${result.slug}/asset.jpg`);

    const draftStat = await stat(join(casesDir, result.slug, 'draft.json'));
    const assetStat = await stat(join(casesDir, result.slug, 'asset.jpg'));
    assert.ok(draftStat.isFile());
    assert.ok(assetStat.isFile());

    const persisted = JSON.parse(await readFile(join(casesDir, result.slug, 'draft.json'), 'utf8'));
    assert.equal(persisted.draft_id, result.decode.draft_id);
  } finally {
    await rm(casesDir, { recursive: true, force: true });
  }
});

test('Decode module decodes a Pending Case through the same orchestration seam', async () => {
  const casesDir = await makeTempDir();
  try {
    const { createCaseLibrary } = await import('../src/cases/case-library.js');
    const library = createCaseLibrary(casesDir);
    await library.admitPendingCase({
      case_id: 'real-pending-case',
      image_buffer: Buffer.from('pending-image-bytes'),
      extension: '.jpg',
      summary: 'Pending advertisement',
    });

    const result = await createDecodeModule(mockModelClient, {
      provider,
      library,
      corpusDir: corpusDirFor(casesDir),
    }).decodePending('real-pending-case');
    const entry = await library.getCase('real-pending-case');

    assert.equal(result.slug, 'real-pending-case');
    assert.equal(entry?.status, 'decoded');
    assert.equal(entry?.decode?.draft_id, result.decode.draft_id);
  } finally {
    await rm(casesDir, { recursive: true, force: true });
  }
});

test('parseDecodeRequest validates the JSON payload', () => {
  const payload = parseDecodeRequest(
    JSON.stringify({ base64: 'Zm9v', mime_type: 'image/png', filename: 'a.png' }),
  );
  assert.equal(payload.base64, 'Zm9v');
  assert.equal(payload.mime_type, 'image/png');
  assert.equal(payload.filename, 'a.png');

  assert.throws(() => parseDecodeRequest('not json'), /not valid JSON/);
  assert.throws(() => parseDecodeRequest(JSON.stringify({ filename: 'x' })), /missing "base64"/);
});

async function listenLocally(server: ReturnType<typeof createDecodeServer>): Promise<boolean> {
  return new Promise<boolean>((resolveListen, rejectListen) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      if (error.code === 'EPERM') resolveListen(false);
      else rejectListen(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolveListen(true);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

test('decode server POST /api/decode and GET /health', async (context) => {
  const casesDir = await makeTempDir();
  const server = createDecodeServer(mockModelClient, {
    casesDir,
    corpusDir: corpusDirFor(casesDir),
  });

  if (!(await listenLocally(server))) {
    context.skip('Local socket binding is not permitted in this execution sandbox.');
    await rm(casesDir, { recursive: true, force: true });
    return;
  }
  const { port } = server.address() as AddressInfo;

  try {
    const health = await requestJson<{ ok: boolean }>(port, '/health');
    assert.equal(health.status, 200);

    const response = await requestJson<{
      slug: string;
      compatibility_case_id: string;
      decode: { schema_version: string };
    }>(port, '/api/decode', {
      base64: Buffer.from('fake-image-bytes').toString('base64'),
      mime_type: 'image/jpeg',
      filename: 'Server Ad.jpg',
    });
    assert.equal(response.status, 200);
    const body = response.body;
    assert.ok(body.slug.startsWith('ad_'));
    assert.ok(body.compatibility_case_id.startsWith('decoded-server-ad-'));
    assert.equal(body.decode.schema_version, 'decode-draft.v1');

    // The case landed on disk.
    const draftStat = await stat(join(casesDir, body.compatibility_case_id, 'draft.json'));
    assert.ok(draftStat.isFile());

    // Bad request surfaces a 400/500 with an error message.
    const bad = await requestJson<{ error: string }>(port, '/api/decode', {});
    assert.equal(bad.status, 500);
    const badBody = bad.body;
    assert.match(badBody.error, /missing "base64"/);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await rm(casesDir, { recursive: true, force: true });
  }
});

test('decode server list + detail endpoints round-trip a decoded case', async (context) => {
  const casesDir = await makeTempDir();
  const server = createDecodeServer(mockModelClient, {
    casesDir,
    corpusDir: corpusDirFor(casesDir),
  });

  if (!(await listenLocally(server))) {
    context.skip('Local socket binding is not permitted in this execution sandbox.');
    await rm(casesDir, { recursive: true, force: true });
    return;
  }
  const { port } = server.address() as AddressInfo;

  try {
    const decodeResponse = await requestJson<{ slug: string }>(port, '/api/decode', {
      base64: Buffer.from('roundtrip-image').toString('base64'),
      mime_type: 'image/jpeg',
      filename: 'Roundtrip Ad.jpg',
    });
    assert.equal(decodeResponse.status, 200);
    const decoded = decodeResponse.body;
    const slug = decoded.slug;

    const listResponse = await requestJson<{
      cases: Array<{ slug: string; claim_count: number; evidence_count: number }>;
    }>(port, '/api/cases');
    assert.equal(listResponse.status, 200);
    const list = listResponse.body;
    assert.ok(list.cases.some((entry) => entry.slug === slug));

    const detailResponse = await requestJson<{
      slug: string;
      asset_mime: string;
      asset_base64: string;
      decode: { schema_version: string };
    }>(port, `/api/cases/${slug}`);
    assert.equal(detailResponse.status, 200);
    const detail = detailResponse.body;
    assert.equal(detail.slug, slug);
    assert.equal(detail.asset_mime, 'image/jpeg');
    assert.ok(detail.asset_base64.length > 0);
    assert.equal(detail.decode.schema_version, 'decode-draft.v1');

    const missing = await requestJson<{ error: string }>(port, '/api/cases/decoded-nope');
    assert.equal(missing.status, 404);

    const traversal = await requestJson<{ error: string }>(port, '/api/cases/..%2Foutside');
    assert.equal(traversal.status, 404);
  } finally {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await rm(casesDir, { recursive: true, force: true });
  }
});
