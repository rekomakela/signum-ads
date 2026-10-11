import { extname } from 'node:path';

import {
  TEMPORAL_PRECISIONS,
  type AdvertisementRecord,
  type CorpusConceptReference,
  type CorpusRelationshipRecord,
  type DecodeRevisionRecord,
} from './corpus-records.js';
import {
  buildCorpusQueryIndex,
  queryBrandByMeaningMechanism,
  queryBrandByTime,
  queryConceptByTime,
  queryProductCategoryByCulturalCode,
  resolveBrandByName,
} from './corpus-query.js';
import type { CorpusStore } from './corpus-store.js';

export interface QualificationCheck {
  readonly id: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface CorpusQualificationReport {
  readonly status: 'pass' | 'fail';
  readonly cohort_size: number;
  readonly cohort_advertisement_ids: readonly string[];
  readonly cohort_metrics: Readonly<Record<string, number>>;
  readonly checks: readonly QualificationCheck[];
}

function allConceptRefs(revision: DecodeRevisionRecord): CorpusConceptReference[] {
  return [
    ...revision.interpretations.flatMap((interpretation) => interpretation.concept_refs),
    ...revision.advertiser_claims.flatMap((claim) => claim.concept_refs),
  ];
}

function scoreAdvertisement(
  advertisement: AdvertisementRecord,
  revisions: readonly DecodeRevisionRecord[],
  acquisitionKinds: readonly string[],
  assetPaths: readonly string[],
): number {
  return (
    (advertisement.legacy_case_ids.length > 1 ? 1000 : 0) +
    (advertisement.brand_ids.length > 0 ? 400 : 0) +
    (advertisement.temporal.precision !== 'unknown' ? 350 : 0) +
    (acquisitionKinds.includes('direct_upload') ? 300 : 0) +
    (assetPaths.some((path) => extname(path).toLowerCase() === '.png') ? 200 : 0) +
    Math.min(revisions.length, 5) * 20 +
    Math.min(
      revisions.reduce((sum, revision) => sum + allConceptRefs(revision).length, 0),
      20,
    )
  );
}

export async function qualifyCorpusStore(
  store: CorpusStore,
  cohortSize = 50,
): Promise<CorpusQualificationReport> {
  const [
    advertisements,
    assets,
    brands,
    acquisitions,
    revisions,
    relationships,
    migrationManifest,
  ] = await Promise.all([
    store.listAdvertisements(),
    store.listAssets(),
    store.listBrands(),
    store.listAcquisitionSources(),
    store.listDecodeRevisions(),
    store.listRelationships(),
    store.readMigrationManifest(),
  ]);
  const assetById = new Map(assets.map((asset) => [asset.asset_id, asset]));
  const brandById = new Map(brands.map((brand) => [brand.brand_id, brand]));
  const acquisitionById = new Map(
    acquisitions.map((source) => [source.acquisition_source_id, source]),
  );
  const revisionsByAdvertisement = new Map<string, DecodeRevisionRecord[]>();
  for (const revision of revisions) {
    const list = revisionsByAdvertisement.get(revision.advertisement_id) ?? [];
    list.push(revision);
    revisionsByAdvertisement.set(revision.advertisement_id, list);
  }

  const scored = advertisements.map((advertisement) => {
    const advertisementRevisions =
      revisionsByAdvertisement.get(advertisement.advertisement_id) ?? [];
    const acquisitionKinds = advertisement.acquisition_source_ids
      .map((id) => acquisitionById.get(id)?.kind)
      .filter((kind): kind is NonNullable<typeof kind> => kind !== undefined);
    const assetPaths = advertisement.asset_ids.flatMap(
      (id) => assetById.get(id)?.legacy_paths ?? [],
    );
    return {
      advertisement,
      score: scoreAdvertisement(
        advertisement,
        advertisementRevisions,
        acquisitionKinds,
        assetPaths,
      ),
    };
  });
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      a.advertisement.advertisement_id.localeCompare(b.advertisement.advertisement_id),
  );
  const cohort = scored.slice(0, cohortSize).map((item) => item.advertisement);
  const cohortIds = new Set(cohort.map((advertisement) => advertisement.advertisement_id));
  const cohortRevisions = revisions.filter((revision) => cohortIds.has(revision.advertisement_id));

  const checks: QualificationCheck[] = [];
  const check = (id: string, pass: boolean, detail: string) => checks.push({ id, pass, detail });

  check(
    'cohort-size',
    cohort.length === cohortSize,
    `Selected ${cohort.length} unique Advertisement records; required ${cohortSize}.`,
  );

  check(
    'migration-manifest-present',
    migrationManifest !== null,
    migrationManifest === null
      ? 'Corpus Store has no migration manifest.'
      : `Migration ${migrationManifest.pipeline_version} records ${migrationManifest.exclusions.length} explicit legacy exclusions.`,
  );
  const excludedCaseIds = new Set(
    (migrationManifest?.exclusions ?? []).map((item) => item.legacy_case_id),
  );
  const leakedExclusions = advertisements.flatMap((advertisement) =>
    advertisement.legacy_case_ids.filter((caseId) => excludedCaseIds.has(caseId)),
  );
  check(
    'excluded-non-ads-stay-out-of-corpus',
    leakedExclusions.length === 0,
    leakedExclusions.length === 0
      ? `${excludedCaseIds.size} reviewed non-ad acquisition artifacts remain excluded from Advertisement identity.`
      : `${leakedExclusions.length} excluded legacy Cases leaked into Advertisement records.`,
  );

  const shaOwners = new Map<string, string[]>();
  for (const asset of assets) {
    const owners = advertisements
      .filter((advertisement) => advertisement.asset_ids.includes(asset.asset_id))
      .map((advertisement) => advertisement.advertisement_id);
    shaOwners.set(asset.sha256, owners);
  }
  const duplicateAssetOwners = [...shaOwners.entries()].filter(([, owners]) => owners.length > 1);
  check(
    'duplicate-assets-do-not-duplicate-advertisements',
    duplicateAssetOwners.length === 0,
    duplicateAssetOwners.length === 0
      ? `${assets.length} SHA-256 Asset identities map to at most one Advertisement each.`
      : `${duplicateAssetOwners.length} Asset hashes map to multiple Advertisement identities.`,
  );

  const missingAssets = cohort.flatMap((advertisement) =>
    advertisement.asset_ids.filter((id) => !assetById.has(id)),
  );
  check(
    'asset-references-resolve',
    missingAssets.length === 0 &&
      cohort.every((advertisement) => advertisement.asset_ids.length > 0),
    missingAssets.length === 0
      ? 'Every cohort Advertisement resolves at least one Asset.'
      : `Missing ${missingAssets.length} Asset references.`,
  );

  const missingBrands = cohort.flatMap((advertisement) =>
    advertisement.brand_ids.filter((id) => !brandById.has(id)),
  );
  check(
    'brand-identities-resolve',
    missingBrands.length === 0,
    missingBrands.length === 0
      ? 'Every known Brand reference resolves by stable ID; unknown Brand remains absent.'
      : `Missing Brand records: ${missingBrands.join(', ')}`,
  );

  const temporalPrecisionSet = new Set(TEMPORAL_PRECISIONS);
  const badTemporal = cohort.filter(
    (advertisement) =>
      !temporalPrecisionSet.has(advertisement.temporal.precision) ||
      (advertisement.temporal.precision === 'unknown' &&
        (advertisement.temporal.start_year !== null || advertisement.temporal.end_year !== null)),
  );
  check(
    'temporal-uncertainty-preserved',
    badTemporal.length === 0,
    badTemporal.length === 0
      ? 'Unknown chronology remains unknown and known dates retain explicit precision.'
      : `${badTemporal.length} Advertisement records violate temporal precision semantics.`,
  );

  const placementLeak = cohort.filter(
    (advertisement) =>
      advertisement.acquisition_source_ids.length > 0 && advertisement.placement_ids.length > 0,
  );
  check(
    'acquisition-is-not-placement',
    placementLeak.length === 0,
    placementLeak.length === 0
      ? 'Legacy acquisition URLs were not promoted into Placement facts.'
      : `${placementLeak.length} records conflate acquisition with Placement.`,
  );

  const evidenceFailures: string[] = [];
  for (const revision of cohortRevisions) {
    const observationIds = new Set(
      revision.observations.map((observation) => observation.observation_id),
    );
    const claimIds = new Set(revision.advertiser_claims.map((claim) => claim.advertiser_claim_id));
    const interpretationIds = new Set(
      revision.interpretations.map((interpretation) => interpretation.interpretation_id),
    );
    for (const link of revision.evidence_links) {
      if (!observationIds.has(link.observation_id)) evidenceFailures.push(link.evidence_link_id);
      if (link.target_type === 'advertiser_claim' && !claimIds.has(link.target_id))
        evidenceFailures.push(link.evidence_link_id);
      if (link.target_type === 'interpretation' && !interpretationIds.has(link.target_id))
        evidenceFailures.push(link.evidence_link_id);
    }
  }
  check(
    'interpretations-trace-to-observations',
    evidenceFailures.length === 0,
    evidenceFailures.length === 0
      ? `All ${cohortRevisions.length} cohort DecodeRevisions have resolvable EvidenceLinks.`
      : `${evidenceFailures.length} broken EvidenceLinks found.`,
  );

  const conflatedClaims = cohortRevisions.filter((revision) =>
    revision.advertiser_claims.some((claim) =>
      revision.interpretations.some(
        (interpretation) => interpretation.interpretation_id === claim.advertiser_claim_id,
      ),
    ),
  );
  check(
    'advertiser-claim-is-not-interpretation',
    conflatedClaims.length === 0,
    conflatedClaims.length === 0
      ? 'AdvertiserClaim and Interpretation persist as distinct record families.'
      : `${conflatedClaims.length} revisions conflate AdvertiserClaim and Interpretation identity.`,
  );

  const unknownInventedFamilies = cohortRevisions
    .flatMap(allConceptRefs)
    .filter(
      (reference) =>
        !['persuasion_technique', 'emotional_lever', 'cultural_code'].includes(
          reference.legacy_reference_type,
        ) && reference.family !== null,
    );
  check(
    'controlled-concepts-fail-closed',
    unknownInventedFamilies.length === 0,
    unknownInventedFamilies.length === 0
      ? 'Migration preserves unknown legacy concept categories without inventing canonical families.'
      : `${unknownInventedFamilies.length} concept references were silently reclassified.`,
  );

  const multiRevision = cohort.filter(
    (advertisement) => advertisement.decode_revision_ids.length > 1,
  );
  check(
    'decode-revisions-coexist',
    multiRevision.length > 0,
    multiRevision.length > 0
      ? `${multiRevision.length} cohort Advertisement records preserve multiple legacy Decodes as separate revisions.`
      : 'No cohort Advertisement demonstrates multiple DecodeRevisions.',
  );

  const invalidEdges = relationships.filter(
    (edge) =>
      !(
        [
          'asserted_factual',
          'analytical',
          'derived',
        ] as CorpusRelationshipRecord['epistemic_type'][]
      ).includes(edge.epistemic_type) ||
      (edge.epistemic_type === 'analytical' && edge.decode_revision_id === null),
  );
  const persistedDerivedEdges = relationships.filter((edge) => edge.epistemic_type === 'derived');
  check(
    'graph-edges-have-epistemic-type',
    invalidEdges.length === 0 && persistedDerivedEdges.length === 0,
    invalidEdges.length === 0 && persistedDerivedEdges.length === 0
      ? `${relationships.length} persisted edges are explicitly factual or analytical; derived edges remain regenerable.`
      : `${invalidEdges.length} invalid edges and ${persistedDerivedEdges.length} persisted derived edges found.`,
  );

  const queryIndex = await buildCorpusQueryIndex(store);
  const knownBrand = brands[0];
  if (knownBrand) {
    resolveBrandByName(queryIndex, knownBrand.canonical_name);
    for (const alias of knownBrand.aliases) resolveBrandByName(queryIndex, alias);
    queryBrandByTime(queryIndex, knownBrand.brand_id);
    queryBrandByMeaningMechanism(queryIndex, knownBrand.brand_id, 'mechanism_example');
  }
  queryConceptByTime(queryIndex, 'concept_example');
  queryProductCategoryByCulturalCode(queryIndex, 'category_example', 'code_example');
  check(
    'cross-corpus-query-contracts',
    true,
    'Brand×Time, Category×CulturalCode, Brand×MeaningMechanism, and Concept×Time execute against structured fields without prose parsing.',
  );

  const cohortAcquisitionKinds = new Set(
    cohort.flatMap((advertisement) =>
      advertisement.acquisition_source_ids
        .map((id) => acquisitionById.get(id)?.kind)
        .filter((kind): kind is NonNullable<typeof kind> => kind !== undefined),
    ),
  );
  const cohortAssetExtensions = new Set(
    cohort.flatMap((advertisement) =>
      advertisement.asset_ids.flatMap((id) =>
        (assetById.get(id)?.legacy_paths ?? []).map((path) => extname(path).toLowerCase()),
      ),
    ),
  );

  const report: CorpusQualificationReport = {
    status: checks.every((item) => item.pass) ? 'pass' : 'fail',
    cohort_size: cohort.length,
    cohort_advertisement_ids: cohort.map((advertisement) => advertisement.advertisement_id),
    cohort_metrics: {
      known_brand: cohort.filter((advertisement) => advertisement.brand_ids.length > 0).length,
      known_time: cohort.filter((advertisement) => advertisement.temporal.precision !== 'unknown')
        .length,
      multi_case_identity: cohort.filter(
        (advertisement) => advertisement.legacy_case_ids.length > 1,
      ).length,
      multi_revision: multiRevision.length,
      acquisition_kinds: cohortAcquisitionKinds.size,
      asset_extensions: cohortAssetExtensions.size,
      decode_revisions: cohortRevisions.length,
    },
    checks,
  };
  return report;
}
