import assert from 'node:assert/strict';
import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { ingestArchiveBatch } from '../src/corpus/archive-ingestion.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';
import { createDecodeModule } from '../src/decode/decode-module.js';
import { buildSignumFrontendArtifacts } from '../src/frontend/signum-workbench-data.js';
import type { ModelClient } from '../src/providers/model-client.js';
import { mockModelClient } from '../src/providers/mock-model-client.js';

const provider = {
  provider_id: 'signum.test.corpus-native',
  provider_name: 'Signum corpus-native test model',
  provider_version: '1',
  generated_at: '2026-08-30T00:00:00.000Z',
};

function png(label: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(label),
  ]);
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'signum-corpus-native-decode-'));
  const corpusDir = join(root, 'corpus');
  const casesDir = join(root, 'cases');
  const source = join(root, 'source.png');
  const bytes = png('archival advertisement');
  await writeFile(source, bytes);
  const store = createCorpusStore(corpusDir);
  await ingestArchiveBatch(store, [
    {
      advertisement_id: 'ad_archival_native',
      asset_path: source,
      acquisition_key: 'commons:12345',
      acquisition_kind: 'web',
      source_url: 'https://commons.wikimedia.org/wiki/File:Example.png',
      source_title: 'Example archival advertisement',
    },
  ]);
  return { root, corpusDir, casesDir, store, bytes };
}

function countingClient(counter: { calls: number }): ModelClient {
  return {
    async analyzeImage(input) {
      counter.calls += 1;
      return mockModelClient.analyzeImage(input);
    },
  };
}

test('corpus-native Advertisement decodes without creating a synthetic Case and reuses canonical analysis', async () => {
  const fx = await setup();
  const counter = { calls: 0 };
  const decoder = createDecodeModule(countingClient(counter), {
    provider,
    casesDir: fx.casesDir,
    corpusDir: fx.corpusDir,
  });

  const first = await decoder.decodeAdvertisement('ad_archival_native');
  const second = await decoder.decodeAdvertisement('ad_archival_native');
  const revision = await fx.store.readDecodeRevision(first.decode_revision_id);

  assert.equal(counter.calls, 1);
  assert.equal(first.cache_hit, false);
  assert.equal(second.cache_hit, true);
  assert.equal(second.decode_revision_id, first.decode_revision_id);
  assert.equal(revision?.source_case_id, null);
  assert.equal(revision?.source_kind, 'corpus_asset');
  assert.equal((await fx.store.listAcquisitionSources()).length, 1);
  assert.equal((await fx.store.listAssets()).length, 1);
  assert.equal((await fx.store.listDecodeRevisions()).length, 1);
  await assert.rejects(() => stat(fx.casesDir), /ENOENT/);

  const unavailable: ModelClient = {
    async analyzeImage() {
      throw new Error('analyzer unavailable');
    },
  };
  const offline = createDecodeModule(unavailable, {
    provider,
    casesDir: fx.casesDir,
    corpusDir: fx.corpusDir,
  });
  const cached = await offline.decodeAdvertisement('ad_archival_native');
  assert.equal(cached.cache_hit, true);
  assert.equal(cached.decode_revision_id, first.decode_revision_id);
});

test('corpus-native explicit reanalysis appends a revision and preserves canonical revision', async () => {
  const fx = await setup();
  const counter = { calls: 0 };
  const decoder = createDecodeModule(countingClient(counter), {
    provider,
    casesDir: fx.casesDir,
    corpusDir: fx.corpusDir,
  });

  const canonical = await decoder.decodeAdvertisement('ad_archival_native');
  const reanalysis = await decoder.decodeAdvertisement('ad_archival_native', { reanalyze: true });
  const revisions = await fx.store.listDecodeRevisions();

  assert.equal(counter.calls, 2);
  assert.notEqual(reanalysis.decode_revision_id, canonical.decode_revision_id);
  assert.equal(reanalysis.advertisement_id, canonical.advertisement_id);
  assert.equal(revisions.length, 2);
  assert.ok(revisions.some((item) => item.analysis_request_key === 'canonical'));
  assert.ok(revisions.some((item) => item.analysis_request_key === 'reanalysis:1'));
  assert.ok(revisions.every((item) => item.source_case_id === null));
});

test('corpus-native decode fails closed when one Asset has ambiguous Advertisement ownership', async () => {
  const fx = await setup();
  const first = await fx.store.readAdvertisement('ad_archival_native');
  assert.ok(first);
  await fx.store.putAdvertisement({ ...first, advertisement_id: 'ad_ambiguous_second' });
  const counter = { calls: 0 };
  const decoder = createDecodeModule(countingClient(counter), {
    provider,
    casesDir: fx.casesDir,
    corpusDir: fx.corpusDir,
  });

  await assert.rejects(
    () => decoder.decodeAdvertisement('ad_archival_native'),
    /ambiguous Advertisement ownership/,
  );
  assert.equal(counter.calls, 0);
});

test('frontend artifacts publish corpus-native Decode from corpus-owned Asset bytes', async () => {
  const fx = await setup();
  const decoded = await createDecodeModule(mockModelClient, {
    provider,
    casesDir: fx.casesDir,
    corpusDir: fx.corpusDir,
  }).decodeAdvertisement('ad_archival_native');

  const artifacts = await buildSignumFrontendArtifacts(fx.casesDir, fx.corpusDir);
  const item = artifacts.dataset.cases.find(
    (candidate) => candidate.advertisement_id === 'ad_archival_native',
  );
  const published = artifacts.assets.find((candidate) =>
    candidate.relative_path.includes('ad_archival_native'),
  );

  assert.equal(item?.compatibility_case_id, null);
  assert.equal(item?.title, 'Example archival advertisement');
  assert.equal(item?.asset.sha256, decoded.decode.asset.sha256);
  assert.equal(item?.asset.src, '/generated/cases/ad_archival_native/asset.png');
  assert.deepEqual(published?.bytes, fx.bytes);
});
