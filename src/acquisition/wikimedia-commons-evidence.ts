import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import {
  listStagedAcquisitions,
  type AcquisitionReviewItem,
  type StagedAcquisitionRecord,
} from './acquisition-staging.js';

export const WIKIMEDIA_COMMONS_SOURCE_EVIDENCE_VERSION =
  'signum-wikimedia-commons-source-evidence.v0.2' as const;

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const USER_AGENT =
  'SignumDecoder/0.1 (https://github.com/rekomakela/signum-ads; archival research)';
const AD_CATEGORY = /advertis/i;

export interface WikimediaCommonsSourceEvidenceRecord {
  readonly schema_version: typeof WIKIMEDIA_COMMONS_SOURCE_EVIDENCE_VERSION;
  readonly evidence_key: string;
  readonly acquisition_key: string;
  readonly page_id: number;
  readonly page_revision_id: number | null;
  readonly source_url: string | null;
  readonly source_title: string | null;
  readonly categories: readonly string[];
  readonly image_description: string | null;
  readonly date_time_original: string | null;
  readonly advertisement_support_categories: readonly string[];
  readonly advertisement_support_description_match: boolean;
  readonly supports_advertisement: boolean;
}

export type SourceCorroborationStatus = 'supported' | 'unsupported' | 'not_applicable';

export interface SourceCorroborationCheck {
  readonly status: SourceCorroborationStatus;
  readonly evidence_refs: readonly string[];
  readonly rationale: string;
}

export interface SourceCorroborationGuard {
  check(items: readonly AcquisitionReviewItem[]): Promise<SourceCorroborationCheck>;
}

export interface CaptureWikimediaCommonsEvidenceOptions {
  readonly fetch_fn?: typeof fetch;
  readonly batch_size?: number;
  readonly request_delay_ms?: number;
}

export interface CaptureWikimediaCommonsEvidenceResult {
  readonly commons_acquisitions: number;
  readonly captured: number;
  readonly reused: number;
  readonly supported: number;
  readonly unsupported: number;
}

interface CommonsExtMetadataValue {
  readonly value?: string;
}

interface CommonsEvidencePage {
  readonly pageid?: number;
  readonly title?: string;
  readonly categories?: Array<{ readonly title?: string }>;
  readonly lastrevid?: number;
  readonly imageinfo?: Array<{
    readonly extmetadata?: Record<string, CommonsExtMetadataValue>;
  }>;
}

interface CommonsEvidenceResponse {
  readonly query?: { readonly pages?: Record<string, CommonsEvidencePage> };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function pageIdFor(acquisitionKey: string): number | null {
  const match = /^commons:(\d+)$/.exec(acquisitionKey);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function evidenceKey(acquisitionKey: string): string {
  return `commons_evidence_${sha256(
    `${WIKIMEDIA_COMMONS_SOURCE_EVIDENCE_VERSION}|${acquisitionKey}`,
  ).slice(0, 24)}`;
}

function evidencePath(stageDir: string, acquisitionKey: string): string {
  return resolve(stageDir, 'source-evidence', `${evidenceKey(acquisitionKey)}.json`);
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 15_000);
  return Math.min(750 * 2 ** attempt, 6000);
}

async function fetchJson<T>(url: URL, fetchImpl: typeof fetch): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) return (await response.json()) as T;
    if ((response.status === 429 || response.status === 503) && attempt < 4) {
      await sleep(retryDelayMs(response, attempt));
      continue;
    }
    throw new Error(`Wikimedia Commons evidence query failed with HTTP ${response.status}.`);
  }
  throw new Error('Wikimedia Commons evidence query retry budget exhausted.');
}

function evidenceFromPage(
  staged: StagedAcquisitionRecord,
  page: CommonsEvidencePage,
): WikimediaCommonsSourceEvidenceRecord {
  const pageId = pageIdFor(staged.acquisition_key);
  if (pageId === null || page.pageid !== pageId) {
    throw new Error(`Wikimedia Commons page identity mismatch for ${staged.acquisition_key}.`);
  }
  const categories = (page.categories ?? [])
    .map((item) => item.title?.replace(/^Category:/, '') ?? '')
    .filter((item) => item !== '')
    .sort((left, right) => left.localeCompare(right));
  const supportCategories = categories.filter((category) => AD_CATEGORY.test(category));
  const extmetadata = page.imageinfo?.[0]?.extmetadata ?? {};
  const metadataValue = (key: string): string | null => {
    const value = extmetadata[key]?.value;
    return typeof value === 'string' && value.trim() !== '' ? value : null;
  };
  const imageDescription = metadataValue('ImageDescription');
  const descriptionSupport = imageDescription !== null && AD_CATEGORY.test(imageDescription);
  return {
    schema_version: WIKIMEDIA_COMMONS_SOURCE_EVIDENCE_VERSION,
    evidence_key: evidenceKey(staged.acquisition_key),
    acquisition_key: staged.acquisition_key,
    page_id: pageId,
    page_revision_id: page.lastrevid ?? null,
    source_url: staged.source_url,
    source_title: staged.source_title,
    categories,
    image_description: imageDescription,
    date_time_original: metadataValue('DateTimeOriginal'),
    advertisement_support_categories: supportCategories,
    advertisement_support_description_match: descriptionSupport,
    supports_advertisement: supportCategories.length > 0 || descriptionSupport,
  };
}

function assertEvidenceMatches(
  record: WikimediaCommonsSourceEvidenceRecord,
  staged: StagedAcquisitionRecord,
): void {
  if (
    record.schema_version !== WIKIMEDIA_COMMONS_SOURCE_EVIDENCE_VERSION ||
    record.evidence_key !== evidenceKey(staged.acquisition_key) ||
    record.acquisition_key !== staged.acquisition_key ||
    record.page_id !== pageIdFor(staged.acquisition_key) ||
    record.source_url !== staged.source_url ||
    record.source_title !== staged.source_title
  ) {
    throw new Error(`Wikimedia Commons source evidence identity drift: ${staged.acquisition_key}.`);
  }
}

export async function readWikimediaCommonsSourceEvidence(
  stageDir: string,
  staged: StagedAcquisitionRecord,
): Promise<WikimediaCommonsSourceEvidenceRecord | null> {
  try {
    const record = JSON.parse(
      await readFile(evidencePath(stageDir, staged.acquisition_key), 'utf8'),
    ) as WikimediaCommonsSourceEvidenceRecord;
    assertEvidenceMatches(record, staged);
    return record;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function writeEvidence(
  stageDir: string,
  record: WikimediaCommonsSourceEvidenceRecord,
): Promise<void> {
  const pathname = evidencePath(stageDir, record.acquisition_key);
  await mkdir(dirname(pathname), { recursive: true });
  const temp = `${pathname}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, stableJson(record), { encoding: 'utf8', flag: 'wx' });
  try {
    await rename(temp, pathname);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
}

export async function captureWikimediaCommonsSourceEvidence(
  stageDir: string,
  options: CaptureWikimediaCommonsEvidenceOptions = {},
): Promise<CaptureWikimediaCommonsEvidenceResult> {
  const fetchImpl = options.fetch_fn ?? globalThis.fetch;
  const batchSize = options.batch_size ?? 25;
  const requestDelayMs = options.request_delay_ms ?? 500;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
    throw new Error('Wikimedia Commons evidence batch_size must be an integer between 1 and 50.');
  }
  if (!Number.isInteger(requestDelayMs) || requestDelayMs < 0 || requestDelayMs > 60_000) {
    throw new Error('Wikimedia Commons evidence request_delay_ms must be 0-60000.');
  }

  const staged = (await listStagedAcquisitions(stageDir))
    .filter((item) => pageIdFor(item.acquisition_key) !== null)
    .sort((left, right) => left.acquisition_key.localeCompare(right.acquisition_key));
  const records = new Map<string, WikimediaCommonsSourceEvidenceRecord>();
  const missing: StagedAcquisitionRecord[] = [];
  let reused = 0;
  for (const item of staged) {
    const existing = await readWikimediaCommonsSourceEvidence(stageDir, item);
    if (existing === null) missing.push(item);
    else {
      records.set(item.acquisition_key, existing);
      reused += 1;
    }
  }

  let captured = 0;
  for (let start = 0; start < missing.length; start += batchSize) {
    const batch = missing.slice(start, start + batchSize);
    const url = new URL(COMMONS_API);
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set(
      'pageids',
      batch.map((item) => pageIdFor(item.acquisition_key)!).join('|'),
    );
    url.searchParams.set('prop', 'categories|imageinfo|info');
    url.searchParams.set('cllimit', 'max');
    url.searchParams.set('iiprop', 'extmetadata');
    const response = await fetchJson<CommonsEvidenceResponse>(url, fetchImpl);
    const pages = response.query?.pages ?? {};
    for (const item of batch) {
      const pageId = pageIdFor(item.acquisition_key)!;
      const page = pages[String(pageId)];
      if (page === undefined) {
        throw new Error(`Wikimedia Commons evidence missing page ${pageId}.`);
      }
      const record = evidenceFromPage(item, page);
      await writeEvidence(stageDir, record);
      records.set(item.acquisition_key, record);
      captured += 1;
    }
    if (start + batchSize < missing.length && requestDelayMs > 0) await sleep(requestDelayMs);
  }

  const values = [...records.values()];
  return {
    commons_acquisitions: staged.length,
    captured,
    reused,
    supported: values.filter((item) => item.supports_advertisement).length,
    unsupported: values.filter((item) => !item.supports_advertisement).length,
  };
}

export function createWikimediaCommonsSourceCorroborationGuard(
  stageDir: string,
): SourceCorroborationGuard {
  const stagedByKeyPromise = listStagedAcquisitions(stageDir).then(
    (items) => new Map(items.map((item) => [item.acquisition_key, item] as const)),
  );
  return {
    async check(items) {
      const commons = items.filter((item) => pageIdFor(item.acquisition_key) !== null);
      if (commons.length === 0) {
        return {
          status: 'not_applicable',
          evidence_refs: [],
          rationale: 'No Wikimedia Commons acquisition requires source corroboration.',
        };
      }
      const stagedByKey = await stagedByKeyPromise;
      const records: WikimediaCommonsSourceEvidenceRecord[] = [];
      for (const item of commons) {
        const staged = stagedByKey.get(item.acquisition_key);
        if (staged === undefined)
          throw new Error(`Staged acquisition missing: ${item.acquisition_key}.`);
        const evidence = await readWikimediaCommonsSourceEvidence(stageDir, staged);
        if (evidence === null) {
          throw new Error(
            `Wikimedia Commons source evidence missing for ${item.acquisition_key}; run corpus:commons-evidence before automated promotion.`,
          );
        }
        records.push(evidence);
      }
      const supported = records.filter((record) => record.supports_advertisement);
      if (supported.length > 0) {
        return {
          status: 'supported',
          evidence_refs: supported.map(
            (record) => `commons-source-evidence:${record.evidence_key}`,
          ),
          rationale:
            supported[0]!.advertisement_support_categories.length > 0
              ? `Wikimedia Commons metadata explicitly categorizes the acquisition as advertising (${supported[0]!.advertisement_support_categories[0]}).`
              : 'Wikimedia Commons archival description explicitly identifies the acquisition as advertising.',
        };
      }
      return {
        status: 'unsupported',
        evidence_refs: records.map((record) => `commons-source-evidence:${record.evidence_key}`),
        rationale:
          'Wikimedia Commons metadata does not explicitly categorize this acquisition as advertising; manual archival review is required.',
      };
    },
  };
}
