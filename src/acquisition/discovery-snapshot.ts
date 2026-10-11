import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { AcquisitionCandidate } from './acquisition-staging.js';

export const ACQUISITION_DISCOVERY_VERSION = 'signum-acquisition-discovery.v0.1' as const;

type DiscoveryRequestValue = string | number | boolean | null;

export interface AcquisitionDiscoverySnapshot {
  readonly schema_version: typeof ACQUISITION_DISCOVERY_VERSION;
  readonly discovery_id: string;
  readonly source: string;
  readonly request: Readonly<Record<string, DiscoveryRequestValue>>;
  readonly candidates: readonly AcquisitionCandidate[];
}

export interface AcquisitionDiscoveryResult {
  readonly snapshot: AcquisitionDiscoverySnapshot;
  readonly reused: boolean;
  readonly path: string;
}

function stableRequest(
  request: Readonly<Record<string, DiscoveryRequestValue>>,
): Record<string, DiscoveryRequestValue> {
  return Object.fromEntries(
    Object.entries(request).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function stableCandidates(candidates: readonly AcquisitionCandidate[]): AcquisitionCandidate[] {
  const byKey = new Map<string, AcquisitionCandidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.acquisition_key);
    if (existing !== undefined && JSON.stringify(existing) !== JSON.stringify(candidate)) {
      throw new Error(
        `Discovery returned conflicting candidates for ${candidate.acquisition_key}.`,
      );
    }
    byKey.set(candidate.acquisition_key, candidate);
  }
  return [...byKey.values()].sort((left, right) =>
    left.acquisition_key.localeCompare(right.acquisition_key),
  );
}

function discoveryId(
  source: string,
  request: Readonly<Record<string, DiscoveryRequestValue>>,
): string {
  const identity = JSON.stringify({ source, request: stableRequest(request) });
  return `discovery_${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertSnapshot(
  snapshot: AcquisitionDiscoverySnapshot,
  source: string,
  request: Readonly<Record<string, DiscoveryRequestValue>>,
): void {
  if (snapshot.schema_version !== ACQUISITION_DISCOVERY_VERSION) {
    throw new Error(
      `Unsupported acquisition discovery snapshot version: ${snapshot.schema_version}.`,
    );
  }
  const expectedId = discoveryId(source, request);
  if (snapshot.discovery_id !== expectedId || snapshot.source !== source) {
    throw new Error(
      `Acquisition discovery snapshot ${snapshot.discovery_id} has conflicting identity.`,
    );
  }
  if (JSON.stringify(snapshot.request) !== JSON.stringify(stableRequest(request))) {
    throw new Error(
      `Acquisition discovery snapshot ${snapshot.discovery_id} has conflicting request parameters.`,
    );
  }
}

export async function loadOrCreateDiscoverySnapshot(
  stageDir: string,
  source: string,
  request: Readonly<Record<string, DiscoveryRequestValue>>,
  discover: () => Promise<readonly AcquisitionCandidate[]>,
): Promise<AcquisitionDiscoveryResult> {
  const normalizedRequest = stableRequest(request);
  const id = discoveryId(source, normalizedRequest);
  const directory = resolve(stageDir, 'discoveries');
  const pathname = resolve(directory, `${id}.json`);

  try {
    const existing = JSON.parse(await readFile(pathname, 'utf8')) as AcquisitionDiscoverySnapshot;
    assertSnapshot(existing, source, normalizedRequest);
    return { snapshot: existing, reused: true, path: pathname };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  const snapshot: AcquisitionDiscoverySnapshot = {
    schema_version: ACQUISITION_DISCOVERY_VERSION,
    discovery_id: id,
    source,
    request: normalizedRequest,
    candidates: stableCandidates(await discover()),
  };
  const body = stableJson(snapshot);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(pathname, body, { encoding: 'utf8', flag: 'wx' });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const existing = await readFile(pathname, 'utf8');
    if (existing !== body) {
      throw new Error(`Acquisition discovery snapshot conflict at ${pathname}.`, { cause: error });
    }
  }
  return { snapshot, reused: false, path: pathname };
}
