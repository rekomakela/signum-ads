import { createHash } from 'node:crypto';

import { listStagedAcquisitions, type StagedAcquisitionRecord } from './acquisition-staging.js';
import { listAcquisitionDecisionReceipts } from './review-promotion.js';
import {
  readWikimediaCommonsSourceEvidence,
  type WikimediaCommonsSourceEvidenceRecord,
} from './wikimedia-commons-evidence.js';
import { acquisitionIdForKey } from '../corpus/archive-ingestion.js';
import {
  CORPUS_RECORD_VERSION,
  type AdvertisementRecord,
  type MetadataAssertionRecord,
  type TemporalExtent,
} from '../corpus/corpus-records.js';
import type { CorpusStore } from '../corpus/corpus-store.js';

export const COMMONS_TEMPORAL_METADATA_VERSION = 'signum-commons-temporal-metadata.v0.1' as const;

export type CommonsTemporalSignalKind =
  'exact_date_category' | 'advertisement_year_category' | 'publication_year_description';

export interface CommonsTemporalSignal {
  readonly kind: CommonsTemporalSignalKind;
  readonly value: string;
  readonly source_text: string;
  readonly acquisition_key: string;
  readonly evidence_key: string;
}

export type CommonsTemporalProposalStatus = 'proposed' | 'no_signal' | 'conflict' | 'already_known';

export interface CommonsTemporalProposal {
  readonly contract_version: typeof COMMONS_TEMPORAL_METADATA_VERSION;
  readonly advertisement_id: string;
  readonly status: CommonsTemporalProposalStatus;
  readonly temporal: TemporalExtent | null;
  readonly signals: readonly CommonsTemporalSignal[];
  readonly source_refs: readonly string[];
  readonly reason: string;
}

export interface CommonsTemporalProposalManifest {
  readonly contract_version: typeof COMMONS_TEMPORAL_METADATA_VERSION;
  readonly proposals: readonly CommonsTemporalProposal[];
  readonly counts: {
    readonly advertisements_considered: number;
    readonly proposed: number;
    readonly exact_date: number;
    readonly year: number;
    readonly no_signal: number;
    readonly conflict: number;
    readonly already_known: number;
  };
}

export interface CommonsTemporalPromotionResult {
  readonly proposed: number;
  readonly promoted: number;
  readonly already_known: number;
  readonly no_signal: number;
  readonly conflict: number;
  readonly assertions_written: number;
}

interface AcceptedAcquisition {
  readonly staged: StagedAcquisitionRecord;
  readonly advertisement_id: string;
  readonly evidence: WikimediaCommonsSourceEvidenceRecord;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validIsoDate(value: string): boolean {
  const match = /^([12]\d{3})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function extractCommonsTemporalSignals(
  acquisitionKey: string,
  evidence: WikimediaCommonsSourceEvidenceRecord,
): CommonsTemporalSignal[] {
  const signals: CommonsTemporalSignal[] = [];
  for (const category of evidence.categories) {
    if (/^[12]\d{3}-\d{2}-\d{2}$/.test(category) && validIsoDate(category)) {
      signals.push({
        kind: 'exact_date_category',
        value: category,
        source_text: category,
        acquisition_key: acquisitionKey,
        evidence_key: evidence.evidence_key,
      });
    }
    const yearMatch = /\b([12]\d{3}) advertisements\b/i.exec(category);
    if (yearMatch !== null) {
      signals.push({
        kind: 'advertisement_year_category',
        value: yearMatch[1]!,
        source_text: category,
        acquisition_key: acquisitionKey,
        evidence_key: evidence.evidence_key,
      });
    }
  }

  const description = plainText(evidence.image_description ?? '');
  const publishingMatch = /\bDate\s+of\s+Publishing\s*:?\s*([12]\d{3})\b/i.exec(description);
  if (publishingMatch !== null) {
    signals.push({
      kind: 'publication_year_description',
      value: publishingMatch[1]!,
      source_text: `Date of Publishing: ${publishingMatch[1]}`,
      acquisition_key: acquisitionKey,
      evidence_key: evidence.evidence_key,
    });
  }

  return signals.sort((left, right) =>
    `${left.kind}|${left.value}|${left.source_text}`.localeCompare(
      `${right.kind}|${right.value}|${right.source_text}`,
    ),
  );
}

function temporalFromSignals(signals: readonly CommonsTemporalSignal[]): {
  readonly temporal: TemporalExtent | null;
  readonly conflict: boolean;
  readonly reason: string;
} {
  const exactDates = sortedUnique(
    signals.filter((signal) => signal.kind === 'exact_date_category').map((signal) => signal.value),
  );
  const years = new Set<number>();
  for (const signal of signals) {
    const year = Number(signal.value.slice(0, 4));
    if (Number.isInteger(year)) years.add(year);
  }

  if (exactDates.length > 1 || years.size > 1) {
    return {
      temporal: null,
      conflict: true,
      reason: `Explicit Commons archival evidence contains conflicting temporal values: ${sortedUnique(
        signals.map((signal) => signal.value),
      ).join(', ')}.`,
    };
  }
  if (exactDates.length === 1) {
    const date = exactDates[0]!;
    const year = Number(date.slice(0, 4));
    return {
      temporal: {
        start_year: year,
        end_year: year,
        precision: 'exact_date',
        start_date: date,
        end_date: date,
      },
      conflict: false,
      reason: `Exact publication date ${date} is explicitly present in Commons archival categories and all other strong temporal signals agree on ${year}.`,
    };
  }
  if (years.size === 1) {
    const year = [...years][0]!;
    return {
      temporal: {
        start_year: year,
        end_year: year,
        precision: 'year',
        start_date: null,
        end_date: null,
      },
      conflict: false,
      reason: `Publication year ${year} is explicitly supported by Commons advertisement-year or publication metadata.`,
    };
  }
  return {
    temporal: null,
    conflict: false,
    reason:
      'No governed publication-date signal is present. Commons upload/capture dates are intentionally ignored.',
  };
}

function acceptedAdvertisementId(
  decision: Awaited<ReturnType<typeof listAcquisitionDecisionReceipts>>[number]['decision'],
): string | null {
  if (decision.decision === 'accept_new') return decision.proposed_advertisement_id;
  if (decision.decision === 'attach_existing') return decision.advertisement_id;
  return null;
}

async function acceptedCommonsAcquisitions(stageDir: string): Promise<AcceptedAcquisition[]> {
  const result: AcceptedAcquisition[] = [];
  const stagedRecords = (await listStagedAcquisitions(stageDir)).sort((left, right) =>
    left.acquisition_key.localeCompare(right.acquisition_key),
  );
  for (const staged of stagedRecords) {
    if (!staged.acquisition_key.startsWith('commons:')) continue;
    const receipts = await listAcquisitionDecisionReceipts(stageDir, staged.acquisition_key);
    const latest = receipts.at(-1)?.decision;
    if (latest === undefined) continue;
    const advertisementId = acceptedAdvertisementId(latest);
    if (advertisementId === null) continue;
    const evidence = await readWikimediaCommonsSourceEvidence(stageDir, staged);
    if (evidence === null) {
      throw new Error(`Missing Commons source evidence for accepted ${staged.acquisition_key}.`);
    }
    result.push({ staged, advertisement_id: advertisementId, evidence });
  }
  return result;
}

export async function buildCommonsTemporalProposalManifest(
  store: CorpusStore,
  stageDir: string,
): Promise<CommonsTemporalProposalManifest> {
  const acquisitions = await acceptedCommonsAcquisitions(stageDir);
  const byAdvertisement = new Map<string, AcceptedAcquisition[]>();
  for (const item of acquisitions) {
    const group = byAdvertisement.get(item.advertisement_id) ?? [];
    group.push(item);
    byAdvertisement.set(item.advertisement_id, group);
  }

  const proposals: CommonsTemporalProposal[] = [];
  for (const [advertisementId, group] of [...byAdvertisement.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const advertisement = await store.readAdvertisement(advertisementId);
    if (advertisement === null) {
      throw new Error(
        `Accepted Commons acquisition points to missing Advertisement ${advertisementId}.`,
      );
    }
    const signals = group.flatMap((item) =>
      extractCommonsTemporalSignals(item.staged.acquisition_key, item.evidence),
    );
    const sourceRefs = sortedUnique(
      signals.flatMap((signal) => [
        `commons-source-evidence:${signal.evidence_key}`,
        `acquisition-source:${acquisitionIdForKey(signal.acquisition_key)}`,
      ]),
    );
    const derived = temporalFromSignals(signals);
    if (advertisement.temporal.precision !== 'unknown') {
      proposals.push({
        contract_version: COMMONS_TEMPORAL_METADATA_VERSION,
        advertisement_id: advertisementId,
        status: 'already_known',
        temporal: advertisement.temporal,
        signals,
        source_refs: sourceRefs,
        reason:
          'Advertisement already has governed temporal metadata; automated enrichment does not replace it.',
      });
    } else if (derived.conflict) {
      proposals.push({
        contract_version: COMMONS_TEMPORAL_METADATA_VERSION,
        advertisement_id: advertisementId,
        status: 'conflict',
        temporal: null,
        signals,
        source_refs: sourceRefs,
        reason: derived.reason,
      });
    } else if (derived.temporal === null) {
      proposals.push({
        contract_version: COMMONS_TEMPORAL_METADATA_VERSION,
        advertisement_id: advertisementId,
        status: 'no_signal',
        temporal: null,
        signals,
        source_refs: sourceRefs,
        reason: derived.reason,
      });
    } else {
      proposals.push({
        contract_version: COMMONS_TEMPORAL_METADATA_VERSION,
        advertisement_id: advertisementId,
        status: 'proposed',
        temporal: derived.temporal,
        signals,
        source_refs: sourceRefs,
        reason: derived.reason,
      });
    }
  }

  return {
    contract_version: COMMONS_TEMPORAL_METADATA_VERSION,
    proposals,
    counts: {
      advertisements_considered: proposals.length,
      proposed: proposals.filter((item) => item.status === 'proposed').length,
      exact_date: proposals.filter(
        (item) => item.status === 'proposed' && item.temporal?.precision === 'exact_date',
      ).length,
      year: proposals.filter(
        (item) => item.status === 'proposed' && item.temporal?.precision === 'year',
      ).length,
      no_signal: proposals.filter((item) => item.status === 'no_signal').length,
      conflict: proposals.filter((item) => item.status === 'conflict').length,
      already_known: proposals.filter((item) => item.status === 'already_known').length,
    },
  };
}

function assertionForProposal(proposal: CommonsTemporalProposal): MetadataAssertionRecord {
  if (proposal.status !== 'proposed' || proposal.temporal === null) {
    throw new Error(`Cannot create temporal assertion for ${proposal.status} proposal.`);
  }
  const assertionId = `assertion_${sha256(
    `${COMMONS_TEMPORAL_METADATA_VERSION}|${proposal.advertisement_id}|${JSON.stringify(
      proposal.temporal,
    )}|${proposal.source_refs.join('|')}`,
  ).slice(0, 24)}`;
  return {
    schema_version: CORPUS_RECORD_VERSION,
    assertion_id: assertionId,
    advertisement_id: proposal.advertisement_id,
    field: 'temporal',
    value: proposal.temporal,
    certainty: 'confirmed',
    source_refs: proposal.source_refs,
  };
}

function withTemporalAssertion(
  advertisement: AdvertisementRecord,
  proposal: CommonsTemporalProposal,
  assertion: MetadataAssertionRecord,
): AdvertisementRecord {
  if (proposal.temporal === null) throw new Error('Temporal proposal is missing its extent.');
  return {
    ...advertisement,
    temporal: proposal.temporal,
    metadata_assertion_ids: sortedUnique([
      ...advertisement.metadata_assertion_ids,
      assertion.assertion_id,
    ]),
  };
}

export async function promoteCommonsTemporalMetadata(
  store: CorpusStore,
  manifest: CommonsTemporalProposalManifest,
): Promise<CommonsTemporalPromotionResult> {
  const promotable = manifest.proposals.filter(
    (proposal): proposal is CommonsTemporalProposal & { temporal: TemporalExtent } =>
      proposal.status === 'proposed' && proposal.temporal !== null,
  );

  const prepared: Array<{
    readonly advertisement: AdvertisementRecord;
    readonly assertion: MetadataAssertionRecord;
  }> = [];
  for (const proposal of promotable) {
    const advertisement = await store.readAdvertisement(proposal.advertisement_id);
    if (advertisement === null) {
      throw new Error(
        `Temporal proposal points to missing Advertisement ${proposal.advertisement_id}.`,
      );
    }
    if (advertisement.temporal.precision !== 'unknown') {
      if (JSON.stringify(advertisement.temporal) !== JSON.stringify(proposal.temporal)) {
        throw new Error(
          `Advertisement ${proposal.advertisement_id} already has conflicting temporal metadata.`,
        );
      }
      continue;
    }
    const assertion = assertionForProposal(proposal);
    prepared.push({
      assertion,
      advertisement: withTemporalAssertion(advertisement, proposal, assertion),
    });
  }

  let assertionsWritten = 0;
  const existingAssertionIds = new Set(
    (await store.listMetadataAssertions()).map((assertion) => assertion.assertion_id),
  );
  for (const item of prepared) {
    await store.putMetadataAssertion(item.assertion);
    if (!existingAssertionIds.has(item.assertion.assertion_id)) {
      assertionsWritten += 1;
      existingAssertionIds.add(item.assertion.assertion_id);
    }
    await store.promoteAdvertisementMetadata(item.advertisement);
  }

  return {
    proposed: promotable.length,
    promoted: prepared.length,
    already_known: manifest.counts.already_known,
    no_signal: manifest.counts.no_signal,
    conflict: manifest.counts.conflict,
    assertions_written: assertionsWritten,
  };
}
