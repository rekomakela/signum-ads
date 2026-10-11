import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type {
  AcquisitionSourceRecord,
  AdvertisementRecord,
  AssetRecord,
  BrandRecord,
  CorpusRelationshipRecord,
  DecodeRevisionRecord,
  MetadataAssertionRecord,
  ProductRecord,
} from './corpus-records.js';
import { createCorpusStore, type CorpusStore } from './corpus-store.js';

export const CORPUS_PUBLICATION_OVERLAY_VERSION = 'signum-corpus-publication-overlay.v0.1' as const;

export interface CorpusPublicationBlob {
  readonly asset_id: string;
  readonly sha256: string;
  readonly source_path: string;
  readonly storage_path: string;
}

export interface CorpusPublicationOverlay {
  readonly schema_version: typeof CORPUS_PUBLICATION_OVERLAY_VERSION;
  readonly base_pipeline_version: string;
  readonly base_source_fingerprint: string;
  readonly overlay_fingerprint: string;
  readonly advertisements: readonly AdvertisementRecord[];
  readonly assets: readonly AssetRecord[];
  readonly brands: readonly BrandRecord[];
  readonly products: readonly ProductRecord[];
  readonly acquisition_sources: readonly AcquisitionSourceRecord[];
  readonly metadata_assertions: readonly MetadataAssertionRecord[];
  readonly decode_revisions: readonly DecodeRevisionRecord[];
  readonly relationships: readonly CorpusRelationshipRecord[];
  readonly published_blobs: readonly CorpusPublicationBlob[];
}

interface RecordSet<T> {
  readonly records: readonly T[];
  readonly id: (record: T) => string;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function withoutStoragePath(asset: AssetRecord): AssetRecord {
  return {
    schema_version: asset.schema_version,
    asset_id: asset.asset_id,
    media_type: asset.media_type,
    sha256: asset.sha256,
    legacy_paths: asset.legacy_paths,
    acquisition_source_ids: asset.acquisition_source_ids,
  };
}

function sorted<T>(records: readonly T[], id: (record: T) => string): T[] {
  return [...records].sort((left, right) => id(left).localeCompare(id(right)));
}

function deltaRecords<T>(current: RecordSet<T>, baseline: RecordSet<T>, label: string): T[] {
  const baselineById = new Map(
    baseline.records.map((record) => [baseline.id(record), record] as const),
  );
  const delta: T[] = [];
  for (const record of sorted(current.records, current.id)) {
    const recordId = current.id(record);
    const base = baselineById.get(recordId);
    if (base === undefined) {
      delta.push(record);
      continue;
    }
    if (stableJson(base) !== stableJson(record)) {
      throw new Error(
        `Publication overlay cannot replace baseline ${label}/${recordId}; encode reviewed baseline changes in the reproducible migration instead.`,
      );
    }
  }
  return delta;
}

export interface WriteCorpusPublicationOverlayOptions {
  readonly current_store: CorpusStore;
  readonly baseline_store: CorpusStore;
  readonly output_path: string;
}

export async function writeCorpusPublicationOverlay(
  options: WriteCorpusPublicationOverlayOptions,
): Promise<CorpusPublicationOverlay> {
  const baselineManifest = await options.baseline_store.readMigrationManifest();
  if (baselineManifest === null) {
    throw new Error('Publication overlay baseline requires a migration manifest.');
  }

  const [
    currentAdvertisements,
    currentAssets,
    currentBrands,
    currentProducts,
    currentAcquisitions,
    currentAssertions,
    currentRevisions,
    currentRelationships,
    baselineAdvertisements,
    baselineAssets,
    baselineBrands,
    baselineProducts,
    baselineAcquisitions,
    baselineAssertions,
    baselineRevisions,
    baselineRelationships,
  ] = await Promise.all([
    options.current_store.listAdvertisements(),
    options.current_store.listAssets(),
    options.current_store.listBrands(),
    options.current_store.listProducts(),
    options.current_store.listAcquisitionSources(),
    options.current_store.listMetadataAssertions(),
    options.current_store.listDecodeRevisions(),
    options.current_store.listRelationships(),
    options.baseline_store.listAdvertisements(),
    options.baseline_store.listAssets(),
    options.baseline_store.listBrands(),
    options.baseline_store.listProducts(),
    options.baseline_store.listAcquisitionSources(),
    options.baseline_store.listMetadataAssertions(),
    options.baseline_store.listDecodeRevisions(),
    options.baseline_store.listRelationships(),
  ]);

  const advertisements = deltaRecords(
    { records: currentAdvertisements, id: (record) => record.advertisement_id },
    { records: baselineAdvertisements, id: (record) => record.advertisement_id },
    'advertisements',
  );
  const rawAssets = deltaRecords(
    { records: currentAssets, id: (record) => record.asset_id },
    { records: baselineAssets, id: (record) => record.asset_id },
    'assets',
  );
  const brands = deltaRecords(
    { records: currentBrands, id: (record) => record.brand_id },
    { records: baselineBrands, id: (record) => record.brand_id },
    'brands',
  );
  const products = deltaRecords(
    { records: currentProducts, id: (record) => record.product_id },
    { records: baselineProducts, id: (record) => record.product_id },
    'products',
  );
  const acquisitionSources = deltaRecords(
    { records: currentAcquisitions, id: (record) => record.acquisition_source_id },
    { records: baselineAcquisitions, id: (record) => record.acquisition_source_id },
    'acquisition-sources',
  );
  const metadataAssertions = deltaRecords(
    { records: currentAssertions, id: (record) => record.assertion_id },
    { records: baselineAssertions, id: (record) => record.assertion_id },
    'metadata-assertions',
  );
  const decodeRevisions = deltaRecords(
    { records: currentRevisions, id: (record) => record.revision_id },
    { records: baselineRevisions, id: (record) => record.revision_id },
    'decode-revisions',
  );
  const relationships = deltaRecords(
    { records: currentRelationships, id: (record) => record.relationship_id },
    { records: baselineRelationships, id: (record) => record.relationship_id },
    'relationships',
  );

  const corpusNativeDecodedAssetIds = new Set(
    decodeRevisions
      .filter((revision) => revision.source_kind === 'corpus_asset')
      .map((revision) => revision.asset_id),
  );
  const overlayDir = dirname(resolve(options.output_path));
  const blobDir = resolve(overlayDir, 'blobs');
  await rm(blobDir, { recursive: true, force: true });
  await mkdir(blobDir, { recursive: true });

  const publishedBlobs: CorpusPublicationBlob[] = [];
  const assets: AssetRecord[] = [];
  for (const asset of sorted(rawAssets, (record) => record.asset_id)) {
    if (!corpusNativeDecodedAssetIds.has(asset.asset_id)) {
      assets.push(withoutStoragePath(asset));
      continue;
    }
    if (asset.storage_path === undefined) {
      throw new Error(
        `Decoded corpus-native Asset ${asset.asset_id} has no persisted storage_path.`,
      );
    }
    const source = resolve(options.current_store.root, asset.storage_path);
    const targetRelative = `blobs/${asset.asset_id}`;
    const target = resolve(overlayDir, targetRelative);
    const bytes = await readFile(source);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== asset.sha256) {
      throw new Error(`Publication Asset ${asset.asset_id} does not match its SHA-256.`);
    }
    await copyFile(source, target);
    assets.push(asset);
    publishedBlobs.push({
      asset_id: asset.asset_id,
      sha256: asset.sha256,
      source_path: targetRelative,
      storage_path: asset.storage_path,
    });
  }

  const payload = {
    advertisements: sorted(advertisements, (record) => record.advertisement_id),
    assets,
    brands: sorted(brands, (record) => record.brand_id),
    products: sorted(products, (record) => record.product_id),
    acquisition_sources: sorted(acquisitionSources, (record) => record.acquisition_source_id),
    metadata_assertions: sorted(metadataAssertions, (record) => record.assertion_id),
    decode_revisions: sorted(decodeRevisions, (record) => record.revision_id),
    relationships: sorted(relationships, (record) => record.relationship_id),
    published_blobs: sorted(publishedBlobs, (record) => record.asset_id),
  };
  const overlay: CorpusPublicationOverlay = {
    schema_version: CORPUS_PUBLICATION_OVERLAY_VERSION,
    base_pipeline_version: baselineManifest.pipeline_version,
    base_source_fingerprint: baselineManifest.source_fingerprint,
    overlay_fingerprint: fingerprint(payload),
    ...payload,
  };
  await mkdir(overlayDir, { recursive: true });
  await writeFile(resolve(options.output_path), stableJson(overlay), 'utf8');
  return overlay;
}

export async function applyCorpusPublicationOverlay(
  store: CorpusStore,
  overlayPath: string,
): Promise<CorpusPublicationOverlay> {
  const resolvedOverlayPath = resolve(overlayPath);
  const overlay = JSON.parse(
    await readFile(resolvedOverlayPath, 'utf8'),
  ) as CorpusPublicationOverlay;
  if (overlay.schema_version !== CORPUS_PUBLICATION_OVERLAY_VERSION) {
    throw new Error(`Unsupported Corpus publication overlay: ${String(overlay.schema_version)}.`);
  }
  const baselineManifest = await store.readMigrationManifest();
  if (baselineManifest === null) {
    throw new Error('Corpus publication overlay requires a migrated baseline Corpus.');
  }
  if (
    baselineManifest.pipeline_version !== overlay.base_pipeline_version ||
    baselineManifest.source_fingerprint !== overlay.base_source_fingerprint
  ) {
    throw new Error(
      'Corpus publication overlay baseline fingerprint does not match this checkout.',
    );
  }
  const payload = {
    advertisements: overlay.advertisements,
    assets: overlay.assets,
    brands: overlay.brands,
    products: overlay.products,
    acquisition_sources: overlay.acquisition_sources,
    metadata_assertions: overlay.metadata_assertions,
    decode_revisions: overlay.decode_revisions,
    relationships: overlay.relationships,
    published_blobs: overlay.published_blobs,
  };
  if (fingerprint(payload) !== overlay.overlay_fingerprint) {
    throw new Error('Corpus publication overlay fingerprint mismatch.');
  }

  const overlayDir = dirname(resolvedOverlayPath);
  for (const blob of overlay.published_blobs) {
    const source = resolve(overlayDir, blob.source_path);
    const bytes = await readFile(source);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== blob.sha256) {
      throw new Error(`Publication blob ${blob.asset_id} failed SHA-256 verification.`);
    }
    const target = resolve(store.root, blob.storage_path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: 'wx' }).catch(async (error: unknown) => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(target);
      if (createHash('sha256').update(existing).digest('hex') !== blob.sha256) {
        throw new Error(`Existing publication blob ${blob.asset_id} conflicts with the overlay.`);
      }
    });
  }

  for (const record of overlay.brands) await store.putBrand(record);
  for (const record of overlay.products) await store.putProduct(record);
  for (const record of overlay.acquisition_sources) await store.putAcquisitionSource(record);
  for (const record of overlay.metadata_assertions) await store.putMetadataAssertion(record);
  for (const record of overlay.assets) await store.putAsset(record);
  for (const record of overlay.decode_revisions) await store.putDecodeRevision(record);
  for (const record of overlay.advertisements) await store.putAdvertisement(record);
  for (const record of overlay.relationships) await store.putRelationship(record);
  return overlay;
}

export async function applyCorpusPublicationOverlayToDirectory(
  corpusDir: string,
  overlayPath: string,
): Promise<CorpusPublicationOverlay> {
  return applyCorpusPublicationOverlay(createCorpusStore(corpusDir), overlayPath);
}
