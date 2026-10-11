import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  CORPUS_RECORD_VERSION,
  UNKNOWN_TEMPORAL_EXTENT,
  type AcquisitionSourceRecord,
  type AdvertisementRecord,
  type AssetRecord,
  type CorpusRelationshipRecord,
  type TemporalExtent,
} from './corpus-records.js';
import type { CorpusStore } from './corpus-store.js';

const RECORD_ID = /^[a-z0-9][a-z0-9._-]*$/i;
const SHA256 = /^[a-f0-9]{64}$/;

export interface ArchiveIngestionItem {
  readonly advertisement_id: string;
  readonly asset_path: string;
  readonly acquisition_key: string;
  readonly acquisition_kind: AcquisitionSourceRecord['kind'];
  readonly source_url?: string | null;
  readonly source_title?: string | null;
  readonly brand_ids?: readonly string[];
  readonly product_ids?: readonly string[];
  readonly campaign_ids?: readonly string[];
  readonly placement_ids?: readonly string[];
  readonly market_ids?: readonly string[];
  readonly temporal?: TemporalExtent;
}

export interface ExactAssetDuplicateCandidate {
  readonly sha256: string;
  readonly asset_ids: readonly string[];
  readonly advertisement_ids: readonly string[];
  readonly incoming_advertisement_ids: readonly string[];
}

export interface ArchiveIngestionResult {
  readonly advertisement_id: string;
  readonly asset_id: string;
  readonly acquisition_source_id: string;
  readonly status: 'created' | 'updated' | 'unchanged';
}

export interface ArchiveBatchIngestionResult {
  readonly results: readonly ArchiveIngestionResult[];
  readonly duplicate_candidates: readonly ExactAssetDuplicateCandidate[];
}

interface PreparedItem {
  readonly input: ArchiveIngestionItem;
  readonly bytes: Buffer;
  readonly sha256: string;
  readonly asset_id: string;
  readonly acquisition_source_id: string;
}

function hash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function assetIdForSha256(sha256: string): string {
  return `asset_${sha256.slice(0, 24)}`;
}

export function acquisitionIdForKey(key: string): string {
  return `acq_${hash(`archive-acquisition:${key}`).slice(0, 24)}`;
}

function relationshipId(value: string): string {
  return `rel_${hash(value).slice(0, 24)}`;
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertInput(item: ArchiveIngestionItem): void {
  if (!RECORD_ID.test(item.advertisement_id)) {
    throw new Error(`Invalid reviewed Advertisement id: ${item.advertisement_id}`);
  }
  if (item.acquisition_key.trim().length === 0) {
    throw new Error('Archive ingestion requires a stable acquisition_key.');
  }
  if (item.asset_path.trim().length === 0) {
    throw new Error('Archive ingestion requires asset_path.');
  }
}

async function prepareItem(item: ArchiveIngestionItem): Promise<PreparedItem> {
  assertInput(item);
  const bytes = await readFile(resolve(item.asset_path));
  const sha256 = hash(bytes);
  if (!SHA256.test(sha256)) throw new Error(`Invalid Asset SHA-256 for ${item.asset_path}.`);
  return {
    input: item,
    bytes,
    sha256,
    asset_id: assetIdForSha256(sha256),
    acquisition_source_id: acquisitionIdForKey(item.acquisition_key),
  };
}

function requestedAdvertisement(
  item: ArchiveIngestionItem,
  existing?: AdvertisementRecord,
): AdvertisementRecord {
  const temporal = item.temporal ?? existing?.temporal ?? UNKNOWN_TEMPORAL_EXTENT;
  return {
    schema_version: CORPUS_RECORD_VERSION,
    advertisement_id: item.advertisement_id,
    asset_ids: existing?.asset_ids ?? [],
    brand_ids: item.brand_ids ?? existing?.brand_ids ?? [],
    product_ids: item.product_ids ?? existing?.product_ids ?? [],
    campaign_ids: item.campaign_ids ?? existing?.campaign_ids ?? [],
    placement_ids: item.placement_ids ?? existing?.placement_ids ?? [],
    market_ids: item.market_ids ?? existing?.market_ids ?? [],
    temporal,
    acquisition_source_ids: existing?.acquisition_source_ids ?? [],
    metadata_assertion_ids: existing?.metadata_assertion_ids ?? [],
    decode_revision_ids: existing?.decode_revision_ids ?? [],
    legacy_case_ids: existing?.legacy_case_ids ?? [],
  };
}

function assertImmutableAdvertisementFields(
  existing: AdvertisementRecord,
  requested: AdvertisementRecord,
): void {
  const immutableKeys: readonly (keyof AdvertisementRecord)[] = [
    'schema_version',
    'advertisement_id',
    'brand_ids',
    'product_ids',
    'campaign_ids',
    'placement_ids',
    'market_ids',
    'temporal',
    'metadata_assertion_ids',
  ];
  for (const key of immutableKeys) {
    if (!sameJson(existing[key], requested[key])) {
      throw new Error(
        `Archive ingestion cannot change immutable Advertisement field ${String(key)} for ${existing.advertisement_id}.`,
      );
    }
  }
}

async function exactAssetOwners(
  store: CorpusStore,
): Promise<Map<string, { assetIds: Set<string>; advertisementIds: Set<string> }>> {
  const assets = await store.listAssets();
  const advertisements = await store.listAdvertisements();
  const assetShaById = new Map(assets.map((asset) => [asset.asset_id, asset.sha256]));
  const result = new Map<string, { assetIds: Set<string>; advertisementIds: Set<string> }>();
  for (const asset of assets) {
    const current = result.get(asset.sha256) ?? {
      assetIds: new Set<string>(),
      advertisementIds: new Set<string>(),
    };
    current.assetIds.add(asset.asset_id);
    result.set(asset.sha256, current);
  }
  for (const advertisement of advertisements) {
    for (const assetId of advertisement.asset_ids) {
      const sha256 = assetShaById.get(assetId);
      if (sha256 === undefined) continue;
      const current = result.get(sha256);
      current?.advertisementIds.add(advertisement.advertisement_id);
    }
  }
  return result;
}

async function findExactAssetDuplicateCandidates(
  store: CorpusStore,
  incoming: readonly PreparedItem[] = [],
): Promise<ExactAssetDuplicateCandidate[]> {
  const owners = await exactAssetOwners(store);
  const incomingBySha = new Map<string, Set<string>>();
  for (const item of incoming) {
    const ids = incomingBySha.get(item.sha256) ?? new Set<string>();
    ids.add(item.input.advertisement_id);
    incomingBySha.set(item.sha256, ids);
  }
  const hashes = sortedUnique([...owners.keys(), ...incomingBySha.keys()]);
  const candidates: ExactAssetDuplicateCandidate[] = [];
  for (const sha256 of hashes) {
    const existing = owners.get(sha256);
    const incomingIds = sortedUnique([...(incomingBySha.get(sha256) ?? [])]);
    const advertisementIds = sortedUnique([...(existing?.advertisementIds ?? [])]);
    if (advertisementIds.length + incomingIds.length < 2) continue;
    candidates.push({
      sha256,
      asset_ids: sortedUnique([...(existing?.assetIds ?? [])]),
      advertisement_ids: advertisementIds,
      incoming_advertisement_ids: incomingIds,
    });
  }
  return candidates;
}

async function writeAssetBlob(store: CorpusStore, item: PreparedItem): Promise<string> {
  const relativePath = `blobs/${item.asset_id}`;
  const pathname = resolve(store.root, relativePath);
  await mkdir(dirname(pathname), { recursive: true });
  try {
    await writeFile(pathname, item.bytes, { flag: 'wx' });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existingBytes = await readFile(pathname);
    if (hash(existingBytes) !== item.sha256) {
      throw new Error(`Corpus Asset blob conflict for ${item.asset_id}.`, { cause: error });
    }
  }
  return relativePath;
}

async function ingestPreparedItem(
  store: CorpusStore,
  item: PreparedItem,
): Promise<ArchiveIngestionResult> {
  const existingAdvertisement = await store.readAdvertisement(item.input.advertisement_id);
  const requested = requestedAdvertisement(item.input, existingAdvertisement ?? undefined);
  if (existingAdvertisement !== null) {
    assertImmutableAdvertisementFields(existingAdvertisement, requested);
  }

  const source: AcquisitionSourceRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    acquisition_source_id: item.acquisition_source_id,
    kind: item.input.acquisition_kind,
    source_url: item.input.source_url ?? null,
    source_title: item.input.source_title ?? null,
    legacy_case_id: null,
  };
  await store.putAcquisitionSource(source);

  const storagePath = await writeAssetBlob(store, item);
  const existingAsset = await store.readAsset(item.asset_id);
  if (existingAsset !== null && existingAsset.sha256 !== item.sha256) {
    throw new Error(`Corpus Asset ${item.asset_id} conflicts with the incoming SHA-256.`);
  }
  if (existingAsset?.storage_path !== undefined && existingAsset.storage_path !== storagePath) {
    throw new Error(`Corpus Asset ${item.asset_id} is already bound to another storage path.`);
  }
  const asset: AssetRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    asset_id: item.asset_id,
    media_type: 'image',
    sha256: item.sha256,
    storage_path: existingAsset?.storage_path ?? storagePath,
    legacy_paths: existingAsset?.legacy_paths ?? [],
    acquisition_source_ids: sortedUnique([
      ...(existingAsset?.acquisition_source_ids ?? []),
      item.acquisition_source_id,
    ]),
  };
  await store.appendAssetReferences(asset);

  const nextAdvertisement: AdvertisementRecord = {
    ...requested,
    asset_ids: sortedUnique([...(existingAdvertisement?.asset_ids ?? []), item.asset_id]),
    acquisition_source_ids: sortedUnique([
      ...(existingAdvertisement?.acquisition_source_ids ?? []),
      item.acquisition_source_id,
    ]),
  };
  await store.appendAdvertisementReferences(nextAdvertisement);

  const sourceRefs = [`acquisition-source:${item.acquisition_source_id}`];
  const alreadyAttached = existingAdvertisement?.asset_ids.includes(item.asset_id) ?? false;
  const relationships: CorpusRelationshipRecord[] = [
    ...(!alreadyAttached
      ? [
          {
            schema_version: CORPUS_RECORD_VERSION,
            relationship_id: relationshipId(
              `has_asset|${item.input.advertisement_id}|${item.asset_id}|asserted_factual`,
            ),
            relation: 'has_asset',
            source_id: item.input.advertisement_id,
            target_id: item.asset_id,
            epistemic_type: 'asserted_factual',
            decode_revision_id: null,
            source_refs: sourceRefs,
          } satisfies CorpusRelationshipRecord,
        ]
      : []),
    {
      schema_version: CORPUS_RECORD_VERSION,
      relationship_id: relationshipId(
        `acquired_from|${item.asset_id}|${item.acquisition_source_id}|asserted_factual`,
      ),
      relation: 'acquired_from',
      source_id: item.asset_id,
      target_id: item.acquisition_source_id,
      epistemic_type: 'asserted_factual',
      decode_revision_id: null,
      source_refs: sourceRefs,
    },
  ];
  for (const relationship of relationships) await store.putRelationship(relationship);

  const changed =
    existingAdvertisement === null ||
    !existingAdvertisement.asset_ids.includes(item.asset_id) ||
    !existingAdvertisement.acquisition_source_ids.includes(item.acquisition_source_id);
  return {
    advertisement_id: item.input.advertisement_id,
    asset_id: item.asset_id,
    acquisition_source_id: item.acquisition_source_id,
    status: existingAdvertisement === null ? 'created' : changed ? 'updated' : 'unchanged',
  };
}

export async function inspectArchiveBatch(
  store: CorpusStore,
  items: readonly ArchiveIngestionItem[],
): Promise<readonly ExactAssetDuplicateCandidate[]> {
  const prepared = await Promise.all(items.map((item) => prepareItem(item)));
  return findExactAssetDuplicateCandidates(store, prepared);
}

export async function ingestArchiveBatch(
  store: CorpusStore,
  items: readonly ArchiveIngestionItem[],
): Promise<ArchiveBatchIngestionResult> {
  const prepared = await Promise.all(items.map((item) => prepareItem(item)));
  const existingOwners = await exactAssetOwners(store);

  const incomingOwners = new Map<string, Set<string>>();
  for (const item of prepared) {
    const ids = incomingOwners.get(item.sha256) ?? new Set<string>();
    ids.add(item.input.advertisement_id);
    incomingOwners.set(item.sha256, ids);
  }

  const duplicateCandidates = await findExactAssetDuplicateCandidates(store, prepared);
  for (const [sha256, incomingIds] of incomingOwners) {
    const existingIds = existingOwners.get(sha256)?.advertisementIds ?? new Set<string>();
    const allIds = new Set([...existingIds, ...incomingIds]);
    if (allIds.size > 1) {
      throw new Error(
        `Advertisement identity is ambiguous for exact Asset ${sha256}: reviewed ids ${sortedUnique([...allIds]).join(', ')}.`,
      );
    }
  }

  const results: ArchiveIngestionResult[] = [];
  for (const item of prepared) {
    results.push(await ingestPreparedItem(store, item));
  }
  return { results, duplicate_candidates: duplicateCandidates };
}
