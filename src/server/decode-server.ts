import { createServer, type Server } from 'node:http';

import { createCaseLibrary } from '../cases/case-library.js';
import { createDecodeModule } from '../decode/decode-module.js';
import { readCorpusAssetImage } from '../corpus/corpus-asset-io.js';
import { createCorpusStore } from '../corpus/corpus-store.js';
import type { ImageDecodeProviderOptions } from '../providers/image-decode-provider.js';
import { createLlamaServerClient } from '../providers/llama-server-client.js';
import type { ModelClient } from '../providers/model-client.js';

export const DEFAULT_PROVIDER: ImageDecodeProviderOptions = {
  provider_id: 'signum.local-vlm',
  provider_name: 'Signum local VLM (Qwen3.8-27B)',
  provider_version: '1.0.0',
};

export interface DecodeRequestPayload {
  base64: string;
  mime_type: string;
  filename: string;
  reanalyze: boolean;
}

/**
 * Parse and validate the JSON request body the frontend posts. Kept separate
 * so it is unit-testable without a socket.
 */
export function parseDecodeRequest(raw: string): DecodeRequestPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Request body is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Request body must be a JSON object.');
  }

  const record = parsed as Record<string, unknown>;
  const base64 = typeof record.base64 === 'string' ? record.base64 : '';
  if (base64 === '') {
    throw new Error('Request body is missing "base64" image data.');
  }

  return {
    base64,
    mime_type: typeof record.mime_type === 'string' ? record.mime_type : 'image/jpeg',
    filename: typeof record.filename === 'string' ? record.filename : 'ad',
    reanalyze: record.reanalyze === true,
  };
}

export interface DecodeServerOptions {
  maxBodyBytes?: number;
  casesDir?: string;
  corpusDir?: string;
  provider?: ImageDecodeProviderOptions;
}

/**
 * A tiny local HTTP server exposing:
 *   - POST /api/decode          decode one image and persist it as a case
 *   - GET  /api/cases           list machine-decoded cases
 *   - GET  /api/cases/:slug     read a Decoded Case (Decode + Asset)
 *   - GET  /health              liveness
 * The client is injectable so tests can pass the mock; production uses the
 * llama-server client.
 */
export function createDecodeServer(
  client: ModelClient = createLlamaServerClient(),
  options: DecodeServerOptions = {},
): Server {
  const maxBodyBytes = options.maxBodyBytes ?? 50 * 1024 * 1024;
  const casesDir = options.casesDir ?? 'cases';
  const provider = options.provider ?? DEFAULT_PROVIDER;
  const library = createCaseLibrary(casesDir);
  const corpus = createCorpusStore(options.corpusDir ?? '.state/corpus-v0.1');
  const decoder = createDecodeModule(client, {
    provider,
    library,
    corpusStore: corpus,
  });

  return createServer(async (request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      if (request.method === 'GET' && request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (request.method === 'GET' && request.url === '/api/cases') {
        const [advertisements, revisions] = await Promise.all([
          corpus.listAdvertisements(),
          corpus.listDecodeRevisions(),
        ]);
        const revisionById = new Map(revisions.map((revision) => [revision.revision_id, revision]));
        const cases = advertisements.flatMap((advertisement) => {
          const revision = advertisement.decode_revision_ids
            .map((id) => revisionById.get(id))
            .filter((item) => item !== undefined)
            .sort((a, b) =>
              a.generated_at === b.generated_at
                ? a.revision_id.localeCompare(b.revision_id)
                : a.generated_at.localeCompare(b.generated_at),
            )
            .at(-1);
          if (!revision) return [];
          const decode = revision.legacy_payload as typeof revision.legacy_payload & {
            proposed_decode: { summary: string; interpretive_claims: readonly unknown[] };
            evidence_records: readonly unknown[];
          };
          return [
            {
              slug: advertisement.advertisement_id,
              advertisement_id: advertisement.advertisement_id,
              compatibility_case_id: revision.source_case_id,
              summary: decode.proposed_decode.summary,
              claim_count: decode.proposed_decode.interpretive_claims.length,
              evidence_count: decode.evidence_records.length,
            },
          ];
        });
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ cases }));
        return;
      }

      if (request.method === 'GET' && request.url?.startsWith('/api/cases/')) {
        const slug = decodeURIComponent(request.url.slice('/api/cases/'.length));
        const advertisement = await corpus.readAdvertisement(slug);
        if (advertisement === null) throw new Error(`No decoded Advertisement named "${slug}".`);
        const revisions = await Promise.all(
          advertisement.decode_revision_ids.map((id) => corpus.readDecodeRevision(id)),
        );
        const revision = revisions
          .filter((item) => item !== null)
          .sort((a, b) =>
            a.generated_at === b.generated_at
              ? a.revision_id.localeCompare(b.revision_id)
              : a.generated_at.localeCompare(b.generated_at),
          )
          .at(-1);
        if (!revision) throw new Error(`No decoded Advertisement named "${slug}".`);
        let assetBytes: Buffer;
        let assetMime: string;
        if (revision.source_case_id !== null) {
          const asset = await library.readAsset(revision.source_case_id);
          assetBytes = asset.bytes;
          assetMime = asset.mime_type;
        } else {
          const assetRecord = await corpus.readAsset(revision.asset_id);
          if (assetRecord === null) {
            throw new Error(
              `DecodeRevision ${revision.revision_id} references missing Asset ${revision.asset_id}.`,
            );
          }
          const asset = await readCorpusAssetImage(corpus, assetRecord);
          assetBytes = asset.bytes;
          assetMime = asset.mime_type;
        }
        const detail = {
          slug,
          advertisement_id: advertisement.advertisement_id,
          compatibility_case_id: revision.source_case_id,
          decode_revision_id: revision.revision_id,
          decode: revision.legacy_payload,
          asset_base64: assetBytes.toString('base64'),
          asset_mime: assetMime,
        };
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(detail));
        return;
      }

      if (request.method === 'POST' && request.url === '/api/decode') {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of request) {
          const buffer = chunk as Buffer;
          size += buffer.length;
          if (size > maxBodyBytes) {
            throw new Error('Request body too large.');
          }
          chunks.push(buffer);
        }

        const payload = parseDecodeRequest(Buffer.concat(chunks).toString('utf8'));
        const result = await decoder.decodeUpload({
          imageBuffer: Buffer.from(payload.base64, 'base64'),
          mimeType: payload.mime_type,
          originalFilename: payload.filename,
          reanalyze: payload.reanalyze,
        });

        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            slug: result.advertisement_id,
            compatibility_case_id: result.slug,
            advertisement_id: result.advertisement_id,
            decode_revision_id: result.decode_revision_id,
            analysis_key: result.analysis_key,
            cache_hit: result.cache_hit,
            decode: result.decode,
          }),
        );
        return;
      }

      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found.' }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isNotFound =
        message.startsWith('No decoded Advertisement named') ||
        message.startsWith('Invalid corpus record id') ||
        message.startsWith('Invalid Case id');
      response.writeHead(isNotFound ? 404 : 500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: message }));
    }
  });
}
