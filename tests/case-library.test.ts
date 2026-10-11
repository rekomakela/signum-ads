import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { createCaseLibrary } from '../src/cases/case-library.js';
import type { DecodeDraftV1, DraftAsset } from '../src/contracts/decode-draft-v1.js';

async function makeLibrary(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  return createCaseLibrary(join(root, 'cases'));
}

function makeDecode(asset: DraftAsset, id = 'draft_case'): DecodeDraftV1 {
  return {
    schema_version: 'decode-draft.v1',
    draft_id: id,
    asset,
    provider: {
      provider_id: 'test.provider',
      provider_name: 'Test provider',
      provider_version: '1.0.0',
      generated_at: '2026-08-29T00:00:00.000Z',
      deterministic: true,
    },
    raw_provider_output: {},
    evidence_records: [],
    proposed_decode: {
      summary: 'Synthetic decode.',
      interpretive_claims: [],
    },
  };
}

test('Case Library describes assets with stable identity and library-owned paths', async () => {
  const library = await makeLibrary('signum-case-library-describe-');
  const bytes = Buffer.from('image bytes');

  const asset = library.describeAsset('case-alpha', bytes, 'jpg');

  assert.equal(asset.asset_id, 'asset_case-alpha');
  assert.equal(asset.path, `${library.cases_dir}/case-alpha/asset.jpg`);
  assert.match(asset.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(asset, library.describeAsset('case-alpha', bytes, '.jpg'));
});

test('Case Library admits and lists a Pending Case', async () => {
  const library = await makeLibrary('signum-case-library-pending-');

  const admitted = await library.admitPendingCase({
    case_id: 'case-pending',
    image_buffer: Buffer.from('pending image'),
    extension: '.png',
    summary: 'Pending advertisement',
    source_url: 'https://example.test/ad',
  });

  assert.equal(admitted.status, 'pending');
  assert.equal(admitted.metadata?.summary, 'Pending advertisement');
  assert.equal(admitted.decode, null);
  assert.deepEqual(
    (await library.listCases()).map((entry) => entry.case_id),
    ['case-pending'],
  );
});

test('Case Library admits a Decoded Case and reads its Asset', async () => {
  const library = await makeLibrary('signum-case-library-decoded-');
  const image = Buffer.from('decoded image');
  const asset = library.describeAsset('case-decoded', image, '.webp');
  const decode = makeDecode(asset, 'decode_case_decoded');

  const admitted = await library.admitDecodedCase({
    case_id: 'case-decoded',
    image_buffer: image,
    extension: '.webp',
    decode,
  });
  const storedAsset = await library.readAsset('case-decoded');

  assert.equal(admitted.status, 'decoded');
  assert.equal(admitted.decode?.draft_id, 'decode_case_decoded');
  assert.equal(storedAsset.mime_type, 'image/webp');
  assert.deepEqual(storedAsset.bytes, image);
});

test('Case Library transitions a Pending Case to Decoded without rewriting its Asset', async () => {
  const library = await makeLibrary('signum-case-library-transition-');
  const image = Buffer.from('transition image');
  const pending = await library.admitPendingCase({
    case_id: 'case-transition',
    image_buffer: image,
    extension: '.jpg',
    summary: 'Transition advertisement',
  });
  const decode = makeDecode(pending.metadata!.asset, 'decode_case_transition');

  const decoded = await library.saveDecode('case-transition', decode);

  assert.equal(decoded.status, 'decoded');
  assert.equal(decoded.metadata?.summary, 'Transition advertisement');
  assert.equal(decoded.decode?.draft_id, 'decode_case_transition');
});

test('Case Library rejects a Decode that points at a different Asset', async () => {
  const library = await makeLibrary('signum-case-library-mismatch-');
  await library.admitPendingCase({
    case_id: 'case-mismatch',
    image_buffer: Buffer.from('expected image'),
    extension: '.jpg',
    summary: 'Mismatch advertisement',
  });
  const wrongAsset: DraftAsset = {
    asset_id: 'asset_other',
    media_type: 'image',
    path: resolve(library.cases_dir, 'other', 'asset.jpg'),
    sha256: 'a'.repeat(64),
  };

  await assert.rejects(
    () => library.saveDecode('case-mismatch', makeDecode(wrongAsset)),
    /does not match Case/,
  );
});

test('Case Library refuses to replace the Asset of an already-Decoded Case', async () => {
  const library = await makeLibrary('signum-case-library-reingest-');
  const original = Buffer.from('original image');
  const asset = library.describeAsset('case-reingest', original, '.jpg');
  await library.admitDecodedCase({
    case_id: 'case-reingest',
    image_buffer: original,
    extension: '.jpg',
    decode: makeDecode(asset, 'decode_case_reingest'),
  });

  await assert.rejects(
    () =>
      library.admitPendingCase({
        case_id: 'case-reingest',
        image_buffer: Buffer.from('different image'),
        extension: '.jpg',
        summary: 'Reingested advertisement',
      }),
    /Cannot replace the Asset of Decoded Case/,
  );
});

test('Case Library rejects Case ids that escape the library root', async () => {
  const library = await makeLibrary('signum-case-library-path-');

  await assert.rejects(
    () =>
      library.admitPendingCase({
        case_id: '../escape',
        image_buffer: Buffer.from('escape'),
        extension: '.jpg',
        summary: 'Escape attempt',
      }),
    /Invalid Case id/,
  );
  await assert.rejects(() => library.getCase('../../outside'), /Invalid Case id/);
});

test('Case Library refuses stored Asset paths outside the Case directory', async () => {
  const library = await makeLibrary('signum-case-library-asset-escape-');
  const caseId = 'case-asset-escape';
  const caseDir = join(library.cases_dir, caseId);
  await mkdir(caseDir, { recursive: true });
  await writeFile(
    join(caseDir, 'manifest.json'),
    JSON.stringify({
      manifest_id: caseId,
      asset: {
        asset_id: `asset_${caseId}`,
        media_type: 'image',
        path: join(library.cases_dir, '..', 'outside.jpg'),
        sha256: 'a'.repeat(64),
      },
      summary: 'Malicious asset path',
    }),
  );

  await assert.rejects(() => library.readAsset(caseId), /escapes its Case directory/);
});
