import { createHash } from 'node:crypto';

import type { DecodeDraftV1 } from '../contracts/decode-draft-v1.js';
import {
  CORPUS_RECORD_VERSION,
  UNKNOWN_TEMPORAL_EXTENT,
  type AcquisitionSourceRecord,
  type AdvertisementRecord,
  type AssetRecord,
  type CorpusRelationshipRecord,
  type DecodeRevisionRecord,
} from './corpus-records.js';
import type { CorpusStore } from './corpus-store.js';
import { resolveAdvertisementIdentity } from './advertisement-identity-resolver.js';
import {
  assetIdForSha256,
  normalizeDecodeRevision,
  writeRevisionRelationships,
} from './legacy-migration.js';

export const LIVE_DECODE_CORPUS_PIPELINE_VERSION = 'decode-corpus-cutover.v0.1' as const;

export interface PersistDecodeAnalysisIdentity {
  readonly analysis_key: string;
  readonly method_version: string;
  readonly prompt_version: string;
  readonly provider_id: string;
  readonly request_key?: string;
}

export interface FindCanonicalDecodeInput {
  readonly case_id: string;
  readonly asset_sha256: string;
  readonly analysis_key: string;
  readonly quarantined?: boolean;
  readonly quarantined_asset_sha256?: ReadonlySet<string>;
}

export interface CanonicalDecodeMatch {
  readonly advertisement_id: string;
  readonly revision: DecodeRevisionRecord | null;
}

export interface PersistDecodeInput {
  readonly case_id: string;
  readonly decode: DecodeDraftV1;
  readonly source_url?: string | null;
  readonly source_title?: string | null;
  readonly acquisition_kind?: AcquisitionSourceRecord['kind'];
  readonly quarantined?: boolean;
  readonly quarantined_asset_sha256?: ReadonlySet<string>;
  readonly analysis_identity?: PersistDecodeAnalysisIdentity;
}

export interface PersistDecodeResult {
  readonly advertisement_id: string;
  readonly revision_id: string;
  readonly resolved_existing_advertisement: boolean;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function union(values: readonly string[], extra: string): string[] {
  return [...new Set([...values, extra])].sort();
}

export async function findCanonicalDecodeRevision(
  store: CorpusStore,
  input: FindCanonicalDecodeInput,
): Promise<CanonicalDecodeMatch> {
  const resolution = await resolveAdvertisementIdentity(store, {
    asset_sha256: input.asset_sha256,
    acquisition_key: input.case_id,
    quarantined: input.quarantined ?? false,
    ...(input.quarantined_asset_sha256
      ? { quarantined_asset_sha256: input.quarantined_asset_sha256 }
      : {}),
  });
  const assetId = assetIdForSha256(input.asset_sha256);
  const matches = (await store.listDecodeRevisions()).filter(
    (revision) =>
      revision.advertisement_id === resolution.advertisement_id &&
      revision.asset_id === assetId &&
      revision.analysis_key === input.analysis_key &&
      revision.analysis_request_key === 'canonical',
  );
  if (matches.length > 1) {
    throw new Error(
      `Canonical analysis identity ${input.analysis_key} resolves to ${matches.length} DecodeRevisions.`,
    );
  }
  return {
    advertisement_id: resolution.advertisement_id,
    revision: matches[0] ?? null,
  };
}

export async function persistDecodeToCorpus(
  store: CorpusStore,
  input: PersistDecodeInput,
): Promise<PersistDecodeResult> {
  const resolution = await resolveAdvertisementIdentity(store, {
    asset_sha256: input.decode.asset.sha256,
    acquisition_key: input.case_id,
    quarantined: input.quarantined ?? false,
    ...(input.quarantined_asset_sha256
      ? { quarantined_asset_sha256: input.quarantined_asset_sha256 }
      : {}),
  });
  const assetId = assetIdForSha256(input.decode.asset.sha256);
  const acquisitionId = stableId('acq', `${input.case_id}|${input.source_url ?? 'direct-upload'}`);
  const acquisition: AcquisitionSourceRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    acquisition_source_id: acquisitionId,
    kind: input.acquisition_kind ?? 'direct_upload',
    source_url: input.source_url ?? null,
    source_title: input.source_title ?? null,
    legacy_case_id: input.case_id,
  };
  await store.putAcquisitionSource(acquisition);

  const oldAsset = await store.readAsset(assetId);
  const asset: AssetRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    asset_id: assetId,
    media_type: 'image',
    sha256: input.decode.asset.sha256,
    legacy_paths: union(oldAsset?.legacy_paths ?? [], input.decode.asset.path),
    acquisition_source_ids: union(oldAsset?.acquisition_source_ids ?? [], acquisitionId),
  };
  await store.appendAssetReferences(asset);

  const legacyReplay = input.analysis_identity
    ? undefined
    : (await store.listDecodeRevisions()).find(
        (candidate) =>
          candidate.advertisement_id === resolution.advertisement_id &&
          candidate.asset_id === assetId &&
          candidate.source_case_id === input.case_id &&
          candidate.legacy_decode_id === input.decode.draft_id &&
          candidate.generated_at === input.decode.provider.generated_at,
      );
  const revision =
    legacyReplay ??
    normalizeDecodeRevision(
      resolution.advertisement_id,
      assetId,
      input.case_id,
      input.decode,
      LIVE_DECODE_CORPUS_PIPELINE_VERSION,
      input.analysis_identity
        ? {
            analysis_key: input.analysis_identity.analysis_key,
            method_version: input.analysis_identity.method_version,
            prompt_version: input.analysis_identity.prompt_version,
            request_key: input.analysis_identity.request_key ?? 'canonical',
            provider_id: input.analysis_identity.provider_id,
          }
        : undefined,
    );
  await store.putDecodeRevision(revision);
  await writeRevisionRelationships(store, revision);

  const existing = resolution.advertisement;
  const advertisement: AdvertisementRecord = existing
    ? {
        ...existing,
        asset_ids: union(existing.asset_ids, assetId),
        acquisition_source_ids: union(existing.acquisition_source_ids, acquisitionId),
        decode_revision_ids: union(existing.decode_revision_ids, revision.revision_id),
        legacy_case_ids: union(existing.legacy_case_ids, input.case_id),
      }
    : {
        schema_version: CORPUS_RECORD_VERSION,
        advertisement_id: resolution.advertisement_id,
        asset_ids: [assetId],
        brand_ids: [],
        product_ids: [],
        campaign_ids: [],
        placement_ids: [],
        market_ids: [],
        temporal: UNKNOWN_TEMPORAL_EXTENT,
        acquisition_source_ids: [acquisitionId],
        metadata_assertion_ids: [],
        decode_revision_ids: [revision.revision_id],
        legacy_case_ids: [input.case_id],
      };
  await store.appendAdvertisementReferences(advertisement);

  const sourceRefs = [`acquisition-source:${acquisitionId}`, `case-compatibility:${input.case_id}`];
  const relationships: CorpusRelationshipRecord[] = [
    ...(resolution.kind === 'new'
      ? [
          {
            schema_version: CORPUS_RECORD_VERSION,
            relationship_id: stableId(
              'rel',
              `has_asset|${advertisement.advertisement_id}|${assetId}|asserted_factual|`,
            ),
            relation: 'has_asset',
            source_id: advertisement.advertisement_id,
            target_id: assetId,
            epistemic_type: 'asserted_factual',
            decode_revision_id: null,
            source_refs: sourceRefs,
          } satisfies CorpusRelationshipRecord,
        ]
      : []),
    {
      schema_version: CORPUS_RECORD_VERSION,
      relationship_id: stableId('rel', `acquired_from|${assetId}|${acquisitionId}`),
      relation: 'acquired_from',
      source_id: assetId,
      target_id: acquisitionId,
      epistemic_type: 'asserted_factual',
      decode_revision_id: null,
      source_refs: sourceRefs,
    },
  ];
  for (const relationship of relationships) await store.putRelationship(relationship);

  return {
    advertisement_id: advertisement.advertisement_id,
    revision_id: revision.revision_id,
    resolved_existing_advertisement: resolution.kind === 'existing',
  };
}

export interface CorpusDecodeTargetInput {
  readonly advertisement_id: string;
  readonly asset_id?: string;
}

export interface CorpusDecodeTarget {
  readonly advertisement: AdvertisementRecord;
  readonly asset: AssetRecord;
}

export interface FindCorpusCanonicalDecodeInput extends CorpusDecodeTargetInput {
  readonly analysis_key: string;
}

export interface PersistCorpusNativeDecodeInput extends CorpusDecodeTargetInput {
  readonly decode: DecodeDraftV1;
  readonly analysis_identity: PersistDecodeAnalysisIdentity;
}

export async function resolveCorpusDecodeTarget(
  store: CorpusStore,
  input: CorpusDecodeTargetInput,
): Promise<CorpusDecodeTarget> {
  const advertisement = await store.readAdvertisement(input.advertisement_id);
  if (advertisement === null) {
    throw new Error(`No canonical Advertisement named "${input.advertisement_id}".`);
  }
  const assetId =
    input.asset_id ??
    (advertisement.asset_ids.length === 1 ? advertisement.asset_ids[0] : undefined);
  if (assetId === undefined) {
    throw new Error(
      `Advertisement ${input.advertisement_id} has ${advertisement.asset_ids.length} Assets; choose asset_id explicitly.`,
    );
  }
  if (!advertisement.asset_ids.includes(assetId)) {
    throw new Error(`Asset ${assetId} does not belong to Advertisement ${input.advertisement_id}.`);
  }
  const asset = await store.readAsset(assetId);
  if (asset === null) throw new Error(`Corpus Asset ${assetId} is missing.`);

  const owners = (await store.listAdvertisements()).filter((candidate) =>
    candidate.asset_ids.includes(assetId),
  );
  if (owners.length !== 1 || owners[0]?.advertisement_id !== advertisement.advertisement_id) {
    throw new Error(
      `Corpus Asset ${assetId} has ambiguous Advertisement ownership: ${
        owners
          .map((owner) => owner.advertisement_id)
          .sort()
          .join(', ') || '(none)'
      }.`,
    );
  }
  return { advertisement, asset };
}

export async function findCanonicalCorpusDecodeRevision(
  store: CorpusStore,
  input: FindCorpusCanonicalDecodeInput,
): Promise<{
  readonly target: CorpusDecodeTarget;
  readonly revision: DecodeRevisionRecord | null;
}> {
  const target = await resolveCorpusDecodeTarget(store, input);
  const matches = (await store.listDecodeRevisions()).filter(
    (revision) =>
      revision.advertisement_id === target.advertisement.advertisement_id &&
      revision.asset_id === target.asset.asset_id &&
      revision.analysis_key === input.analysis_key &&
      revision.analysis_request_key === 'canonical',
  );
  if (matches.length > 1) {
    throw new Error(
      `Canonical analysis identity ${input.analysis_key} resolves to ${matches.length} DecodeRevisions for Advertisement ${input.advertisement_id}.`,
    );
  }
  return { target, revision: matches[0] ?? null };
}

export async function persistCorpusNativeDecode(
  store: CorpusStore,
  input: PersistCorpusNativeDecodeInput,
): Promise<PersistDecodeResult> {
  const target = await resolveCorpusDecodeTarget(store, input);
  if (
    input.decode.asset.asset_id !== target.asset.asset_id ||
    input.decode.asset.sha256 !== target.asset.sha256
  ) {
    throw new Error(
      `Decode Asset does not match canonical Corpus Asset ${target.asset.asset_id} for Advertisement ${target.advertisement.advertisement_id}.`,
    );
  }

  if ((input.analysis_identity.request_key ?? 'canonical') === 'canonical') {
    const existing = await findCanonicalCorpusDecodeRevision(store, {
      advertisement_id: target.advertisement.advertisement_id,
      asset_id: target.asset.asset_id,
      analysis_key: input.analysis_identity.analysis_key,
    });
    if (existing.revision !== null) {
      return {
        advertisement_id: target.advertisement.advertisement_id,
        revision_id: existing.revision.revision_id,
        resolved_existing_advertisement: true,
      };
    }
  }

  const revision = normalizeDecodeRevision(
    target.advertisement.advertisement_id,
    target.asset.asset_id,
    null,
    input.decode,
    LIVE_DECODE_CORPUS_PIPELINE_VERSION,
    {
      analysis_key: input.analysis_identity.analysis_key,
      method_version: input.analysis_identity.method_version,
      prompt_version: input.analysis_identity.prompt_version,
      request_key: input.analysis_identity.request_key ?? 'canonical',
      provider_id: input.analysis_identity.provider_id,
    },
  );
  await store.putDecodeRevision(revision);
  await writeRevisionRelationships(store, revision);
  await store.appendAdvertisementReferences({
    ...target.advertisement,
    decode_revision_ids: union(target.advertisement.decode_revision_ids, revision.revision_id),
  });
  return {
    advertisement_id: target.advertisement.advertisement_id,
    revision_id: revision.revision_id,
    resolved_existing_advertisement: true,
  };
}
