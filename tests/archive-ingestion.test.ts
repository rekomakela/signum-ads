import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  ingestArchiveBatch,
  inspectArchiveBatch,
  type ArchiveIngestionItem,
} from '../src/corpus/archive-ingestion.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';

async function fixture(bytes: string, name = 'ad.bin') {
  const root = await mkdtemp(join(tmpdir(), 'signum-archive-ingest-'));
  const assetPath = join(root, name);
  await writeFile(assetPath, Buffer.from(bytes));
  return {
    root,
    assetPath,
    store: createCorpusStore(join(root, 'corpus')),
  };
}

function item(
  advertisementId: string,
  assetPath: string,
  acquisitionKey: string,
): ArchiveIngestionItem {
  return {
    advertisement_id: advertisementId,
    asset_path: assetPath,
    acquisition_key: acquisitionKey,
    acquisition_kind: 'web',
    source_url: `https://example.test/${acquisitionKey}`,
    source_title: acquisitionKey,
  };
}

test('archive ingestion persists an undecoded Advertisement and durable Asset blob', async () => {
  const fx = await fixture('one-ad');
  const result = await ingestArchiveBatch(fx.store, [
    item('ad_reviewed_one', fx.assetPath, 'source-one'),
  ]);

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.status, 'created');
  const advertisement = await fx.store.readAdvertisement('ad_reviewed_one');
  assert.ok(advertisement);
  assert.deepEqual(advertisement.decode_revision_ids, []);
  assert.deepEqual(advertisement.legacy_case_ids, []);
  assert.equal(advertisement.acquisition_source_ids.length, 1);

  const asset = await fx.store.readAsset(advertisement.asset_ids[0]!);
  assert.ok(asset?.storage_path);
  assert.equal((await readFile(join(fx.store.root, asset.storage_path))).toString(), 'one-ad');

  const acquisition = (await fx.store.listAcquisitionSources())[0];
  assert.equal(acquisition?.legacy_case_id, null);
  assert.equal(acquisition?.source_url, 'https://example.test/source-one');
  assert.deepEqual(
    (await fx.store.listRelationships()).map((relationship) => relationship.relation).sort(),
    ['acquired_from', 'has_asset'],
  );
});

test('repeat ingestion of the same reviewed Advertisement is idempotent', async () => {
  const fx = await fixture('same-ad');
  const input = item('ad_reviewed_same', fx.assetPath, 'source-same');
  const first = await ingestArchiveBatch(fx.store, [input]);
  const second = await ingestArchiveBatch(fx.store, [input]);

  assert.equal(first.results[0]?.status, 'created');
  assert.equal(second.results[0]?.status, 'unchanged');
  assert.equal((await fx.store.listAdvertisements()).length, 1);
  assert.equal((await fx.store.listAssets()).length, 1);
  assert.equal((await fx.store.listAcquisitionSources()).length, 1);
});

test('exact Asset identity never silently merges distinct reviewed Advertisement identities', async () => {
  const fx = await fixture('duplicate-bytes');
  await ingestArchiveBatch(fx.store, [item('ad_reviewed_alpha', fx.assetPath, 'source-alpha')]);

  await assert.rejects(
    () => ingestArchiveBatch(fx.store, [item('ad_reviewed_beta', fx.assetPath, 'source-beta')]),
    /Advertisement identity is ambiguous.*ad_reviewed_alpha, ad_reviewed_beta/,
  );
  assert.equal((await fx.store.listAdvertisements()).length, 1);
});

test('batch preflight fails before writes when the same bytes have two reviewed Advertisement ids', async () => {
  const fx = await fixture('batch-duplicate');
  await assert.rejects(
    () =>
      ingestArchiveBatch(fx.store, [
        item('ad_reviewed_b', fx.assetPath, 'source-b'),
        item('ad_reviewed_a', fx.assetPath, 'source-a'),
      ]),
    /Advertisement identity is ambiguous.*ad_reviewed_a, ad_reviewed_b/,
  );
  assert.equal((await fx.store.listAdvertisements()).length, 0);
  assert.equal((await fx.store.listAssets()).length, 0);
  assert.equal((await fx.store.listAcquisitionSources()).length, 0);
});

test('duplicate candidate inspection is deterministic and does not mutate the store', async () => {
  const fx = await fixture('candidate-bytes');
  const candidates = await inspectArchiveBatch(fx.store, [
    item('ad_reviewed_z', fx.assetPath, 'source-z'),
    item('ad_reviewed_a', fx.assetPath, 'source-a'),
  ]);

  assert.equal(candidates.length, 1);
  assert.deepEqual(candidates[0]?.advertisement_ids, []);
  assert.deepEqual(candidates[0]?.incoming_advertisement_ids, ['ad_reviewed_a', 'ad_reviewed_z']);
  assert.equal((await fx.store.listAdvertisements()).length, 0);
});

test('archive ingestion refuses immutable archival metadata drift', async () => {
  const fx = await fixture('metadata-ad');
  await ingestArchiveBatch(fx.store, [
    {
      ...item('ad_reviewed_metadata', fx.assetPath, 'metadata-source'),
      brand_ids: ['brand_one'],
    },
  ]);

  await assert.rejects(
    () =>
      ingestArchiveBatch(fx.store, [
        {
          ...item('ad_reviewed_metadata', fx.assetPath, 'metadata-source'),
          brand_ids: ['brand_two'],
        },
      ]),
    /cannot change immutable Advertisement field brand_ids/,
  );
});
