import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFile } from 'node:child_process';

import { listStagedAcquisitions } from './acquisition-staging.js';
import type { CorpusStore } from '../corpus/corpus-store.js';

export const PERCEPTUAL_IDENTITY_SCHEMA_VERSION = 'signum-perceptual-identity.v0.1' as const;
export const PERCEPTUAL_HASH_METHOD_VERSION = 'signum-phash-32x32-dct.v0.1' as const;
export const DEFAULT_PERCEPTUAL_DISTANCE_THRESHOLD = 10;

export interface PerceptualIdentityMatch {
  readonly asset_sha256: string;
  readonly references: readonly string[];
  readonly distance: number;
}

export interface PerceptualIdentityCheckRecord {
  readonly schema_version: typeof PERCEPTUAL_IDENTITY_SCHEMA_VERSION;
  readonly check_key: string;
  readonly asset_sha256: string;
  readonly method_version: typeof PERCEPTUAL_HASH_METHOD_VERSION;
  readonly comparison_snapshot: string;
  readonly distance_threshold: number;
  readonly perceptual_hash: string;
  readonly status: 'clear' | 'near_duplicate' | 'unavailable';
  readonly matches: readonly PerceptualIdentityMatch[];
  readonly failure_reason: string | null;
}

export interface PerceptualIdentityGuard {
  check(assetSha256: string): Promise<PerceptualIdentityCheckRecord>;
}

interface AssetEntry {
  readonly sha256: string;
  readonly pathname: string | null;
  readonly references: readonly string[];
}

export interface PerceptualIdentityGuardOptions {
  readonly stage_dir: string;
  readonly store: CorpusStore;
  readonly distance_threshold?: number;
  readonly fingerprint_path?: (pathname: string) => Promise<string>;
  readonly fingerprint_concurrency?: number;
}

interface PerceptualFingerprintRecord {
  readonly schema_version: typeof PERCEPTUAL_IDENTITY_SCHEMA_VERSION;
  readonly method_version: typeof PERCEPTUAL_HASH_METHOD_VERSION;
  readonly asset_sha256: string;
  readonly perceptual_hash: string;
}

const IMAGE_SIZE = 32;
const LOW_FREQUENCY_SIZE = 8;
const COS_TABLE = Array.from({ length: LOW_FREQUENCY_SIZE }, (_, frequency) =>
  Array.from({ length: IMAGE_SIZE }, (_, position) =>
    Math.cos(((2 * position + 1) * frequency * Math.PI) / (2 * IMAGE_SIZE)),
  ),
);

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function perceptualHashFromGrayscale32x32(pixels: Uint8Array): string {
  if (pixels.length !== IMAGE_SIZE * IMAGE_SIZE) {
    throw new Error(
      `Perceptual hash requires exactly ${IMAGE_SIZE * IMAGE_SIZE} grayscale pixels.`,
    );
  }
  const coefficients: number[] = [];
  for (let verticalFrequency = 0; verticalFrequency < LOW_FREQUENCY_SIZE; verticalFrequency += 1) {
    for (
      let horizontalFrequency = 0;
      horizontalFrequency < LOW_FREQUENCY_SIZE;
      horizontalFrequency += 1
    ) {
      let sum = 0;
      for (let y = 0; y < IMAGE_SIZE; y += 1) {
        const verticalCosine = COS_TABLE[verticalFrequency]![y]!;
        for (let x = 0; x < IMAGE_SIZE; x += 1) {
          sum += pixels[y * IMAGE_SIZE + x]! * verticalCosine * COS_TABLE[horizontalFrequency]![x]!;
        }
      }
      coefficients.push(sum);
    }
  }

  // The DC component encodes average brightness rather than visual structure.
  // Exclude it from the threshold calculation while retaining a fixed 64-bit hash.
  const threshold = median(coefficients.slice(1));
  let bits = 0n;
  for (const coefficient of coefficients) {
    bits = (bits << 1n) | (coefficient >= threshold ? 1n : 0n);
  }
  return bits.toString(16).padStart(16, '0');
}

export function perceptualHashDistance(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) {
    throw new Error('Perceptual hashes must be 16 hexadecimal characters.');
  }
  let value = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let count = 0;
  while (value !== 0n) {
    value &= value - 1n;
    count += 1;
  }
  return count;
}

function ffmpegGrayscale(pathname: string): Promise<Uint8Array> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      'ffmpeg',
      [
        '-nostdin',
        '-v',
        'error',
        '-i',
        pathname,
        '-vf',
        `scale=${IMAGE_SIZE}:${IMAGE_SIZE}:flags=lanczos,format=gray`,
        '-frames:v',
        '1',
        '-f',
        'rawvideo',
        '-pix_fmt',
        'gray',
        'pipe:1',
      ],
      { encoding: 'buffer', maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          rejectPromise(
            new Error(`ffmpeg could not fingerprint ${pathname}: ${stderr.toString().trim()}`, {
              cause: error,
            }),
          );
          return;
        }
        const bytes = new Uint8Array(stdout);
        if (bytes.length !== IMAGE_SIZE * IMAGE_SIZE) {
          rejectPromise(
            new Error(
              `ffmpeg returned ${bytes.length} grayscale bytes for ${pathname}; expected ${IMAGE_SIZE * IMAGE_SIZE}.`,
            ),
          );
          return;
        }
        resolvePromise(bytes);
      },
    );
  });
}

export async function fingerprintImagePath(pathname: string): Promise<string> {
  return perceptualHashFromGrayscale32x32(await ffmpegGrayscale(pathname));
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function assetEntries(stageDir: string, store: CorpusStore): Promise<AssetEntry[]> {
  const bySha = new Map<
    string,
    { pathname: string | null; references: Set<string>; stagedPath: string | null }
  >();
  for (const staged of await listStagedAcquisitions(stageDir)) {
    const current = bySha.get(staged.sha256) ?? {
      pathname: null,
      references: new Set<string>(),
      stagedPath: null,
    };
    const pathname = resolve(stageDir, staged.storage_path);
    current.stagedPath = pathname;
    current.pathname = current.pathname ?? pathname;
    current.references.add(`staged-acquisition:${staged.acquisition_key}`);
    bySha.set(staged.sha256, current);
  }

  for (const asset of await store.listAssets()) {
    const current = bySha.get(asset.sha256) ?? {
      pathname: null,
      references: new Set<string>(),
      stagedPath: null,
    };
    current.references.add(`corpus-asset:${asset.asset_id}`);
    if (current.pathname === null) {
      if (asset.storage_path !== undefined) {
        const candidate = resolve(store.root, asset.storage_path);
        if (await pathExists(candidate)) current.pathname = candidate;
      }
      if (current.pathname === null) {
        for (const legacyPath of asset.legacy_paths) {
          const candidate = resolve(legacyPath);
          if (await pathExists(candidate)) {
            current.pathname = candidate;
            break;
          }
        }
      }
    }
    bySha.set(asset.sha256, current);
  }

  return [...bySha.entries()]
    .map(([sha256, entry]) => ({
      sha256,
      pathname: entry.stagedPath ?? entry.pathname,
      references: [...entry.references].sort(),
    }))
    .sort((left, right) => left.sha256.localeCompare(right.sha256));
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function checkKey(
  assetSha256: string,
  comparisonSnapshot: string,
  distanceThreshold: number,
): string {
  return `perceptual_check_${createHash('sha256')
    .update(
      JSON.stringify({
        asset_sha256: assetSha256,
        method_version: PERCEPTUAL_HASH_METHOD_VERSION,
        comparison_snapshot: comparisonSnapshot,
        distance_threshold: distanceThreshold,
      }),
    )
    .digest('hex')}`;
}

async function writeImmutableJson(pathname: string, value: unknown): Promise<void> {
  await mkdir(dirname(pathname), { recursive: true });
  const body = stableJson(value);
  try {
    const existing = await readFile(pathname, 'utf8');
    if (existing !== body) throw new Error(`Perceptual identity check conflict at ${pathname}.`);
    return;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temp = `${pathname}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temp, body, { encoding: 'utf8', flag: 'wx' });
  await rename(temp, pathname);
}

async function readOrCreateFingerprint(
  stageDir: string,
  entry: AssetEntry,
  fingerprint: (pathname: string) => Promise<string>,
): Promise<string> {
  if (entry.pathname === null)
    throw new Error('No readable Asset path is available for perceptual comparison.');
  const pathname = resolve(
    stageDir,
    'perceptual-fingerprints',
    `${entry.sha256}.${PERCEPTUAL_HASH_METHOD_VERSION}.json`,
  );
  try {
    const existing = JSON.parse(await readFile(pathname, 'utf8')) as PerceptualFingerprintRecord;
    if (
      existing.schema_version !== PERCEPTUAL_IDENTITY_SCHEMA_VERSION ||
      existing.method_version !== PERCEPTUAL_HASH_METHOD_VERSION ||
      existing.asset_sha256 !== entry.sha256 ||
      !/^[0-9a-f]{16}$/i.test(existing.perceptual_hash)
    ) {
      throw new Error(`Perceptual fingerprint cache identity mismatch for ${entry.sha256}.`);
    }
    return existing.perceptual_hash;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const perceptualHash = await fingerprint(entry.pathname);
  const record: PerceptualFingerprintRecord = {
    schema_version: PERCEPTUAL_IDENTITY_SCHEMA_VERSION,
    method_version: PERCEPTUAL_HASH_METHOD_VERSION,
    asset_sha256: entry.sha256,
    perceptual_hash: perceptualHash,
  };
  await writeImmutableJson(pathname, record);
  return perceptualHash;
}

export async function createPerceptualIdentityGuard(
  options: PerceptualIdentityGuardOptions,
): Promise<PerceptualIdentityGuard> {
  const threshold = options.distance_threshold ?? DEFAULT_PERCEPTUAL_DISTANCE_THRESHOLD;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) {
    throw new Error('Perceptual identity distance threshold must be an integer between 0 and 64.');
  }
  const fingerprintConcurrency = options.fingerprint_concurrency ?? 6;
  if (
    !Number.isInteger(fingerprintConcurrency) ||
    fingerprintConcurrency < 1 ||
    fingerprintConcurrency > 32
  ) {
    throw new Error('Perceptual fingerprint concurrency must be an integer between 1 and 32.');
  }
  const entries = await assetEntries(options.stage_dir, options.store);
  const comparisonSnapshot = `asset_snapshot_${createHash('sha256')
    .update(entries.map((entry) => entry.sha256).join('\n'))
    .digest('hex')}`;
  const fingerprint = options.fingerprint_path ?? fingerprintImagePath;
  const hashes = new Map<string, string>();
  const failures = new Map<string, string>();

  // Fingerprints are cached by immutable Asset SHA + method version. The first
  // run may decode the full comparison snapshot; later review runs reuse it.
  let fingerprintCursor = 0;
  async function fingerprintWorker(): Promise<void> {
    while (true) {
      const index = fingerprintCursor++;
      if (index >= entries.length) return;
      const entry = entries[index]!;
      try {
        hashes.set(
          entry.sha256,
          await readOrCreateFingerprint(options.stage_dir, entry, fingerprint),
        );
      } catch (error: unknown) {
        failures.set(entry.sha256, error instanceof Error ? error.message : String(error));
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(fingerprintConcurrency, entries.length) }, () =>
      fingerprintWorker(),
    ),
  );

  return {
    async check(assetSha256: string): Promise<PerceptualIdentityCheckRecord> {
      const key = checkKey(assetSha256, comparisonSnapshot, threshold);
      const pathname = resolve(options.stage_dir, 'identity-checks', `${key}.json`);
      try {
        return JSON.parse(await readFile(pathname, 'utf8')) as PerceptualIdentityCheckRecord;
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      const candidateHash = hashes.get(assetSha256);
      let record: PerceptualIdentityCheckRecord;
      if (candidateHash === undefined || failures.size > 0) {
        const firstFailure =
          candidateHash === undefined
            ? (failures.get(assetSha256) ?? 'Candidate Asset could not be fingerprinted.')
            : `Comparison snapshot contains ${failures.size} unreadable Asset(s).`;
        record = {
          schema_version: PERCEPTUAL_IDENTITY_SCHEMA_VERSION,
          check_key: key,
          asset_sha256: assetSha256,
          method_version: PERCEPTUAL_HASH_METHOD_VERSION,
          comparison_snapshot: comparisonSnapshot,
          distance_threshold: threshold,
          perceptual_hash: candidateHash ?? '',
          status: 'unavailable',
          matches: [],
          failure_reason: firstFailure,
        };
      } else {
        const matches = entries
          .filter((entry) => entry.sha256 !== assetSha256)
          .flatMap((entry): PerceptualIdentityMatch[] => {
            const otherHash = hashes.get(entry.sha256);
            if (otherHash === undefined) return [];
            const distance = perceptualHashDistance(candidateHash, otherHash);
            return distance <= threshold
              ? [{ asset_sha256: entry.sha256, references: entry.references, distance }]
              : [];
          })
          .sort(
            (left, right) =>
              left.distance - right.distance || left.asset_sha256.localeCompare(right.asset_sha256),
          );
        record = {
          schema_version: PERCEPTUAL_IDENTITY_SCHEMA_VERSION,
          check_key: key,
          asset_sha256: assetSha256,
          method_version: PERCEPTUAL_HASH_METHOD_VERSION,
          comparison_snapshot: comparisonSnapshot,
          distance_threshold: threshold,
          perceptual_hash: candidateHash,
          status: matches.length > 0 ? 'near_duplicate' : 'clear',
          matches,
          failure_reason: null,
        };
      }
      await writeImmutableJson(pathname, record);
      return record;
    },
  };
}
