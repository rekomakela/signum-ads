import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  ACQUISITION_REVIEW_VERSION,
  buildAcquisitionReviewManifest,
  listStagedAcquisitions,
  type AcquisitionReviewItem,
  type StagedAcquisitionRecord,
} from './acquisition-staging.js';
import {
  ingestArchiveBatch,
  type ArchiveBatchIngestionResult,
  type ArchiveIngestionItem,
} from '../corpus/archive-ingestion.js';
import type { AdvertisementRecord, TemporalExtent } from '../corpus/corpus-records.js';
import type { CorpusStore } from '../corpus/corpus-store.js';

export const ACQUISITION_DECISION_VERSION = 'signum-acquisition-decisions.v0.1' as const;
export const ACQUISITION_DECISION_RECEIPT_VERSION =
  'signum-acquisition-decision-receipt.v0.1' as const;

const RECORD_ID = /^[a-z0-9][a-z0-9._-]*$/i;
const SHA256 = /^[a-f0-9]{64}$/;

export type AcquisitionDecisionKind =
  'accept_new' | 'attach_existing' | 'reject_non_ad' | 'quarantine';

export interface AcquisitionDecisionItem {
  readonly acquisition_key: string;
  readonly sha256: string;
  readonly source_title: string | null;
  readonly source_url: string | null;
  readonly review_state: 'existing_owner' | 'requires_identity_review' | 'blocked_ambiguous_owner';
  readonly decision: AcquisitionDecisionKind | null;
  readonly advertisement_id: string | null;
  readonly proposed_advertisement_id: string | null;
  readonly rationale: string | null;
  readonly evidence_refs?: readonly string[];
  readonly brand_ids?: readonly string[];
  readonly product_ids?: readonly string[];
  readonly campaign_ids?: readonly string[];
  readonly placement_ids?: readonly string[];
  readonly market_ids?: readonly string[];
  readonly temporal?: TemporalExtent;
}

export interface AcquisitionDecisionManifest {
  readonly schema_version: typeof ACQUISITION_DECISION_VERSION;
  readonly review_schema_version: typeof ACQUISITION_REVIEW_VERSION;
  readonly items: readonly AcquisitionDecisionItem[];
}

export interface AcquisitionDecisionReceipt {
  readonly schema_version: typeof ACQUISITION_DECISION_RECEIPT_VERSION;
  readonly decision_id: string;
  readonly recorded_at: string;
  readonly decision: AcquisitionDecisionItem;
}

export interface PromotionResult {
  readonly decided: number;
  readonly pending: number;
  readonly promoted: number;
  readonly rejected: number;
  readonly quarantined: number;
  readonly receipts_written: number;
  readonly corpus: ArchiveBatchIngestionResult | null;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

function decisionIdentity(decision: AcquisitionDecisionItem): string {
  return `decision_${hash(JSON.stringify(canonicalize(decision))).slice(0, 24)}`;
}

function candidateId(acquisitionKey: string): string {
  return `candidate_${hash(acquisitionKey).slice(0, 24)}`;
}

function hasMetadata(decision: AcquisitionDecisionItem): boolean {
  return (
    decision.brand_ids !== undefined ||
    decision.product_ids !== undefined ||
    decision.campaign_ids !== undefined ||
    decision.placement_ids !== undefined ||
    decision.market_ids !== undefined ||
    decision.temporal !== undefined
  );
}

function metadataMatches(
  existing: AdvertisementRecord,
  decision: AcquisitionDecisionItem,
): boolean {
  const checks: Array<[unknown, unknown]> = [
    [decision.brand_ids, existing.brand_ids],
    [decision.product_ids, existing.product_ids],
    [decision.campaign_ids, existing.campaign_ids],
    [decision.placement_ids, existing.placement_ids],
    [decision.market_ids, existing.market_ids],
    [decision.temporal, existing.temporal],
  ];
  return checks.every(([requested, current]) =>
    requested === undefined ? true : JSON.stringify(requested) === JSON.stringify(current),
  );
}

function decisionFromReview(item: AcquisitionReviewItem): AcquisitionDecisionItem {
  return {
    acquisition_key: item.acquisition_key,
    sha256: item.sha256,
    source_title: item.source_title,
    source_url: item.source_url,
    review_state: item.review_state,
    decision: null,
    advertisement_id: item.advertisement_id,
    proposed_advertisement_id: item.proposed_advertisement_id,
    rationale: null,
  };
}

export function createAcquisitionDecisionTemplate(
  review: Awaited<ReturnType<typeof buildAcquisitionReviewManifest>>,
  limit?: number,
): AcquisitionDecisionManifest {
  const pending = review.items.filter((item) => item.review_state !== 'blocked_ambiguous_owner');
  const selected = limit === undefined ? pending : pending.slice(0, limit);
  return {
    schema_version: ACQUISITION_DECISION_VERSION,
    review_schema_version: ACQUISITION_REVIEW_VERSION,
    items: selected.map(decisionFromReview),
  };
}

export async function writeAcquisitionDecisionTemplate(
  pathname: string,
  manifest: AcquisitionDecisionManifest,
): Promise<void> {
  const target = resolve(pathname);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, stableJson(manifest), { encoding: 'utf8', flag: 'wx' });
}

export async function readAcquisitionDecisionManifest(
  pathname: string,
): Promise<AcquisitionDecisionManifest> {
  const value = JSON.parse(
    await readFile(resolve(pathname), 'utf8'),
  ) as AcquisitionDecisionManifest;
  if (value.schema_version !== ACQUISITION_DECISION_VERSION) {
    throw new Error(`Unsupported acquisition decision schema: ${value.schema_version}.`);
  }
  if (value.review_schema_version !== ACQUISITION_REVIEW_VERSION) {
    throw new Error(`Unsupported acquisition review schema: ${value.review_schema_version}.`);
  }
  if (!Array.isArray(value.items)) throw new Error('Acquisition decision manifest requires items.');
  return value;
}

function assertDecisionShape(decision: AcquisitionDecisionItem): void {
  if (decision.acquisition_key.trim().length === 0) {
    throw new Error('Review decision requires acquisition_key.');
  }
  if (!SHA256.test(decision.sha256)) {
    throw new Error(`Review decision has invalid SHA-256 for ${decision.acquisition_key}.`);
  }
  if (decision.decision === null) return;
  if (decision.rationale !== null && decision.rationale.trim().length === 0) {
    throw new Error(`Review rationale cannot be blank for ${decision.acquisition_key}.`);
  }
  if (decision.decision === 'reject_non_ad' || decision.decision === 'quarantine') {
    if (decision.advertisement_id !== null) {
      throw new Error(`${decision.decision} cannot assign Advertisement identity.`);
    }
    if (hasMetadata(decision)) {
      throw new Error(`${decision.decision} cannot assign archival Advertisement metadata.`);
    }
    return;
  }
  if (decision.decision === 'accept_new') {
    const id = decision.advertisement_id ?? decision.proposed_advertisement_id;
    if (id === null || !RECORD_ID.test(id)) {
      throw new Error('accept_new requires a valid reviewed or proposed advertisement_id.');
    }
  } else if (decision.advertisement_id === null || !RECORD_ID.test(decision.advertisement_id)) {
    throw new Error('attach_existing requires a valid reviewed advertisement_id.');
  }
  if (decision.decision === 'attach_existing' && hasMetadata(decision)) {
    throw new Error('attach_existing cannot mutate archival Advertisement metadata.');
  }
}

function stagedByKey(
  records: readonly StagedAcquisitionRecord[],
): Map<string, StagedAcquisitionRecord> {
  return new Map(records.map((record) => [record.acquisition_key, record]));
}

async function validatePromotionPlan(
  store: CorpusStore,
  stageDir: string,
  manifest: AcquisitionDecisionManifest,
): Promise<{
  readonly decisions: AcquisitionDecisionItem[];
  readonly promotable: ArchiveIngestionItem[];
}> {
  const records = await listStagedAcquisitions(stageDir);
  const staged = stagedByKey(records);
  const review = await buildAcquisitionReviewManifest(store, stageDir);
  const reviewByKey = new Map(review.items.map((item) => [item.acquisition_key, item]));
  const seenKeys = new Set<string>();
  const decisions = manifest.items.filter((item) => item.decision !== null);
  const acceptTargets = new Set(
    decisions
      .filter((item) => item.decision === 'accept_new')
      .map((item) => item.advertisement_id ?? item.proposed_advertisement_id)
      .filter((id): id is string => id !== null),
  );
  const targetBySha = new Map<string, Set<string>>();
  const promotable: ArchiveIngestionItem[] = [];

  for (const decision of manifest.items) {
    assertDecisionShape(decision);
    if (seenKeys.has(decision.acquisition_key)) {
      throw new Error(`Duplicate review decision for ${decision.acquisition_key}.`);
    }
    seenKeys.add(decision.acquisition_key);

    const record = staged.get(decision.acquisition_key);
    if (record === undefined) {
      throw new Error(
        `Review decision references unstaged acquisition ${decision.acquisition_key}.`,
      );
    }
    if (record.sha256 !== decision.sha256) {
      throw new Error(`Review decision SHA-256 drift for ${decision.acquisition_key}.`);
    }
    if (decision.decision === null) continue;

    const currentReview = reviewByKey.get(decision.acquisition_key);
    if (decision.decision === 'reject_non_ad' || decision.decision === 'quarantine') continue;
    if (currentReview?.review_state === 'blocked_ambiguous_owner') {
      throw new Error(
        `Cannot promote ${decision.acquisition_key}: exact Asset ownership is already ambiguous.`,
      );
    }

    const advertisementId =
      decision.decision === 'accept_new'
        ? (decision.advertisement_id ?? decision.proposed_advertisement_id)!
        : decision.advertisement_id!;
    const existing = await store.readAdvertisement(advertisementId);
    if (decision.decision === 'attach_existing') {
      if (existing === null && !acceptTargets.has(advertisementId)) {
        throw new Error(`attach_existing target ${advertisementId} does not exist.`);
      }
    } else if (existing !== null) {
      const ownerIds = currentReview?.corpus_advertisement_ids ?? [];
      if (!ownerIds.includes(advertisementId) || !metadataMatches(existing, decision)) {
        throw new Error(
          `accept_new target ${advertisementId} already exists and is not an idempotent replay.`,
        );
      }
    }

    const targets = targetBySha.get(decision.sha256) ?? new Set<string>();
    targets.add(advertisementId);
    targetBySha.set(decision.sha256, targets);
    promotable.push({
      advertisement_id: advertisementId,
      asset_path: resolve(stageDir, record.storage_path),
      acquisition_key: record.acquisition_key,
      acquisition_kind: record.acquisition_kind,
      source_url: record.source_url,
      source_title: record.source_title,
      ...(decision.decision === 'accept_new'
        ? {
            ...(decision.brand_ids !== undefined ? { brand_ids: decision.brand_ids } : {}),
            ...(decision.product_ids !== undefined ? { product_ids: decision.product_ids } : {}),
            ...(decision.campaign_ids !== undefined ? { campaign_ids: decision.campaign_ids } : {}),
            ...(decision.placement_ids !== undefined
              ? { placement_ids: decision.placement_ids }
              : {}),
            ...(decision.market_ids !== undefined ? { market_ids: decision.market_ids } : {}),
            ...(decision.temporal !== undefined ? { temporal: decision.temporal } : {}),
          }
        : {}),
    });
  }

  for (const [sha256, targets] of targetBySha) {
    if (targets.size > 1) {
      throw new Error(
        `Reviewed decisions assign exact Asset ${sha256} to multiple Advertisements: ${[...targets].sort().join(', ')}.`,
      );
    }
  }
  return { decisions, promotable };
}

async function writeDecisionReceipt(
  stageDir: string,
  decision: AcquisitionDecisionItem,
): Promise<boolean> {
  const id = decisionIdentity(decision);
  const directory = resolve(stageDir, 'review-decisions', candidateId(decision.acquisition_key));
  const pathname = resolve(directory, `${id}.json`);
  try {
    await readFile(pathname, 'utf8');
    return false;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const receipt: AcquisitionDecisionReceipt = {
    schema_version: ACQUISITION_DECISION_RECEIPT_VERSION,
    decision_id: id,
    recorded_at: new Date().toISOString(),
    decision,
  };
  await mkdir(directory, { recursive: true });
  const temp = `${pathname}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, stableJson(receipt), { encoding: 'utf8', flag: 'wx' });
  await rename(temp, pathname);
  return true;
}

export async function listAcquisitionDecisionReceipts(
  stageDir: string,
  acquisitionKey: string,
): Promise<AcquisitionDecisionReceipt[]> {
  const directory = resolve(stageDir, 'review-decisions', candidateId(acquisitionKey));
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const receipts = await Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map(
        async (name) =>
          JSON.parse(
            await readFile(resolve(directory, name), 'utf8'),
          ) as AcquisitionDecisionReceipt,
      ),
  );
  return receipts.sort((left, right) => left.recorded_at.localeCompare(right.recorded_at));
}

export async function promoteReviewedAcquisitions(
  store: CorpusStore,
  stageDir: string,
  manifest: AcquisitionDecisionManifest,
): Promise<PromotionResult> {
  const plan = await validatePromotionPlan(store, stageDir, manifest);
  const corpus =
    plan.promotable.length > 0 ? await ingestArchiveBatch(store, plan.promotable) : null;

  let receiptsWritten = 0;
  for (const decision of plan.decisions) {
    if (await writeDecisionReceipt(stageDir, decision)) receiptsWritten += 1;
  }

  return {
    decided: plan.decisions.length,
    pending: manifest.items.length - plan.decisions.length,
    promoted: plan.promotable.length,
    rejected: plan.decisions.filter((item) => item.decision === 'reject_non_ad').length,
    quarantined: plan.decisions.filter((item) => item.decision === 'quarantine').length,
    receipts_written: receiptsWritten,
    corpus,
  };
}
