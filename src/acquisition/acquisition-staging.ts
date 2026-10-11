import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import type { AcquisitionSourceRecord } from '../corpus/corpus-records.js';
import type { CorpusStore } from '../corpus/corpus-store.js';

export const ACQUISITION_STAGE_VERSION = 'signum-acquisition-stage.v0.1' as const;
export const ACQUISITION_REVIEW_VERSION = 'signum-acquisition-review.v0.1' as const;

const DEFAULT_MAX_ASSET_BYTES = 20 * 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;

export interface AcquisitionCandidate {
  readonly acquisition_key: string;
  readonly acquisition_kind: AcquisitionSourceRecord['kind'];
  readonly asset_url: string;
  readonly source_url?: string | null;
  readonly source_title?: string | null;
}

export interface StagedAcquisitionRecord {
  readonly schema_version: typeof ACQUISITION_STAGE_VERSION;
  readonly candidate_id: string;
  readonly acquisition_key: string;
  readonly acquisition_kind: AcquisitionSourceRecord['kind'];
  readonly source_url: string | null;
  readonly source_title: string | null;
  readonly asset_id: string;
  readonly sha256: string;
  readonly storage_path: string;
  readonly byte_length: number;
  readonly mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
}

export interface AcquisitionFailure {
  readonly acquisition_key: string;
  readonly reason: string;
}

export interface StageAcquisitionBatchResult {
  readonly staged: number;
  readonly reused: number;
  readonly failed: number;
  readonly records: readonly StagedAcquisitionRecord[];
  readonly failures: readonly AcquisitionFailure[];
}

export type AcquisitionReviewState =
  'existing_owner' | 'requires_identity_review' | 'blocked_ambiguous_owner';

export interface AcquisitionReviewItem {
  readonly acquisition_key: string;
  readonly acquisition_kind: AcquisitionSourceRecord['kind'];
  readonly source_url: string | null;
  readonly source_title: string | null;
  readonly asset_path: string;
  readonly asset_id: string;
  readonly sha256: string;
  readonly exact_stage_duplicate_count: number;
  readonly corpus_advertisement_ids: readonly string[];
  readonly review_state: AcquisitionReviewState;
  readonly advertisement_id: string | null;
  readonly proposed_advertisement_id: string | null;
}

export interface AcquisitionReviewManifest {
  readonly schema_version: typeof ACQUISITION_REVIEW_VERSION;
  readonly items: readonly AcquisitionReviewItem[];
  readonly counts: {
    readonly acquisitions: number;
    readonly unique_assets: number;
    readonly exact_duplicate_groups: number;
    readonly existing_owner: number;
    readonly requires_identity_review: number;
    readonly blocked_ambiguous_owner: number;
  };
}

export interface StageAcquisitionBatchOptions {
  readonly stage_dir: string;
  readonly candidates: readonly AcquisitionCandidate[];
  readonly fetch_fn?: typeof fetch;
  readonly concurrency?: number;
  readonly max_asset_bytes?: number;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function candidateId(acquisitionKey: string): string {
  return `candidate_${sha256(`acquisition:${acquisitionKey}`).slice(0, 24)}`;
}

function assetId(assetSha256: string): string {
  return `asset_${assetSha256.slice(0, 24)}`;
}

export function proposedAdvertisementId(acquisitionKey: string): string {
  return `ad_${sha256(`acquisition:${acquisitionKey}`).slice(0, 24)}`;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await stat(pathname);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function assertCandidate(candidate: AcquisitionCandidate): void {
  if (candidate.acquisition_key.trim() === '') {
    throw new Error('Acquisition candidate requires a non-empty acquisition_key.');
  }
  let parsed: URL;
  try {
    parsed = new URL(candidate.asset_url);
  } catch (error: unknown) {
    throw new Error(`Invalid asset_url for ${candidate.acquisition_key}.`, { cause: error });
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported asset_url protocol for ${candidate.acquisition_key}.`);
  }
}

function normalizedCandidate(candidate: AcquisitionCandidate): AcquisitionCandidate {
  return {
    acquisition_key: candidate.acquisition_key.trim(),
    acquisition_kind: candidate.acquisition_kind,
    asset_url: candidate.asset_url,
    source_url: candidate.source_url ?? null,
    source_title: candidate.source_title ?? null,
  };
}

function prepareCandidates(candidates: readonly AcquisitionCandidate[]): AcquisitionCandidate[] {
  const byKey = new Map<string, AcquisitionCandidate>();
  for (const raw of candidates) {
    const candidate = normalizedCandidate(raw);
    assertCandidate(candidate);
    const existing = byKey.get(candidate.acquisition_key);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(candidate)) {
      throw new Error(
        `Conflicting acquisition candidate definitions for ${candidate.acquisition_key}.`,
      );
    }
    byKey.set(candidate.acquisition_key, candidate);
  }
  return [...byKey.values()].sort((left, right) =>
    left.acquisition_key.localeCompare(right.acquisition_key),
  );
}

function sniffImageMime(bytes: Buffer): StagedAcquisitionRecord['mime_type'] | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 6) {
    const signature = bytes.subarray(0, 6).toString('ascii');
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  }
  return null;
}

async function atomicWrite(pathname: string, body: string | Buffer): Promise<void> {
  await mkdir(dirname(pathname), { recursive: true });
  const temp = `${pathname}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, body, { flag: 'wx' });
  await rename(temp, pathname);
}

async function writeImmutable(pathname: string, body: string | Buffer): Promise<void> {
  if (await pathExists(pathname)) {
    const existing = await readFile(pathname);
    const expected = typeof body === 'string' ? Buffer.from(body, 'utf8') : body;
    if (!existing.equals(expected)) {
      throw new Error(
        `Acquisition staging conflict at ${pathname}; immutable staged data differs.`,
      );
    }
    return;
  }
  await atomicWrite(pathname, body);
}

async function readExistingRecord(
  stageRoot: string,
  candidate: AcquisitionCandidate,
): Promise<StagedAcquisitionRecord | null> {
  const pathname = resolve(
    stageRoot,
    'candidates',
    `${candidateId(candidate.acquisition_key)}.json`,
  );
  let record: StagedAcquisitionRecord;
  try {
    record = JSON.parse(await readFile(pathname, 'utf8')) as StagedAcquisitionRecord;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }

  const expectedProvenance = {
    acquisition_key: candidate.acquisition_key,
    acquisition_kind: candidate.acquisition_kind,
    source_url: candidate.source_url ?? null,
    source_title: candidate.source_title ?? null,
  };
  const actualProvenance = {
    acquisition_key: record.acquisition_key,
    acquisition_kind: record.acquisition_kind,
    source_url: record.source_url,
    source_title: record.source_title,
  };
  if (JSON.stringify(expectedProvenance) !== JSON.stringify(actualProvenance)) {
    throw new Error(
      `Acquisition ${candidate.acquisition_key} conflicts with immutable staged provenance.`,
    );
  }

  const blob = await readFile(resolve(stageRoot, record.storage_path));
  if (blob.length !== record.byte_length || sha256(blob) !== record.sha256) {
    throw new Error(`Staged Asset integrity check failed for ${record.asset_id}.`);
  }
  return record;
}

function assetRetryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response === null ? Number.NaN : Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 10_000);
  return Math.min(750 * 2 ** attempt, 6000);
}

async function fetchAssetWithRetry(assetUrl: string, fetchImpl: typeof fetch): Promise<Response> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetchImpl(assetUrl, {
        headers: {
          'User-Agent':
            'SignumDecoder/0.1 (https://github.com/rekomakela/signum-ads; archival research)',
        },
      });
    } catch (error: unknown) {
      if (attempt < 3) {
        await sleep(assetRetryDelayMs(null, attempt));
        continue;
      }
      throw new Error('Asset download failed after retrying a network error.', { cause: error });
    }
    if (response.ok) return response;
    if ((response.status === 429 || response.status === 503) && attempt < 3) {
      await sleep(assetRetryDelayMs(response, attempt));
      continue;
    }
    throw new Error(`Asset download failed with HTTP ${response.status}.`);
  }
  throw new Error('Asset download retry budget exhausted.');
}

async function downloadCandidate(
  stageRoot: string,
  candidate: AcquisitionCandidate,
  fetchImpl: typeof fetch,
  maxAssetBytes: number,
): Promise<{ record: StagedAcquisitionRecord; reused: boolean }> {
  const existing = await readExistingRecord(stageRoot, candidate);
  if (existing !== null) return { record: existing, reused: true };

  const response = await fetchAssetWithRetry(candidate.asset_url, fetchImpl);
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && Number(contentLength) > maxAssetBytes) {
    throw new Error(`Asset exceeds maximum size of ${maxAssetBytes} bytes.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('Asset download returned an empty body.');
  if (bytes.length > maxAssetBytes) {
    throw new Error(`Asset exceeds maximum size of ${maxAssetBytes} bytes.`);
  }
  const mimeType = sniffImageMime(bytes);
  if (mimeType === null) throw new Error('Downloaded Asset is not a supported image binary.');

  const assetSha256 = sha256(bytes);
  const id = assetId(assetSha256);
  const storagePath = `blobs/${id}`;
  await writeImmutable(resolve(stageRoot, storagePath), bytes);

  const record: StagedAcquisitionRecord = {
    schema_version: ACQUISITION_STAGE_VERSION,
    candidate_id: candidateId(candidate.acquisition_key),
    acquisition_key: candidate.acquisition_key,
    acquisition_kind: candidate.acquisition_kind,
    source_url: candidate.source_url ?? null,
    source_title: candidate.source_title ?? null,
    asset_id: id,
    sha256: assetSha256,
    storage_path: storagePath,
    byte_length: bytes.length,
    mime_type: mimeType,
  };
  await writeImmutable(
    resolve(stageRoot, 'candidates', `${record.candidate_id}.json`),
    stableJson(record),
  );
  return { record, reused: false };
}

export async function stageAcquisitionBatch(
  options: StageAcquisitionBatchOptions,
): Promise<StageAcquisitionBatchResult> {
  const candidates = prepareCandidates(options.candidates);
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxAssetBytes = options.max_asset_bytes ?? DEFAULT_MAX_ASSET_BYTES;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new Error('Acquisition concurrency must be an integer between 1 and 64.');
  }
  if (!Number.isInteger(maxAssetBytes) || maxAssetBytes < 1) {
    throw new Error('max_asset_bytes must be a positive integer.');
  }

  const stageRoot = resolve(options.stage_dir);
  const fetchImpl = options.fetch_fn ?? globalThis.fetch;
  const results: Array<{ record: StagedAcquisitionRecord; reused: boolean } | null> = Array(
    candidates.length,
  ).fill(null);
  const failures: AcquisitionFailure[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = cursor;
      cursor += 1;
      const candidate = candidates[index];
      if (candidate === undefined) return;
      try {
        results[index] = await downloadCandidate(stageRoot, candidate, fetchImpl, maxAssetBytes);
      } catch (error: unknown) {
        failures.push({
          acquisition_key: candidate.acquisition_key,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, candidates.length)) }, () => worker()),
  );
  const successful = results.filter(
    (result): result is { record: StagedAcquisitionRecord; reused: boolean } => result !== null,
  );
  failures.sort((left, right) => left.acquisition_key.localeCompare(right.acquisition_key));

  return {
    staged: successful.filter((result) => !result.reused).length,
    reused: successful.filter((result) => result.reused).length,
    failed: failures.length,
    records: successful.map((result) => result.record),
    failures,
  };
}

export async function listStagedAcquisitions(stageDir: string): Promise<StagedAcquisitionRecord[]> {
  const directory = resolve(stageDir, 'candidates');
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return Promise.all(
    names
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map(
        async (name) =>
          JSON.parse(await readFile(resolve(directory, name), 'utf8')) as StagedAcquisitionRecord,
      ),
  );
}

export async function buildAcquisitionReviewManifest(
  store: CorpusStore,
  stageDir: string,
): Promise<AcquisitionReviewManifest> {
  const records = await listStagedAcquisitions(stageDir);
  const corpusAssets = await store.listAssets();
  const advertisements = await store.listAdvertisements();
  const shaByAssetId = new Map(corpusAssets.map((asset) => [asset.asset_id, asset.sha256]));
  const ownersBySha = new Map<string, Set<string>>();
  for (const advertisement of advertisements) {
    for (const corpusAssetId of advertisement.asset_ids) {
      const assetSha256 = shaByAssetId.get(corpusAssetId);
      if (assetSha256 === undefined) continue;
      const owners = ownersBySha.get(assetSha256) ?? new Set<string>();
      owners.add(advertisement.advertisement_id);
      ownersBySha.set(assetSha256, owners);
    }
  }

  const stageCountBySha = new Map<string, number>();
  for (const record of records) {
    stageCountBySha.set(record.sha256, (stageCountBySha.get(record.sha256) ?? 0) + 1);
  }

  const items = records.map((record): AcquisitionReviewItem => {
    const ownerIds = [...(ownersBySha.get(record.sha256) ?? new Set<string>())].sort();
    const reviewState: AcquisitionReviewState =
      ownerIds.length === 0
        ? 'requires_identity_review'
        : ownerIds.length === 1
          ? 'existing_owner'
          : 'blocked_ambiguous_owner';
    return {
      acquisition_key: record.acquisition_key,
      acquisition_kind: record.acquisition_kind,
      source_url: record.source_url,
      source_title: record.source_title,
      asset_path: record.storage_path,
      asset_id: record.asset_id,
      sha256: record.sha256,
      exact_stage_duplicate_count: stageCountBySha.get(record.sha256) ?? 1,
      corpus_advertisement_ids: ownerIds,
      review_state: reviewState,
      advertisement_id: ownerIds.length === 1 ? ownerIds[0]! : null,
      proposed_advertisement_id:
        ownerIds.length === 0 ? proposedAdvertisementId(record.acquisition_key) : null,
    };
  });

  const uniqueAssets = new Set(records.map((record) => record.sha256)).size;
  const duplicateGroups = [...stageCountBySha.values()].filter((count) => count > 1).length;
  return {
    schema_version: ACQUISITION_REVIEW_VERSION,
    items,
    counts: {
      acquisitions: records.length,
      unique_assets: uniqueAssets,
      exact_duplicate_groups: duplicateGroups,
      existing_owner: items.filter((item) => item.review_state === 'existing_owner').length,
      requires_identity_review: items.filter(
        (item) => item.review_state === 'requires_identity_review',
      ).length,
      blocked_ambiguous_owner: items.filter(
        (item) => item.review_state === 'blocked_ambiguous_owner',
      ).length,
    },
  };
}

export async function writeAcquisitionReviewManifest(
  stageDir: string,
  manifest: AcquisitionReviewManifest,
): Promise<string> {
  const pathname = resolve(stageDir, 'review.json');
  await atomicWrite(pathname, stableJson(manifest));
  return pathname;
}
