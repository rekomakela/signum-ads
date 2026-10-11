import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { createDecodeModule } from '../src/decode/decode-module.js';
import { resolveAdvertisementIdentity } from '../src/corpus/advertisement-identity-resolver.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';
import { persistDecodeToCorpus } from '../src/corpus/decode-persistence-coordinator.js';
import {
  CORPUS_RECORD_VERSION,
  UNKNOWN_TEMPORAL_EXTENT,
  type AdvertisementRecord,
  type AssetRecord,
} from '../src/corpus/corpus-records.js';
import { assetIdForSha256 } from '../src/corpus/legacy-migration.js';
import { mockModelClient } from '../src/providers/mock-model-client.js';

const provider = {
  provider_id: 'signum.test',
  provider_name: 'Signum test',
  provider_version: '1',
  generated_at: '2026-08-29T00:00:00.000Z',
};

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'signum-corpus-cutover-'));
  const casesDir = join(root, 'cases');
  const corpusDir = join(root, 'corpus');
  return {
    corpusDir,
    store: createCorpusStore(corpusDir),
    decoder: createDecodeModule(mockModelClient, { provider, casesDir, corpusDir }),
  };
}

test('unseen Decode Asset creates an explicit Advertisement and immutable DecodeRevision', async () => {
  const { decoder, store } = await setup();
  const result = await decoder.decodeUpload({
    imageBuffer: Buffer.from('unseen advertisement'),
    mimeType: 'image/png',
    originalFilename: 'unseen.png',
  });

  const advertisement = await store.readAdvertisement(result.advertisement_id);
  assert.deepEqual(advertisement?.decode_revision_ids, [result.decode_revision_id]);
  assert.equal((await store.listAssets())[0]?.sha256, result.decode.asset.sha256);
  assert.notEqual(result.advertisement_id, assetIdForSha256(result.decode.asset.sha256));
});

test('exact known Asset safely appends to one reviewed Advertisement and records acquisition provenance', async () => {
  const { decoder, store } = await setup();
  const bytes = Buffer.from('same archival advertisement');
  const first = await decoder.decodeUpload({
    imageBuffer: bytes,
    mimeType: 'image/jpeg',
    originalFilename: 'first.jpg',
  });
  const second = await decoder.decodeUpload({
    imageBuffer: bytes,
    mimeType: 'image/jpeg',
    originalFilename: 'second.jpg',
  });

  assert.equal(second.advertisement_id, first.advertisement_id);
  assert.equal((await store.listAdvertisements()).length, 1);
  assert.equal((await store.listDecodeRevisions()).length, 1);
  assert.equal(second.decode_revision_id, first.decode_revision_id);
  assert.equal(second.cache_hit, true);
  assert.equal((await store.listAcquisitionSources()).length, 1);
  assert.equal((await store.readAdvertisement(first.advertisement_id))?.legacy_case_ids.length, 1);
});

test('replaying the same persistence input is idempotent without duplicate archival identities', async () => {
  const { decoder, store } = await setup();
  const result = await decoder.decodeUpload({
    imageBuffer: Buffer.from('retry-safe advertisement'),
    mimeType: 'image/jpeg',
    originalFilename: 'retry.jpg',
  });
  await persistDecodeToCorpus(store, { case_id: result.slug, decode: result.decode });

  assert.equal((await store.listAdvertisements()).length, 1);
  assert.equal((await store.listAssets()).length, 1);
  assert.equal((await store.listDecodeRevisions()).length, 1);
  assert.equal((await store.listAcquisitionSources()).length, 1);
});

test('append-only aggregates reject archival mutation and reference removal', async () => {
  const { decoder, store } = await setup();
  const result = await decoder.decodeUpload({
    imageBuffer: Buffer.from('append-only advertisement'),
    mimeType: 'image/jpeg',
    originalFilename: 'append-only.jpg',
  });
  const advertisement = await store.readAdvertisement(result.advertisement_id);
  assert.ok(advertisement);

  await assert.rejects(
    () =>
      store.appendAdvertisementReferences({
        ...advertisement,
        decode_revision_ids: [],
      }),
    /cannot remove append-only decode_revision_ids/,
  );
  await assert.rejects(
    () =>
      store.appendAdvertisementReferences({
        ...advertisement,
        temporal: { ...advertisement.temporal, precision: 'year', start_year: 2026 },
      }),
    /cannot change archival field temporal/,
  );
  assert.deepEqual(await store.readAdvertisement(result.advertisement_id), advertisement);
});

test('identity resolver fails closed for ambiguous and quarantined exact Assets', async () => {
  const { store } = await setup();
  const sha256 = 'a'.repeat(64);
  const assetId = assetIdForSha256(sha256);
  const asset: AssetRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    asset_id: assetId,
    media_type: 'image',
    sha256,
    legacy_paths: [],
    acquisition_source_ids: [],
  };
  await store.putAsset(asset);
  const advertisement = (id: string): AdvertisementRecord => ({
    schema_version: CORPUS_RECORD_VERSION,
    advertisement_id: id,
    asset_ids: [assetId],
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
  });
  await store.putAdvertisement(advertisement('ad_ambiguous_one'));
  await store.putAdvertisement(advertisement('ad_ambiguous_two'));

  await assert.rejects(
    () =>
      resolveAdvertisementIdentity(store, {
        asset_sha256: sha256,
        acquisition_key: 'new',
        quarantined: false,
      }),
    /ambiguous/,
  );
  await assert.rejects(
    () =>
      resolveAdvertisementIdentity(store, {
        asset_sha256: 'b'.repeat(64),
        acquisition_key: 'quarantine',
        quarantined: false,
        quarantined_asset_sha256: new Set(['b'.repeat(64)]),
      }),
    /quarantined/,
  );
});
