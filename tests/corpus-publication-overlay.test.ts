import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CORPUS_ONTOLOGY_VERSION,
  CORPUS_RECORD_VERSION,
  UNKNOWN_TEMPORAL_EXTENT,
  type AdvertisementRecord,
  type AssetRecord,
  type CorpusMigrationManifest,
  type DecodeRevisionRecord,
} from '../src/corpus/corpus-records.js';
import { readCorpusAssetImage } from '../src/corpus/corpus-asset-io.js';
import {
  applyCorpusPublicationOverlay,
  writeCorpusPublicationOverlay,
} from '../src/corpus/corpus-publication-overlay.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';

function manifest(): CorpusMigrationManifest {
  return {
    schema_version: CORPUS_RECORD_VERSION,
    generated_at: '2026-08-30T00:00:00.000Z',
    source_cases_dir: 'cases',
    source_fingerprint: 'baseline-fingerprint',
    pipeline_version: 'legacy-case-migration.v0.2',
    ontology_version: CORPUS_ONTOLOGY_VERSION,
    counts: {},
    warnings: [],
    exclusions: [],
  };
}

test('publication overlay round-trips new corpus-native records and only required blob bytes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-publication-overlay-'));
  const baseline = createCorpusStore(join(root, 'baseline'));
  const current = createCorpusStore(join(root, 'current'));
  const restored = createCorpusStore(join(root, 'restored'));
  await baseline.writeMigrationManifest(manifest());
  await restored.writeMigrationManifest(manifest());

  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('published'),
  ]);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const assetId = `asset_${sha256.slice(0, 24)}`;
  const adId = 'ad_publication_overlay';
  const revisionId = 'decode_publication_overlay';
  await mkdir(join(current.root, 'blobs'), { recursive: true });
  await writeFile(join(current.root, 'blobs', assetId), bytes);
  const asset: AssetRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    asset_id: assetId,
    media_type: 'image',
    sha256,
    storage_path: `blobs/${assetId}`,
    legacy_paths: [],
    acquisition_source_ids: [],
  };
  const revision: DecodeRevisionRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    revision_id: revisionId,
    advertisement_id: adId,
    asset_id: assetId,
    source_case_id: null,
    source_kind: 'corpus_asset',
    model: 'test',
    model_version: '1',
    analysis_schema_version: 'decode-draft.v1',
    ontology_version: CORPUS_ONTOLOGY_VERSION,
    generated_at: '2026-08-30T00:00:00.000Z',
    pipeline_version: 'decode-corpus-cutover.v0.1',
    analysis_key: 'analysis_test',
    analysis_method_version: 'method',
    analysis_prompt_version: 'prompt',
    analysis_request_key: 'canonical',
    provider_id: 'test',
    legacy_decode_id: 'draft_test',
    observations: [],
    advertiser_claims: [],
    interpretations: [],
    evidence_links: [],
    legacy_payload: {},
  };
  const advertisement: AdvertisementRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    advertisement_id: adId,
    asset_ids: [assetId],
    brand_ids: [],
    product_ids: [],
    campaign_ids: [],
    placement_ids: [],
    market_ids: [],
    temporal: UNKNOWN_TEMPORAL_EXTENT,
    acquisition_source_ids: [],
    metadata_assertion_ids: [],
    decode_revision_ids: [revisionId],
    legacy_case_ids: [],
  };
  await current.putAsset(asset);
  await current.putDecodeRevision(revision);
  await current.putAdvertisement(advertisement);

  const overlayPath = join(root, 'publication', 'overlay.json');
  const overlay = await writeCorpusPublicationOverlay({
    current_store: current,
    baseline_store: baseline,
    output_path: overlayPath,
  });
  assert.equal(overlay.advertisements.length, 1);
  assert.equal(overlay.decode_revisions.length, 1);
  assert.equal(overlay.published_blobs.length, 1);

  await applyCorpusPublicationOverlay(restored, overlayPath);
  assert.deepEqual(await restored.readAdvertisement(adId), advertisement);
  assert.deepEqual(await restored.readDecodeRevision(revisionId), revision);
  const restoredAsset = await restored.readAsset(assetId);
  assert.ok(restoredAsset);
  assert.deepEqual((await readCorpusAssetImage(restored, restoredAsset)).bytes, bytes);
});

test('publication overlay fails closed against a different baseline fingerprint', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-publication-overlay-base-'));
  const baseline = createCorpusStore(join(root, 'baseline'));
  const current = createCorpusStore(join(root, 'current'));
  const wrong = createCorpusStore(join(root, 'wrong'));
  await baseline.writeMigrationManifest(manifest());
  await wrong.writeMigrationManifest({ ...manifest(), source_fingerprint: 'different' });
  const overlayPath = join(root, 'overlay.json');
  await writeCorpusPublicationOverlay({
    current_store: current,
    baseline_store: baseline,
    output_path: overlayPath,
  });

  await assert.rejects(
    () => applyCorpusPublicationOverlay(wrong, overlayPath),
    /baseline fingerprint does not match/,
  );
});
