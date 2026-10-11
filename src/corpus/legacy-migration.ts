import { createHash } from 'node:crypto';
import { createCaseLibrary, type CaseLibraryEntry } from '../cases/case-library.js';
import type {
  DecodeDraftV1,
  ProposedInterpretiveClaim,
  ProposedReference,
} from '../contracts/decode-draft-v1.js';
import {
  CORPUS_ONTOLOGY_VERSION,
  CORPUS_RECORD_VERSION,
  UNKNOWN_TEMPORAL_EXTENT,
  type AcquisitionSourceRecord,
  type AdvertisementRecord,
  type AdvertiserClaimRecord,
  type AssetRecord,
  type BrandRecord,
  type CorpusConceptFamily,
  type CorpusConceptReference,
  type CorpusEvidenceLinkRecord,
  type CorpusMigrationExclusion,
  type CorpusMigrationManifest,
  type CorpusObservationRecord,
  type CorpusRelationshipRecord,
  type DecodeRevisionRecord,
  type InterpretationRecord,
  type MetadataAssertionRecord,
  type TemporalExtent,
} from './corpus-records.js';
import { createCorpusStore, type CorpusStore } from './corpus-store.js';
import { curatedCorpusMetadata } from './curated-corpus-metadata.js';
import { legacyExclusionForCase, legacyIdentityGroupForCase } from './legacy-identity.js';

export const LEGACY_CORPUS_MIGRATION_VERSION = 'legacy-case-migration.v0.2' as const;

export interface CorpusMigrationResult {
  readonly corpus_dir: string;
  readonly advertisement_count: number;
  readonly asset_count: number;
  readonly brand_count: number;
  readonly acquisition_source_count: number;
  readonly metadata_assertion_count: number;
  readonly decode_revision_count: number;
  readonly relationship_count: number;
  readonly legacy_case_count: number;
  readonly migrated_legacy_case_count: number;
  readonly excluded_legacy_case_count: number;
  readonly duplicate_asset_groups: number;
  readonly reviewed_identity_groups: number;
  readonly warnings: readonly string[];
}

function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

export function assetIdForSha256(sha256: string): string {
  return `asset_${sha256.slice(0, 24)}`;
}

export function advertisementIdForLegacyIdentity(identityKey: string): string {
  return stableId('ad', identityKey);
}

function conceptFamily(reference: ProposedReference): CorpusConceptFamily | null {
  switch (reference.reference_type) {
    case 'persuasion_technique':
      return 'PersuasionTechnique';
    case 'emotional_lever':
      return 'EmotionalLever';
    case 'cultural_code':
      return 'CulturalCode';
    default:
      return null;
  }
}

function conceptRefs(claim: ProposedInterpretiveClaim): CorpusConceptReference[] {
  return claim.references.map((reference) => ({
    concept_id: reference.reference_value,
    family: conceptFamily(reference),
    legacy_reference_type: reference.reference_type,
    required_for_interpretation: reference.required_for_claim,
  }));
}

function interpretationKind(kind: ProposedInterpretiveClaim['kind']): InterpretationRecord['kind'] {
  switch (kind) {
    case 'semiotic':
    case 'persuasion':
    case 'audience':
      return kind;
    default:
      return 'other';
  }
}

export interface DecodeRevisionAnalysisIdentity {
  readonly analysis_key: string;
  readonly method_version: string;
  readonly prompt_version: string;
  readonly request_key: string;
  readonly provider_id: string;
}

export function normalizeDecodeRevision(
  advertisementId: string,
  assetId: string,
  caseId: string | null,
  decode: DecodeDraftV1,
  pipelineVersion: string = LEGACY_CORPUS_MIGRATION_VERSION,
  analysisIdentity?: DecodeRevisionAnalysisIdentity,
): DecodeRevisionRecord {
  const revisionId = stableId(
    'decode',
    caseId === null
      ? `${advertisementId}|corpus-asset:${assetId}|${decode.draft_id}|${decode.provider.generated_at}|${decode.asset.sha256}${analysisIdentity ? `|${analysisIdentity.analysis_key}|${analysisIdentity.request_key}` : ''}`
      : `${advertisementId}|${caseId}|${decode.draft_id}|${decode.provider.generated_at}|${decode.asset.sha256}${analysisIdentity ? `|${analysisIdentity.analysis_key}|${analysisIdentity.request_key}` : ''}`,
  );
  const observations: CorpusObservationRecord[] = decode.evidence_records.map((record) => ({
    observation_id: stableId('obs', `${revisionId}|${record.evidence_id}`),
    description: record.description,
    evidence_type: record.evidence_type,
    location: record.location,
    confidence: record.confidence,
    legacy_evidence_id: record.evidence_id,
  }));
  const observationByLegacyId = new Map(
    observations.map((observation) => [observation.legacy_evidence_id, observation.observation_id]),
  );
  const evidenceLinks: CorpusEvidenceLinkRecord[] = [];
  const advertiserClaims: AdvertiserClaimRecord[] = [];
  const interpretations: InterpretationRecord[] = [];

  for (const claim of decode.proposed_decode.interpretive_claims) {
    const isAdvertiserClaim = claim.kind === 'core_message';
    const targetId = stableId(
      isAdvertiserClaim ? 'advclaim' : 'interp',
      `${revisionId}|${claim.claim_id}`,
    );
    const linkIds: string[] = [];
    for (const evidence of claim.evidence_references) {
      const observationId = observationByLegacyId.get(evidence.evidence_id);
      if (observationId === undefined) {
        throw new Error(
          `${caseId === null ? `Corpus Advertisement ${advertisementId}` : `Case ${caseId}`} Decode ${decode.draft_id} references missing evidence ${evidence.evidence_id}.`,
        );
      }
      const evidenceLinkId = stableId(
        'evidence',
        `${revisionId}|${claim.claim_id}|${evidence.evidence_id}|${evidence.support}`,
      );
      evidenceLinks.push({
        evidence_link_id: evidenceLinkId,
        observation_id: observationId,
        target_type: isAdvertiserClaim ? 'advertiser_claim' : 'interpretation',
        target_id: targetId,
        support: evidence.support,
      });
      linkIds.push(evidenceLinkId);
    }
    if (isAdvertiserClaim) {
      advertiserClaims.push({
        advertiser_claim_id: targetId,
        text: claim.text,
        mode: 'unknown',
        evidence_link_ids: linkIds,
        concept_refs: conceptRefs(claim),
        legacy_claim_id: claim.claim_id,
      });
    } else {
      interpretations.push({
        interpretation_id: targetId,
        kind: interpretationKind(claim.kind),
        stance: 'primary',
        text: claim.text,
        evidence_link_ids: linkIds,
        supporting_interpretation_ids: [],
        concept_refs: conceptRefs(claim),
        legacy_claim_id: claim.claim_id,
      });
    }
  }

  const thesisId = stableId('interp', `${revisionId}|thesis|${decode.proposed_decode.summary}`);
  interpretations.unshift({
    interpretation_id: thesisId,
    kind: 'thesis',
    stance: 'primary',
    text: decode.proposed_decode.summary,
    evidence_link_ids: [],
    supporting_interpretation_ids: interpretations.map((item) => item.interpretation_id),
    concept_refs: [],
    legacy_claim_id: null,
  });

  return {
    schema_version: CORPUS_RECORD_VERSION,
    revision_id: revisionId,
    advertisement_id: advertisementId,
    asset_id: assetId,
    source_case_id: caseId,
    ...(caseId === null ? { source_kind: 'corpus_asset' as const } : {}),
    model: decode.provider.provider_name,
    model_version: decode.provider.provider_version,
    analysis_schema_version: decode.schema_version,
    ontology_version: CORPUS_ONTOLOGY_VERSION,
    generated_at: decode.provider.generated_at,
    pipeline_version: pipelineVersion,
    ...(analysisIdentity
      ? {
          analysis_key: analysisIdentity.analysis_key,
          analysis_method_version: analysisIdentity.method_version,
          analysis_prompt_version: analysisIdentity.prompt_version,
          analysis_request_key: analysisIdentity.request_key,
          provider_id: analysisIdentity.provider_id,
        }
      : {}),
    legacy_decode_id: decode.draft_id,
    observations,
    advertiser_claims: advertiserClaims,
    interpretations,
    evidence_links: evidenceLinks,
    legacy_payload: decode,
  };
}

function acquisitionKind(entry: CaseLibraryEntry): AcquisitionSourceRecord['kind'] {
  const sourceUrl = entry.metadata?.source_url;
  if (entry.metadata === null) return 'direct_upload';
  if (!sourceUrl) return 'unknown';
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    if (hostname.endsWith('reddit.com')) return 'reddit';
    if (hostname.includes('facebook.com')) return 'meta_ad_library';
    return 'web';
  } catch {
    return 'unknown';
  }
}

function temporalKey(temporal: TemporalExtent): string {
  return JSON.stringify(temporal);
}

function assertion(
  advertisementId: string,
  field: string,
  value: string | TemporalExtent,
  certainty: MetadataAssertionRecord['certainty'],
  sourceRefs: readonly string[],
): MetadataAssertionRecord {
  return {
    schema_version: CORPUS_RECORD_VERSION,
    assertion_id: stableId(
      'assertion',
      `${advertisementId}|${field}|${JSON.stringify(value)}|${sourceRefs.join('|')}`,
    ),
    advertisement_id: advertisementId,
    field,
    value,
    certainty,
    source_refs: [...sourceRefs],
  };
}

function relationship(
  relation: string,
  sourceId: string,
  targetId: string,
  epistemicType: CorpusRelationshipRecord['epistemic_type'],
  sourceRefs: readonly string[],
  decodeRevisionId: string | null = null,
): CorpusRelationshipRecord {
  return {
    schema_version: CORPUS_RECORD_VERSION,
    relationship_id: stableId(
      'rel',
      `${relation}|${sourceId}|${targetId}|${epistemicType}|${decodeRevisionId ?? ''}`,
    ),
    relation,
    source_id: sourceId,
    target_id: targetId,
    epistemic_type: epistemicType,
    decode_revision_id: decodeRevisionId,
    source_refs: [...sourceRefs],
  };
}

export async function writeRevisionRelationships(
  store: CorpusStore,
  revision: DecodeRevisionRecord,
): Promise<number> {
  let count = 0;
  const write = async (record: CorpusRelationshipRecord) => {
    await store.putRelationship(record);
    count += 1;
  };
  for (const interpretation of revision.interpretations) {
    for (const concept of interpretation.concept_refs) {
      await write(
        relationship(
          'uses_concept',
          interpretation.interpretation_id,
          concept.concept_id,
          'analytical',
          [`decode-revision:${revision.revision_id}`],
          revision.revision_id,
        ),
      );
    }
  }
  return count;
}

export async function migrateLegacyCasesToCorpus(
  options: {
    readonly cases_dir?: string;
    readonly corpus_dir?: string;
    readonly generated_at?: string;
  } = {},
): Promise<CorpusMigrationResult> {
  const casesDir = options.cases_dir ?? 'cases';
  const corpusDir = options.corpus_dir ?? '.state/corpus-v0.1';
  const library = createCaseLibrary(casesDir);
  const store = createCorpusStore(corpusDir);
  const cases = await library.listCases();
  const sourceFingerprint = createHash('sha256')
    .update(
      JSON.stringify(
        cases.map((entry) => {
          const asset = entry.metadata?.asset ?? entry.decode?.asset;
          return {
            case_id: entry.case_id,
            asset_sha256: asset?.sha256 ?? null,
            decode_id: entry.decode?.draft_id ?? null,
            generated_at: entry.decode?.provider.generated_at ?? null,
          };
        }),
      ),
    )
    .digest('hex');
  const existingManifest = await store.readMigrationManifest();
  if (
    existingManifest !== null &&
    (existingManifest.pipeline_version !== LEGACY_CORPUS_MIGRATION_VERSION ||
      existingManifest.source_fingerprint !== sourceFingerprint)
  ) {
    throw new Error(
      `Corpus migration target ${store.root} contains a different projection (${existingManifest.pipeline_version}, ${existingManifest.source_fingerprint.slice(0, 12)}…). Use a fresh output directory instead of mixing migration states.`,
    );
  }
  const bySha = new Map<string, CaseLibraryEntry[]>();
  for (const entry of cases) {
    const asset = entry.metadata?.asset ?? entry.decode?.asset;
    if (!asset) continue;
    const group = bySha.get(asset.sha256) ?? [];
    group.push(entry);
    bySha.set(asset.sha256, group);
  }

  const exclusions: CorpusMigrationExclusion[] = [];
  for (const entry of cases) {
    const exclusion = legacyExclusionForCase(entry.case_id);
    if (exclusion) {
      exclusions.push({
        legacy_case_id: entry.case_id,
        reason: exclusion.reason,
        rationale: exclusion.rationale,
      });
    }
  }

  // Exact binary duplication is evidence about Asset identity, not sufficient proof of
  // Advertisement identity. Every duplicate group must have a reviewed disposition.
  for (const [sha256, shaGroup] of bySha) {
    if (shaGroup.length < 2) continue;
    const active = shaGroup.filter((entry) => legacyExclusionForCase(entry.case_id) === null);
    if (active.length < 2) continue;
    const identityGroups = new Set(
      active.map((entry) => legacyIdentityGroupForCase(entry.case_id)?.group_id ?? null),
    );
    if (identityGroups.size !== 1 || identityGroups.has(null)) {
      throw new Error(
        `Duplicate Asset SHA-256 ${sha256} requires an explicit reviewed Advertisement identity disposition for Cases: ${active
          .map((entry) => entry.case_id)
          .sort()
          .join(', ')}`,
      );
    }
  }

  const identityGroups = new Map<string, CaseLibraryEntry[]>();
  for (const entry of cases) {
    if (legacyExclusionForCase(entry.case_id)) continue;
    const reviewedGroup = legacyIdentityGroupForCase(entry.case_id);
    const identityKey = reviewedGroup
      ? `reviewed-group:${reviewedGroup.group_id}`
      : `legacy-case:${entry.case_id}`;
    const group = identityGroups.get(identityKey) ?? [];
    group.push(entry);
    identityGroups.set(identityKey, group);
  }

  let brandCount = 0;
  let acquisitionCount = 0;
  let assertionCount = 0;
  let decodeRevisionCount = 0;
  let relationshipCount = 0;
  const seenBrands = new Set<string>();
  const seenAssets = new Set<string>();
  const warnings: string[] = exclusions.map(
    (item) => `${item.legacy_case_id} excluded from Corpus migration: ${item.rationale}`,
  );

  for (const [identityKey, groupUnsorted] of [...identityGroups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const group = [...groupUnsorted].sort((a, b) => a.case_id.localeCompare(b.case_id));
    const advertisementId = advertisementIdForLegacyIdentity(identityKey);
    const acquisitionIds: string[] = [];
    const decodeRevisionIds: string[] = [];
    const metadataAssertionIds: string[] = [];
    const brandAssertionIds = new Map<string, string[]>();
    const brandIds = new Set<string>();
    const temporalCandidates = new Map<string, TemporalExtent>();
    const assetPaths = new Map<string, Set<string>>();
    const assetAcquisitionIds = new Map<string, Set<string>>();

    for (const entry of group) {
      const asset = entry.metadata?.asset ?? entry.decode?.asset;
      if (!asset) continue;
      const assetId = assetIdForSha256(asset.sha256);
      const paths = assetPaths.get(assetId) ?? new Set<string>();
      paths.add(asset.path);
      assetPaths.set(assetId, paths);

      const acquisitionId = stableId(
        'acq',
        `${entry.case_id}|${entry.metadata?.source_url ?? 'direct-upload'}`,
      );
      const acquisition: AcquisitionSourceRecord = {
        schema_version: CORPUS_RECORD_VERSION,
        acquisition_source_id: acquisitionId,
        kind: acquisitionKind(entry),
        source_url: entry.metadata?.source_url ?? null,
        source_title: entry.metadata?.summary ?? null,
        legacy_case_id: entry.case_id,
      };
      await store.putAcquisitionSource(acquisition);
      acquisitionIds.push(acquisitionId);
      acquisitionCount += 1;
      const assetSources = assetAcquisitionIds.get(assetId) ?? new Set<string>();
      assetSources.add(acquisitionId);
      assetAcquisitionIds.set(assetId, assetSources);

      const curated = curatedCorpusMetadata(entry.case_id);
      if (curated.brand) {
        const brand: BrandRecord = {
          schema_version: CORPUS_RECORD_VERSION,
          brand_id: curated.brand.brand_id,
          canonical_name: curated.brand.canonical_name,
          aliases: curated.brand.aliases,
          parent_organization_id: null,
          country_of_origin: null,
          status: 'unknown',
        };
        await store.putBrand(brand);
        if (!seenBrands.has(brand.brand_id)) {
          seenBrands.add(brand.brand_id);
          brandCount += 1;
        }
        brandIds.add(brand.brand_id);
        const item = assertion(
          advertisementId,
          `brand:${brand.brand_id}`,
          brand.brand_id,
          curated.brand.certainty,
          curated.brand.source_refs,
        );
        await store.putMetadataAssertion(item);
        metadataAssertionIds.push(item.assertion_id);
        const ids = brandAssertionIds.get(brand.brand_id) ?? [];
        ids.push(item.assertion_id);
        brandAssertionIds.set(brand.brand_id, ids);
        assertionCount += 1;
      }
      if (curated.temporal) {
        temporalCandidates.set(temporalKey(curated.temporal.temporal), curated.temporal.temporal);
        const item = assertion(
          advertisementId,
          'temporal',
          curated.temporal.temporal,
          curated.temporal.certainty,
          curated.temporal.source_refs,
        );
        await store.putMetadataAssertion(item);
        metadataAssertionIds.push(item.assertion_id);
        assertionCount += 1;
      }

      if (entry.decode) {
        const revision = normalizeDecodeRevision(
          advertisementId,
          assetId,
          entry.case_id,
          entry.decode,
        );
        await store.putDecodeRevision(revision);
        decodeRevisionIds.push(revision.revision_id);
        decodeRevisionCount += 1;
        relationshipCount += await writeRevisionRelationships(store, revision);
      }
    }

    if (temporalCandidates.size > 1) {
      warnings.push(
        `${advertisementId} has conflicting curated temporal assertions; Advertisement temporal remains unknown.`,
      );
    }
    if (brandIds.size > 1) {
      warnings.push(
        `${advertisementId} has multiple curated Brand identities: ${[...brandIds].join(', ')}.`,
      );
    }
    if (group.length > 1) {
      const reviewedGroup = legacyIdentityGroupForCase(group[0]!.case_id);
      warnings.push(
        `${advertisementId} consolidates ${group.length} legacy Cases under reviewed identity ${reviewedGroup?.group_id ?? identityKey}.`,
      );
    }

    const temporal =
      temporalCandidates.size === 1
        ? [...temporalCandidates.values()][0]!
        : UNKNOWN_TEMPORAL_EXTENT;
    const advertisementAssetIds = [...assetPaths.keys()].sort();
    for (const assetId of advertisementAssetIds) {
      const originalSha = group
        .map((entry) => entry.metadata?.asset ?? entry.decode?.asset)
        .find((asset) => asset && assetIdForSha256(asset.sha256) === assetId)?.sha256;
      if (!originalSha) throw new Error(`Cannot resolve SHA-256 for migrated Asset ${assetId}.`);
      const assetRecord: AssetRecord = {
        schema_version: CORPUS_RECORD_VERSION,
        asset_id: assetId,
        media_type: 'image',
        sha256: originalSha,
        legacy_paths: [...(assetPaths.get(assetId) ?? [])].sort(),
        acquisition_source_ids: [...(assetAcquisitionIds.get(assetId) ?? [])].sort(),
      };
      await store.putAsset(assetRecord);
      seenAssets.add(assetId);
    }

    const advertisement: AdvertisementRecord = {
      schema_version: CORPUS_RECORD_VERSION,
      advertisement_id: advertisementId,
      asset_ids: advertisementAssetIds,
      brand_ids: [...brandIds].sort(),
      product_ids: [],
      campaign_ids: [],
      placement_ids: [],
      market_ids: [],
      temporal,
      acquisition_source_ids: [...new Set(acquisitionIds)].sort(),
      metadata_assertion_ids: [...new Set(metadataAssertionIds)].sort(),
      decode_revision_ids: [...new Set(decodeRevisionIds)].sort(),
      legacy_case_ids: group.map((entry) => entry.case_id),
    };
    await store.putAdvertisement(advertisement);
    for (const assetId of advertisement.asset_ids) {
      const assetCases = group
        .filter((entry) => {
          const asset = entry.metadata?.asset ?? entry.decode?.asset;
          return asset !== undefined && assetIdForSha256(asset.sha256) === assetId;
        })
        .map((entry) => `legacy-case:${entry.case_id}`);
      await store.putRelationship(
        relationship('has_asset', advertisementId, assetId, 'asserted_factual', assetCases),
      );
      relationshipCount += 1;
    }
    for (const brandId of advertisement.brand_ids) {
      const relatedAssertions = (brandAssertionIds.get(brandId) ?? []).map(
        (id) => `metadata-assertion:${id}`,
      );
      await store.putRelationship(
        relationship('has_brand', advertisementId, brandId, 'asserted_factual', relatedAssertions),
      );
      relationshipCount += 1;
    }
  }

  const reviewedIdentityGroups = [...identityGroups.values()].filter(
    (group) => group.length > 1,
  ).length;
  const result: CorpusMigrationResult = {
    corpus_dir: store.root,
    advertisement_count: identityGroups.size,
    asset_count: seenAssets.size,
    brand_count: brandCount,
    acquisition_source_count: acquisitionCount,
    metadata_assertion_count: assertionCount,
    decode_revision_count: decodeRevisionCount,
    relationship_count: relationshipCount,
    legacy_case_count: cases.length,
    migrated_legacy_case_count: cases.length - exclusions.length,
    excluded_legacy_case_count: exclusions.length,
    duplicate_asset_groups: [...bySha.values()].filter((group) => group.length > 1).length,
    reviewed_identity_groups: reviewedIdentityGroups,
    warnings,
  };
  const manifest: CorpusMigrationManifest = {
    schema_version: CORPUS_RECORD_VERSION,
    generated_at: options.generated_at ?? new Date().toISOString(),
    source_cases_dir: casesDir,
    source_fingerprint: sourceFingerprint,
    pipeline_version: LEGACY_CORPUS_MIGRATION_VERSION,
    ontology_version: CORPUS_ONTOLOGY_VERSION,
    counts: {
      advertisements: result.advertisement_count,
      assets: result.asset_count,
      brands: result.brand_count,
      acquisition_sources: result.acquisition_source_count,
      metadata_assertions: result.metadata_assertion_count,
      decode_revisions: result.decode_revision_count,
      relationships: result.relationship_count,
      legacy_cases: result.legacy_case_count,
      migrated_legacy_cases: result.migrated_legacy_case_count,
      excluded_legacy_cases: result.excluded_legacy_case_count,
      duplicate_asset_groups: result.duplicate_asset_groups,
      reviewed_identity_groups: result.reviewed_identity_groups,
    },
    warnings,
    exclusions,
  };
  await store.writeMigrationManifest(manifest);
  return result;
}
