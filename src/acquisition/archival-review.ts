import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  buildAcquisitionReviewManifest,
  listStagedAcquisitions,
  type AcquisitionReviewItem,
  type StagedAcquisitionRecord,
} from './acquisition-staging.js';
import type {
  PerceptualIdentityCheckRecord,
  PerceptualIdentityGuard,
} from './perceptual-identity.js';
import type {
  SourceCorroborationCheck,
  SourceCorroborationGuard,
} from './wikimedia-commons-evidence.js';
import {
  ACQUISITION_DECISION_VERSION,
  listAcquisitionDecisionReceipts,
  type AcquisitionDecisionItem,
  type AcquisitionDecisionManifest,
} from './review-promotion.js';
import type { CorpusStore } from '../corpus/corpus-store.js';
import type { ModelImageInput } from '../providers/model-client.js';

export const ARCHIVAL_REVIEW_SCHEMA_VERSION = 'signum-archival-review.v0.1' as const;
export const ARCHIVAL_REVIEW_METHOD_VERSION = 'signum-archival-review-method.v0.1' as const;
export const ARCHIVAL_REVIEW_PROMPT_VERSION = 'signum-archival-review-prompt.v0.2' as const;
export const AUTOMATED_ARCHIVAL_REVIEW_POLICY_VERSION =
  'signum-automated-archival-review-policy.v0.3' as const;

export const ARCHIVAL_REVIEW_CLASSIFICATIONS = [
  'single_advertisement',
  'multiple_advertisements',
  'not_an_advertisement',
  'uncertain',
] as const;
export type ArchivalReviewClassification = (typeof ARCHIVAL_REVIEW_CLASSIFICATIONS)[number];
export type ArchivalReviewConfidence = 'high' | 'medium' | 'low';

export interface ArchivalReviewModelOutput {
  readonly classification: ArchivalReviewClassification;
  readonly confidence: ArchivalReviewConfidence;
  readonly rationale: string;
}

export interface ArchivalReviewClient {
  reviewImage(input: ModelImageInput): Promise<ArchivalReviewModelOutput>;
}

export interface ArchivalReviewProviderIdentity {
  readonly provider_id: string;
  readonly provider_name: string;
  readonly provider_version: string;
  readonly model: string;
}

export interface ArchivalReviewIdentity extends ArchivalReviewProviderIdentity {
  readonly asset_sha256: string;
  readonly review_schema_version: typeof ARCHIVAL_REVIEW_SCHEMA_VERSION;
  readonly method_version: typeof ARCHIVAL_REVIEW_METHOD_VERSION;
  readonly prompt_version: typeof ARCHIVAL_REVIEW_PROMPT_VERSION;
}

export interface ArchivalReviewRecord extends ArchivalReviewIdentity {
  readonly review_key: string;
  readonly reviewed_at: string;
  readonly result: ArchivalReviewModelOutput;
}

export interface AutomatedReviewFailure {
  readonly acquisition_keys: readonly string[];
  readonly asset_sha256: string;
  readonly reason: string;
}

export interface AutomatedReviewBatchResult {
  readonly manifest: AcquisitionDecisionManifest;
  readonly reviewed_assets: number;
  readonly cache_hits: number;
  readonly inference_runs: number;
  readonly skipped_existing_owner: number;
  readonly skipped_ambiguous_owner: number;
  readonly skipped_decided: number;
  readonly identity_checks: {
    readonly clear: number;
    readonly near_duplicate: number;
    readonly unavailable: number;
  };
  readonly source_corroboration_checks: {
    readonly supported: number;
    readonly unsupported: number;
    readonly not_applicable: number;
  };
  readonly counts: {
    readonly accept_new: number;
    readonly attach_existing: number;
    readonly reject_non_ad: number;
    readonly quarantine: number;
  };
  readonly failures: readonly AutomatedReviewFailure[];
}

export function assertAutomatedReviewPromotable(result: AutomatedReviewBatchResult): void {
  const runtimeFailures = result.failures.length;
  const unavailableIdentityChecks = result.identity_checks.unavailable;
  if (runtimeFailures === 0 && unavailableIdentityChecks === 0) return;
  throw new Error(
    `Automated review is not promotable: ${runtimeFailures} inference/runtime failure(s), ${unavailableIdentityChecks} unavailable perceptual identity check(s). Refusing promotion so transient infrastructure failures cannot become durable quarantine decisions.`,
  );
}

export interface AutomatedReviewBatchOptions {
  readonly stage_dir: string;
  readonly store: CorpusStore;
  readonly client: ArchivalReviewClient;
  readonly provider: ArchivalReviewProviderIdentity;
  readonly identity_guard: PerceptualIdentityGuard;
  readonly source_corroboration_guard: SourceCorroborationGuard;
  readonly concurrency?: number;
  readonly limit?: number;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function reviewIdentity(
  assetSha256: string,
  provider: ArchivalReviewProviderIdentity,
): ArchivalReviewIdentity {
  return {
    asset_sha256: assetSha256,
    review_schema_version: ARCHIVAL_REVIEW_SCHEMA_VERSION,
    method_version: ARCHIVAL_REVIEW_METHOD_VERSION,
    prompt_version: ARCHIVAL_REVIEW_PROMPT_VERSION,
    ...provider,
  };
}

export function createArchivalReviewKey(
  assetSha256: string,
  provider: ArchivalReviewProviderIdentity,
): string {
  const identity = reviewIdentity(assetSha256, provider);
  return `archival_review_${createHash('sha256').update(JSON.stringify(identity)).digest('hex')}`;
}

function isClassification(value: string): value is ArchivalReviewClassification {
  return (ARCHIVAL_REVIEW_CLASSIFICATIONS as readonly string[]).includes(value);
}

export function validateArchivalReviewOutput(value: unknown): ArchivalReviewModelOutput {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Archival reviewer returned a non-object result.');
  }
  const record = value as Record<string, unknown>;
  const classification = typeof record.classification === 'string' ? record.classification : '';
  const confidence = typeof record.confidence === 'string' ? record.confidence : '';
  const rationale = typeof record.rationale === 'string' ? record.rationale.trim() : '';
  if (!isClassification(classification)) {
    throw new Error(`Invalid archival review classification: ${classification || '(missing)'}.`);
  }
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
    throw new Error(`Invalid archival review confidence: ${confidence || '(missing)'}.`);
  }
  if (rationale.length === 0) throw new Error('Archival review rationale is required.');
  return { classification, confidence, rationale };
}

function assertCachedRecord(
  record: ArchivalReviewRecord,
  expected: ArchivalReviewIdentity,
  reviewKey: string,
): void {
  if (record.review_key !== reviewKey)
    throw new Error(`Archival review cache key mismatch: ${reviewKey}.`);
  const actual = {
    asset_sha256: record.asset_sha256,
    review_schema_version: record.review_schema_version,
    method_version: record.method_version,
    prompt_version: record.prompt_version,
    provider_id: record.provider_id,
    provider_name: record.provider_name,
    provider_version: record.provider_version,
    model: record.model,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Archival review cache identity mismatch: ${reviewKey}.`);
  }
  validateArchivalReviewOutput(record.result);
}

async function readOrCreateReview(
  stageDir: string,
  staged: StagedAcquisitionRecord,
  client: ArchivalReviewClient,
  provider: ArchivalReviewProviderIdentity,
): Promise<{ record: ArchivalReviewRecord; cache_hit: boolean }> {
  const identity = reviewIdentity(staged.sha256, provider);
  const key = createArchivalReviewKey(staged.sha256, provider);
  const pathname = resolve(stageDir, 'auto-reviews', `${key}.json`);
  try {
    const existing = JSON.parse(await readFile(pathname, 'utf8')) as ArchivalReviewRecord;
    assertCachedRecord(existing, identity, key);
    return { record: existing, cache_hit: true };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const bytes = await readFile(resolve(stageDir, staged.storage_path));
  const output = validateArchivalReviewOutput(
    await client.reviewImage({ mime_type: staged.mime_type, base64: bytes.toString('base64') }),
  );
  const record: ArchivalReviewRecord = {
    review_key: key,
    reviewed_at: new Date().toISOString(),
    ...identity,
    result: output,
  };
  await mkdir(dirname(pathname), { recursive: true });
  const body = stableJson(record);
  const temp = `${pathname}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, body, { encoding: 'utf8', flag: 'wx' });
  try {
    await rename(temp, pathname);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = JSON.parse(await readFile(pathname, 'utf8')) as ArchivalReviewRecord;
    assertCachedRecord(existing, identity, key);
    return { record: existing, cache_hit: true };
  }
  return { record, cache_hit: false };
}

function rationale(prefix: string, review?: ArchivalReviewRecord): string {
  return review ? `${prefix} ${review.result.rationale}` : prefix;
}

function evidenceRefs(
  review?: ArchivalReviewRecord,
  extra: readonly string[] = [],
): readonly string[] {
  return [
    ...(review ? [`archival-review:${review.review_key}`] : []),
    ...extra,
    `automated-review-policy:${AUTOMATED_ARCHIVAL_REVIEW_POLICY_VERSION}`,
  ];
}

function baseDecision(
  item: AcquisitionReviewItem,
): Omit<AcquisitionDecisionItem, 'decision' | 'advertisement_id' | 'rationale'> {
  return {
    acquisition_key: item.acquisition_key,
    sha256: item.sha256,
    source_title: item.source_title,
    source_url: item.source_url,
    review_state: item.review_state,
    proposed_advertisement_id: item.proposed_advertisement_id,
  };
}

function decisionsForGroup(
  items: readonly AcquisitionReviewItem[],
  review: ArchivalReviewRecord | null,
  identityCheck: PerceptualIdentityCheckRecord | null,
  sourceCheck: SourceCorroborationCheck | null,
  failureReason: string | null,
): AcquisitionDecisionItem[] {
  const sorted = [...items].sort((left, right) =>
    left.acquisition_key.localeCompare(right.acquisition_key),
  );
  const first = sorted[0]!;
  if (first.review_state === 'blocked_ambiguous_owner') {
    return sorted.map((item) => ({
      ...baseDecision(item),
      decision: 'quarantine',
      advertisement_id: null,
      rationale:
        'Exact Asset already resolves to multiple Corpus Advertisements; manual identity repair is required.',
      evidence_refs: evidenceRefs(
        undefined,
        item.corpus_advertisement_ids.map((id) => `corpus-advertisement:${id}`),
      ),
    }));
  }
  if (first.review_state === 'existing_owner') {
    const owner = first.advertisement_id!;
    return sorted.map((item) => ({
      ...baseDecision(item),
      decision: 'attach_existing',
      advertisement_id: owner,
      rationale: 'Exact Asset SHA-256 is already owned by one canonical Corpus Advertisement.',
      evidence_refs: evidenceRefs(undefined, [
        `corpus-advertisement:${owner}`,
        `asset-sha256:${item.sha256}`,
      ]),
    }));
  }
  if (failureReason !== null || review === null) {
    return sorted.map((item) => ({
      ...baseDecision(item),
      decision: 'quarantine',
      advertisement_id: null,
      rationale: `Automated archival review unavailable: ${failureReason ?? 'unknown failure'}`,
      evidence_refs: evidenceRefs(),
    }));
  }

  const result = review.result;
  if (result.classification === 'not_an_advertisement' && result.confidence === 'high') {
    return sorted.map((item) => ({
      ...baseDecision(item),
      decision: 'reject_non_ad',
      advertisement_id: null,
      rationale: rationale(
        'Automated archival review classified this Asset as not an advertisement.',
        review,
      ),
      evidence_refs: evidenceRefs(review),
    }));
  }
  if (result.classification === 'single_advertisement' && result.confidence === 'high') {
    if (identityCheck === null || identityCheck.status !== 'clear') {
      const identityReason =
        identityCheck === null
          ? 'Perceptual identity preflight was not available.'
          : identityCheck.status === 'near_duplicate'
            ? `Perceptual identity preflight found ${identityCheck.matches.length} near-duplicate Asset candidate(s); canonical Advertisement identity remains ambiguous.`
            : `Perceptual identity preflight is unavailable: ${identityCheck.failure_reason ?? 'unknown failure'}`;
      const identityRefs =
        identityCheck === null
          ? []
          : [
              `perceptual-identity-check:${identityCheck.check_key}`,
              ...identityCheck.matches.flatMap((match) => match.references),
            ];
      return sorted.map((item) => ({
        ...baseDecision(item),
        decision: 'quarantine',
        advertisement_id: null,
        rationale: rationale(identityReason, review),
        evidence_refs: evidenceRefs(review, identityRefs),
      }));
    }

    if (sourceCheck === null) {
      return sorted.map((item) => ({
        ...baseDecision(item),
        decision: 'quarantine',
        advertisement_id: null,
        rationale: rationale(
          'Archival source corroboration was not available; automated Advertisement identity remains unqualified.',
          review,
        ),
        evidence_refs: evidenceRefs(review, [
          `perceptual-identity-check:${identityCheck.check_key}`,
        ]),
      }));
    }
    if (sourceCheck.status === 'unsupported') {
      return sorted.map((item) => ({
        ...baseDecision(item),
        decision: 'quarantine',
        advertisement_id: null,
        rationale: rationale(sourceCheck.rationale, review),
        evidence_refs: evidenceRefs(review, [
          `perceptual-identity-check:${identityCheck.check_key}`,
          ...sourceCheck.evidence_refs,
        ]),
      }));
    }

    const canonicalId = first.proposed_advertisement_id!;
    return sorted.map((item, index) => ({
      ...baseDecision(item),
      decision: index === 0 ? 'accept_new' : 'attach_existing',
      advertisement_id: index === 0 ? null : canonicalId,
      rationale: rationale(
        index === 0
          ? sourceCheck.status === 'supported'
            ? 'Automated archival review found one clear advertisement, perceptual identity found no near duplicate, and archival source metadata explicitly corroborates advertising; the first exact-Asset acquisition establishes the reviewed archival identity.'
            : 'Automated archival review found one clear advertisement and perceptual identity found no near duplicate; no source-specific corroboration contract applies, so the first exact-Asset acquisition establishes the reviewed archival identity.'
          : 'Exact staged Asset duplicate attaches to the same reviewed Advertisement identity.',
        review,
      ),
      evidence_refs: evidenceRefs(review, [
        `asset-sha256:${item.sha256}`,
        `perceptual-identity-check:${identityCheck.check_key}`,
        ...sourceCheck.evidence_refs,
      ]),
    }));
  }

  const reason =
    result.classification === 'multiple_advertisements'
      ? 'Image contains multiple distinct advertisements.'
      : result.classification === 'uncertain'
        ? 'Image could not be classified as one advertisement with sufficient certainty.'
        : 'Automated review confidence is below the auto-promotion threshold.';
  return sorted.map((item) => ({
    ...baseDecision(item),
    decision: 'quarantine',
    advertisement_id: null,
    rationale: rationale(reason, review),
    evidence_refs: evidenceRefs(review),
  }));
}

export async function runAutomatedArchivalReview(
  options: AutomatedReviewBatchOptions,
): Promise<AutomatedReviewBatchResult> {
  const concurrency = options.concurrency ?? 1;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error('Automated review concurrency must be an integer between 1 and 16.');
  }
  const reviewManifest = await buildAcquisitionReviewManifest(options.store, options.stage_dir);
  const stagedRecords = await listStagedAcquisitions(options.stage_dir);
  const stagedBySha = new Map<string, StagedAcquisitionRecord>();
  for (const record of stagedRecords)
    if (!stagedBySha.has(record.sha256)) stagedBySha.set(record.sha256, record);

  const groups = new Map<string, AcquisitionReviewItem[]>();
  for (const item of reviewManifest.items) {
    const group = groups.get(item.sha256) ?? [];
    group.push(item);
    groups.set(item.sha256, group);
  }
  const allOrderedGroups = [...groups.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error('Automated review limit must be a positive integer.');
  }
  const orderedGroups =
    options.limit === undefined ? allOrderedGroups : allOrderedGroups.slice(0, options.limit);
  const reviews = new Map<string, ArchivalReviewRecord>();
  const identityChecks = new Map<string, PerceptualIdentityCheckRecord>();
  const sourceChecks = new Map<string, SourceCorroborationCheck>();
  const failures = new Map<string, string>();
  let cacheHits = 0;
  let inferenceRuns = 0;
  let skippedExistingOwner = 0;
  let skippedAmbiguousOwner = 0;
  let skippedDecided = 0;
  const decidedKeys = new Set<string>();
  for (const [, items] of orderedGroups) {
    for (const item of items) {
      if (
        (await listAcquisitionDecisionReceipts(options.stage_dir, item.acquisition_key)).length > 0
      ) {
        decidedKeys.add(item.acquisition_key);
      }
    }
  }

  const eligibleItemsBySha = new Map<string, AcquisitionReviewItem[]>();
  for (const [sha, items] of orderedGroups) {
    const undecided = items.filter((item) => !decidedKeys.has(item.acquisition_key));
    if (undecided.length === 0) {
      skippedDecided += 1;
      continue;
    }
    const state = items[0]!.review_state;
    const groupHasPriorDecision = undecided.length !== items.length;
    if (state === 'requires_identity_review' && groupHasPriorDecision) {
      // A prior disposition on one exact-Asset acquisition is identity evidence.
      // Do not let automation independently establish a second disposition for
      // another acquisition of those same bytes.
      skippedDecided += 1;
      continue;
    }
    eligibleItemsBySha.set(sha, undecided);
  }

  const eligibleGroups = orderedGroups.filter(([sha]) => eligibleItemsBySha.has(sha));
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= eligibleGroups.length) return;
      const [sha, allItems] = eligibleGroups[index]!;
      const items = eligibleItemsBySha.get(sha)!;
      const state = allItems[0]!.review_state;
      if (state === 'existing_owner') {
        skippedExistingOwner += 1;
        continue;
      }
      if (state === 'blocked_ambiguous_owner') {
        skippedAmbiguousOwner += 1;
        continue;
      }
      const staged = stagedBySha.get(sha);
      if (staged === undefined) {
        failures.set(sha, 'Staged Asset record is missing.');
        continue;
      }
      try {
        const result = await readOrCreateReview(
          options.stage_dir,
          staged,
          options.client,
          options.provider,
        );
        reviews.set(sha, result.record);
        if (result.cache_hit) cacheHits += 1;
        else inferenceRuns += 1;
        if (
          result.record.result.classification === 'single_advertisement' &&
          result.record.result.confidence === 'high'
        ) {
          const identityCheck = await options.identity_guard.check(sha);
          identityChecks.set(sha, identityCheck);
          if (identityCheck.status === 'clear') {
            sourceChecks.set(sha, await options.source_corroboration_guard.check(items));
          }
        }
      } catch (error: unknown) {
        failures.set(sha, error instanceof Error ? error.message : String(error));
      }
      void items;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, eligibleGroups.length) }, () => worker()),
  );

  const decisions = eligibleGroups.flatMap(([sha]) =>
    decisionsForGroup(
      eligibleItemsBySha.get(sha)!,
      reviews.get(sha) ?? null,
      identityChecks.get(sha) ?? null,
      sourceChecks.get(sha) ?? null,
      failures.get(sha) ?? null,
    ),
  );
  const manifest: AcquisitionDecisionManifest = {
    schema_version: ACQUISITION_DECISION_VERSION,
    review_schema_version: 'signum-acquisition-review.v0.1',
    items: decisions,
  };
  return {
    manifest,
    reviewed_assets: reviews.size,
    cache_hits: cacheHits,
    inference_runs: inferenceRuns,
    skipped_existing_owner: skippedExistingOwner,
    skipped_ambiguous_owner: skippedAmbiguousOwner,
    skipped_decided: skippedDecided,
    identity_checks: {
      clear: [...identityChecks.values()].filter((item) => item.status === 'clear').length,
      near_duplicate: [...identityChecks.values()].filter(
        (item) => item.status === 'near_duplicate',
      ).length,
      unavailable: [...identityChecks.values()].filter((item) => item.status === 'unavailable')
        .length,
    },
    source_corroboration_checks: {
      supported: [...sourceChecks.values()].filter((item) => item.status === 'supported').length,
      unsupported: [...sourceChecks.values()].filter((item) => item.status === 'unsupported')
        .length,
      not_applicable: [...sourceChecks.values()].filter((item) => item.status === 'not_applicable')
        .length,
    },
    counts: {
      accept_new: decisions.filter((item) => item.decision === 'accept_new').length,
      attach_existing: decisions.filter((item) => item.decision === 'attach_existing').length,
      reject_non_ad: decisions.filter((item) => item.decision === 'reject_non_ad').length,
      quarantine: decisions.filter((item) => item.decision === 'quarantine').length,
    },
    failures: [...failures.entries()].map(([assetSha256, reason]) => ({
      acquisition_keys: (groups.get(assetSha256) ?? []).map((item) => item.acquisition_key).sort(),
      asset_sha256: assetSha256,
      reason,
    })),
  };
}
