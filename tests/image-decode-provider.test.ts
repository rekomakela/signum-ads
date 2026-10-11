import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

import type { DraftAsset } from '../src/contracts/decode-draft-v1.js';
import { decodeImage, buildImageDecodeDraft } from '../src/providers/image-decode-provider.js';
import { mockModelClient } from '../src/providers/mock-model-client.js';
import type { StructuredDecode } from '../src/providers/model-client.js';
import {
  createControlledVocabularyRegistry,
  type ControlledVocabularySnapshot,
} from '../src/references/controlled-vocabulary-registry.js';
import { validateDecodeDraftV1 } from '../src/validation/decode-draft-validator.js';

const REPO_ROOT = resolve(process.cwd());

async function readRepoJson<T>(relativePath: string): Promise<T> {
  const contents = await readFile(resolve(REPO_ROOT, relativePath), 'utf8');
  return JSON.parse(contents) as T;
}

const registryPromise = readRepoJson<ControlledVocabularySnapshot>(
  'src/reference-vocabulary/controlled-vocabulary.v1.json',
).then((snapshot) => createControlledVocabularyRegistry(snapshot));

const asset: DraftAsset = {
  asset_id: 'test-ad',
  media_type: 'image',
  path: 'cases/test-ad/asset.jpg',
  sha256: 'a'.repeat(64),
};

const provider = {
  provider_id: 'signum.test-vlm',
  provider_name: 'Signum test VLM',
  provider_version: '1.0.0',
  generated_at: '2026-08-15T00:00:00.000Z',
};

test('decodeImage maps a mock model decode into a valid decode-draft.v1 envelope', async () => {
  const draft = await decodeImage(mockModelClient, {
    asset,
    image: { mime_type: 'image/jpeg', base64: 'Zm9v' },
    provider,
  });

  assert.equal(draft.schema_version, 'decode-draft.v1');
  assert.equal(draft.draft_id, `draft_vlm_${'a'.repeat(16)}`);
  assert.equal(draft.provider.deterministic, false);

  // Evidence records are assigned stable IDs and normalized types/confidence.
  assert.deepEqual(
    draft.evidence_records.map((record) => record.evidence_id),
    ['evidence_001', 'evidence_002', 'evidence_003'],
  );
  assert.deepEqual(
    draft.evidence_records.map((record) => record.evidence_type),
    ['visual', 'copy', 'visual'],
  );
  assert.deepEqual(
    draft.evidence_records.map((record) => record.confidence),
    ['high', 'medium', 'medium'],
  );

  // Claims map kind, evidence indices -> evidence IDs, and references.
  const claims = draft.proposed_decode.interpretive_claims;
  assert.equal(claims.length, 2);
  assert.equal(claims[0]?.kind, 'core_message');
  assert.deepEqual(
    claims[0]?.evidence_references.map((reference) => reference.evidence_id),
    ['evidence_001', 'evidence_002'],
  );
  assert.equal(claims[0]?.references[0]?.reference_type, 'glossary_concept');
  assert.equal(claims[0]?.references[1]?.reference_type, 'persuasion_technique');

  // Unknown claim kind is normalized; out-of-range evidence index is dropped;
  // a non-catalog reference type is normalized to glossary_concept.
  assert.equal(claims[1]?.kind, 'interpretation');
  assert.deepEqual(claims[1]?.evidence_references, []);
  assert.equal(claims[1]?.references[0]?.reference_type, 'glossary_concept');
});

test('buildImageDecodeDraft is deterministic for a fixed timestamp and input', () => {
  const structured: StructuredDecode = {
    summary: 's',
    observations: [],
    claims: [],
  };

  const first = buildImageDecodeDraft(
    structured,
    { asset, image: { mime_type: 'image/jpeg', base64: 'x' }, provider },
    '2026-08-15T00:00:00.000Z',
  );
  const second = buildImageDecodeDraft(
    structured,
    { asset, image: { mime_type: 'image/jpeg', base64: 'x' }, provider },
    '2026-08-15T00:00:00.000Z',
  );

  assert.deepEqual(first, second);
});

test('decodeImage rejects structurally invalid model output before callers can persist it', async () => {
  const invalidClient = {
    async analyzeImage() {
      return { summary: '', observations: [], claims: [] };
    },
  };

  await assert.rejects(
    () =>
      decodeImage(invalidClient, {
        asset,
        image: { mime_type: 'image/jpeg', base64: 'Zm9v' },
        provider,
      }),
    /Model produced an invalid decode/,
  );
});

test('a mock-generated draft validates successfully (unresolved refs are warnings only)', async () => {
  const draft = await decodeImage(mockModelClient, {
    asset,
    image: { mime_type: 'image/jpeg', base64: 'Zm9v' },
    provider,
  });
  const registry = await registryPromise;

  const result = validateDecodeDraftV1(draft, { reference_registry: registry });

  assert.equal(result.valid, true);
});
