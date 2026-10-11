import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  createPerceptualIdentityGuard,
  perceptualHashDistance,
  perceptualHashFromGrayscale32x32,
} from '../src/acquisition/perceptual-identity.js';
import {
  listStagedAcquisitions,
  stageAcquisitionBatch,
  type AcquisitionCandidate,
} from '../src/acquisition/acquisition-staging.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';

function pixels(fill: (x: number, y: number) => number): Uint8Array {
  const result = new Uint8Array(32 * 32);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) result[y * 32 + x] = fill(x, y);
  }
  return result;
}

function jpeg(label: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)]);
}

function candidate(key: string): AcquisitionCandidate {
  return {
    acquisition_key: key,
    acquisition_kind: 'web',
    asset_url: `https://assets.example/${key}.jpg`,
    source_url: `https://source.example/${key}`,
    source_title: key,
  };
}

test('perceptual hash is deterministic and Hamming distance reflects visual structure', () => {
  const horizontal = pixels((x) => x * 8);
  const vertical = pixels((_x, y) => y * 8);
  const first = perceptualHashFromGrayscale32x32(horizontal);
  assert.equal(first, perceptualHashFromGrayscale32x32(horizontal));
  assert.equal(perceptualHashDistance(first, first), 0);
  assert.ok(perceptualHashDistance(first, perceptualHashFromGrayscale32x32(vertical)) > 0);
});

test('perceptual identity guard quarantines distinct binaries with a near-identical visual hash', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-perceptual-'));
  const stage = join(root, 'stage');
  const store = createCorpusStore(join(root, 'corpus'));
  try {
    await stageAcquisitionBatch({
      stage_dir: stage,
      candidates: [candidate('visual:a'), candidate('visual:b')],
      fetch_fn: (async (input: string | URL | Request) =>
        new Response(
          new Uint8Array(String(input).includes('visual:a') ? jpeg('first') : jpeg('second')),
          { status: 200, headers: { 'content-type': 'image/jpeg' } },
        )) as typeof fetch,
    });
    const guard = await createPerceptualIdentityGuard({
      stage_dir: stage,
      store,
      fingerprint_path: async () => '0123456789abcdef',
    });
    const records = await listStagedAcquisitions(stage);
    const result = await guard.check(records[0]!.sha256);
    assert.equal(result.status, 'near_duplicate');
    assert.equal(result.matches.length, 1);
    assert.equal(result.matches[0]?.distance, 0);
    assert.match(result.matches[0]?.references[0] ?? '', /^staged-acquisition:/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('perceptual identity guard fails closed when any comparison Asset cannot be fingerprinted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-perceptual-failure-'));
  const stage = join(root, 'stage');
  const store = createCorpusStore(join(root, 'corpus'));
  try {
    await stageAcquisitionBatch({
      stage_dir: stage,
      candidates: [candidate('visual:ok'), candidate('visual:bad')],
      fetch_fn: (async (input: string | URL | Request) =>
        new Response(
          new Uint8Array(String(input).includes('visual:ok') ? jpeg('ok') : jpeg('bad')),
          { status: 200, headers: { 'content-type': 'image/jpeg' } },
        )) as typeof fetch,
    });
    const records = await listStagedAcquisitions(stage);
    const failingAssetId = records[1]!.asset_id;
    const guard = await createPerceptualIdentityGuard({
      stage_dir: stage,
      store,
      fingerprint_path: async (pathname) => {
        if (pathname.includes(failingAssetId)) throw new Error('decoder unavailable');
        return '0123456789abcdef';
      },
    });
    const result = await guard.check(records[0]!.sha256);
    assert.equal(result.status, 'unavailable');
    assert.match(result.failure_reason ?? '', /comparison snapshot contains 1 unreadable asset/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
