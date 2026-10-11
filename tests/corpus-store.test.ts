import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  CORPUS_RECORD_VERSION,
  UNKNOWN_TEMPORAL_EXTENT,
  type AdvertisementRecord,
  type AssetRecord,
} from '../src/corpus/corpus-records.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';

async function makeStore() {
  return createCorpusStore(await mkdtemp(join(tmpdir(), 'signum-corpus-store-')));
}

test('Corpus Store represents one Advertisement with multiple Assets', async () => {
  const store = await makeStore();
  const assets: AssetRecord[] = [
    {
      schema_version: CORPUS_RECORD_VERSION,
      asset_id: 'asset_scan',
      media_type: 'image',
      sha256: 'a'.repeat(64),
      legacy_paths: ['scan.jpg'],
      acquisition_source_ids: [],
    },
    {
      schema_version: CORPUS_RECORD_VERSION,
      asset_id: 'asset_web',
      media_type: 'image',
      sha256: 'b'.repeat(64),
      legacy_paths: ['web.jpg'],
      acquisition_source_ids: [],
    },
  ];
  for (const asset of assets) await store.putAsset(asset);
  const advertisement: AdvertisementRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    advertisement_id: 'ad_multi_asset',
    asset_ids: assets.map((asset) => asset.asset_id),
    brand_ids: [],
    product_ids: [],
    campaign_ids: [],
    placement_ids: [],
    market_ids: [],
    temporal: UNKNOWN_TEMPORAL_EXTENT,
    acquisition_source_ids: [],
    metadata_assertion_ids: [],
    decode_revision_ids: [],
    legacy_case_ids: [],
  };
  await store.putAdvertisement(advertisement);

  assert.deepEqual((await store.readAdvertisement('ad_multi_asset'))?.asset_ids, [
    'asset_scan',
    'asset_web',
  ]);
});

test('Corpus Store refuses to silently replace an immutable record', async () => {
  const store = await makeStore();
  const asset: AssetRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    asset_id: 'asset_conflict',
    media_type: 'image',
    sha256: 'c'.repeat(64),
    legacy_paths: ['one.jpg'],
    acquisition_source_ids: [],
  };
  await store.putAsset(asset);
  await store.putAsset(asset);

  await assert.rejects(
    () => store.putAsset({ ...asset, legacy_paths: ['different.jpg'] }),
    /immutable records cannot be replaced/,
  );
});

test('Corpus Store promotes unknown Advertisement temporal metadata with append-only assertion evidence', async () => {
  const store = await makeStore();
  const advertisement: AdvertisementRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    advertisement_id: 'ad_temporal_promote',
    asset_ids: [],
    brand_ids: [],
    product_ids: [],
    campaign_ids: [],
    placement_ids: [],
    market_ids: [],
    temporal: UNKNOWN_TEMPORAL_EXTENT,
    acquisition_source_ids: [],
    metadata_assertion_ids: [],
    decode_revision_ids: [],
    legacy_case_ids: [],
  };
  await store.putAdvertisement(advertisement);
  const temporal = {
    start_year: 1930,
    end_year: 1930,
    precision: 'year' as const,
    start_date: null,
    end_date: null,
  };
  const promoted = {
    ...advertisement,
    temporal,
    metadata_assertion_ids: ['assertion_temporal_1930'],
  };
  await store.promoteAdvertisementMetadata(promoted);
  await store.promoteAdvertisementMetadata(promoted);
  assert.deepEqual(await store.readAdvertisement(advertisement.advertisement_id), promoted);
});

test('Corpus Store refuses temporal promotion without new assertion evidence', async () => {
  const store = await makeStore();
  const advertisement: AdvertisementRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    advertisement_id: 'ad_temporal_no_assertion',
    asset_ids: [],
    brand_ids: [],
    product_ids: [],
    campaign_ids: [],
    placement_ids: [],
    market_ids: [],
    temporal: UNKNOWN_TEMPORAL_EXTENT,
    acquisition_source_ids: [],
    metadata_assertion_ids: [],
    decode_revision_ids: [],
    legacy_case_ids: [],
  };
  await store.putAdvertisement(advertisement);
  await assert.rejects(
    () =>
      store.promoteAdvertisementMetadata({
        ...advertisement,
        temporal: {
          start_year: 1940,
          end_year: 1940,
          precision: 'year',
          start_date: null,
          end_date: null,
        },
      }),
    /requires a new metadata assertion reference/,
  );
});

test('Corpus Store refuses to replace already-known Advertisement temporal metadata', async () => {
  const store = await makeStore();
  const advertisement: AdvertisementRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    advertisement_id: 'ad_temporal_known',
    asset_ids: [],
    brand_ids: [],
    product_ids: [],
    campaign_ids: [],
    placement_ids: [],
    market_ids: [],
    temporal: {
      start_year: 1930,
      end_year: 1930,
      precision: 'year',
      start_date: null,
      end_date: null,
    },
    acquisition_source_ids: [],
    metadata_assertion_ids: ['assertion_temporal_1930'],
    decode_revision_ids: [],
    legacy_case_ids: [],
  };
  await store.putAdvertisement(advertisement);
  await assert.rejects(
    () =>
      store.promoteAdvertisementMetadata({
        ...advertisement,
        temporal: {
          start_year: 1931,
          end_year: 1931,
          precision: 'year',
          start_date: null,
          end_date: null,
        },
        metadata_assertion_ids: [
          ...advertisement.metadata_assertion_ids,
          'assertion_temporal_1931',
        ],
      }),
    /can only be promoted from unknown/,
  );
});
