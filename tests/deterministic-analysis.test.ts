import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createCorpusStore } from '../src/corpus/corpus-store.js';
import { createAnalysisIdentity } from '../src/decode/analysis-identity.js';
import { createDecodeModule } from '../src/decode/decode-module.js';
import type { ModelClient } from '../src/providers/model-client.js';
import { mockModelClient } from '../src/providers/mock-model-client.js';

const provider = {
  provider_id: 'signum.test',
  provider_name: 'Signum test model',
  provider_version: '1',
  generated_at: '2026-08-29T00:00:00.000Z',
};

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'signum-deterministic-analysis-'));
  return {
    casesDir: join(root, 'cases'),
    corpusDir: join(root, 'corpus'),
  };
}

function countingClient(counter: { calls: number }): ModelClient {
  return {
    async analyzeImage(input) {
      counter.calls += 1;
      return mockModelClient.analyzeImage(input);
    },
  };
}

test('analysis identity excludes generation time but changes with provider version', () => {
  const first = createAnalysisIdentity('a'.repeat(64), provider);
  const laterTimestamp = createAnalysisIdentity('a'.repeat(64), {
    ...provider,
    generated_at: '2030-01-01T00:00:00.000Z',
  });
  const changedModel = createAnalysisIdentity('a'.repeat(64), {
    ...provider,
    provider_version: '2',
  });

  assert.equal(first.analysis_key, laterTimestamp.analysis_key);
  assert.notEqual(first.analysis_key, changedModel.analysis_key);
});

test('same Asset and analysis identity reuses one persisted revision without inference', async () => {
  const { casesDir, corpusDir } = await setup();
  const counter = { calls: 0 };
  const decoder = createDecodeModule(countingClient(counter), { provider, casesDir, corpusDir });
  const input = {
    imageBuffer: Buffer.from('deterministic advertisement'),
    mimeType: 'image/png',
    originalFilename: 'deterministic.png',
  };

  const first = await decoder.decodeUpload(input);
  const second = await decoder.decodeUpload(input);

  assert.equal(counter.calls, 1);
  assert.equal(second.cache_hit, true);
  assert.equal(second.advertisement_id, first.advertisement_id);
  assert.equal(second.decode_revision_id, first.decode_revision_id);
  assert.equal(second.analysis_key, first.analysis_key);
  assert.equal((await createCorpusStore(corpusDir).listDecodeRevisions()).length, 1);
});

test('concurrent identical requests share the same inference and revision', async () => {
  const { casesDir, corpusDir } = await setup();
  const counter = { calls: 0 };
  const decoder = createDecodeModule(countingClient(counter), { provider, casesDir, corpusDir });
  const input = {
    imageBuffer: Buffer.from('concurrent advertisement'),
    mimeType: 'image/jpeg',
    originalFilename: 'concurrent.jpg',
  };

  const [left, right] = await Promise.all([
    decoder.decodeUpload(input),
    decoder.decodeUpload(input),
  ]);

  assert.equal(counter.calls, 1);
  assert.equal(left.decode_revision_id, right.decode_revision_id);
  assert.equal((await createCorpusStore(corpusDir).listAdvertisements()).length, 1);
  assert.equal((await createCorpusStore(corpusDir).listDecodeRevisions()).length, 1);
});

test('provider version change appends a new immutable revision on the same Advertisement', async () => {
  const { casesDir, corpusDir } = await setup();
  const firstCounter = { calls: 0 };
  const secondCounter = { calls: 0 };
  const bytes = Buffer.from('versioned advertisement');
  const input = { imageBuffer: bytes, mimeType: 'image/jpeg', originalFilename: 'versioned.jpg' };
  const firstDecoder = createDecodeModule(countingClient(firstCounter), {
    provider,
    casesDir,
    corpusDir,
  });
  const secondDecoder = createDecodeModule(countingClient(secondCounter), {
    provider: { ...provider, provider_version: '2' },
    casesDir,
    corpusDir,
  });

  const first = await firstDecoder.decodeUpload(input);
  const second = await secondDecoder.decodeUpload(input);
  const revisions = await createCorpusStore(corpusDir).listDecodeRevisions();

  assert.equal(firstCounter.calls, 1);
  assert.equal(secondCounter.calls, 1);
  assert.equal(second.advertisement_id, first.advertisement_id);
  assert.notEqual(second.analysis_key, first.analysis_key);
  assert.notEqual(second.decode_revision_id, first.decode_revision_id);
  assert.equal(revisions.length, 2);
});

test('explicit reanalysis appends a distinct revision and preserves the canonical revision', async () => {
  const { casesDir, corpusDir } = await setup();
  const counter = { calls: 0 };
  const decoder = createDecodeModule(countingClient(counter), { provider, casesDir, corpusDir });
  const input = {
    imageBuffer: Buffer.from('reanalysis advertisement'),
    mimeType: 'image/jpeg',
    originalFilename: 'reanalysis.jpg',
  };

  const canonical = await decoder.decodeUpload(input);
  const reanalysis = await decoder.decodeUpload({ ...input, reanalyze: true });
  const revisions = await createCorpusStore(corpusDir).listDecodeRevisions();

  assert.equal(counter.calls, 2);
  assert.equal(reanalysis.advertisement_id, canonical.advertisement_id);
  assert.equal(reanalysis.analysis_key, canonical.analysis_key);
  assert.notEqual(reanalysis.decode_revision_id, canonical.decode_revision_id);
  assert.equal(revisions.length, 2);
  assert.ok(revisions.some((revision) => revision.analysis_request_key === 'canonical'));
  assert.ok(revisions.some((revision) => revision.analysis_request_key === 'reanalysis:1'));
});

test('persisted canonical analysis remains usable when the analyzer is unavailable', async () => {
  const { casesDir, corpusDir } = await setup();
  const bytes = Buffer.from('offline archive advertisement');
  const input = { imageBuffer: bytes, mimeType: 'image/png', originalFilename: 'offline.png' };
  const first = await createDecodeModule(mockModelClient, {
    provider,
    casesDir,
    corpusDir,
  }).decodeUpload(input);
  const unavailable: ModelClient = {
    async analyzeImage() {
      throw new Error('analyzer unavailable');
    },
  };
  const offlineDecoder = createDecodeModule(unavailable, { provider, casesDir, corpusDir });

  const cached = await offlineDecoder.decodeUpload(input);

  assert.equal(cached.cache_hit, true);
  assert.equal(cached.decode_revision_id, first.decode_revision_id);
  assert.equal(cached.advertisement_id, first.advertisement_id);
});
