import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  assertAutomatedReviewPromotable,
  createArchivalReviewKey,
  runAutomatedArchivalReview,
  type ArchivalReviewClient,
  type ArchivalReviewModelOutput,
  type ArchivalReviewProviderIdentity,
} from '../src/acquisition/archival-review.js';
import {
  stageAcquisitionBatch,
  type AcquisitionCandidate,
} from '../src/acquisition/acquisition-staging.js';
import { promoteReviewedAcquisitions } from '../src/acquisition/review-promotion.js';
import type { PerceptualIdentityGuard } from '../src/acquisition/perceptual-identity.js';
import type { SourceCorroborationGuard } from '../src/acquisition/wikimedia-commons-evidence.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';

function jpeg(label: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)]);
}

function imageResponse(bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
  });
}

function candidate(key: string): AcquisitionCandidate {
  return {
    acquisition_key: key,
    acquisition_kind: 'web',
    asset_url: `https://assets.example/${key}.jpg`,
    source_url: `https://source.example/${key}`,
    source_title: `Candidate ${key}`,
  };
}

const provider: ArchivalReviewProviderIdentity = {
  provider_id: 'test.review',
  provider_name: 'Test reviewer',
  provider_version: '1.0.0',
  model: 'test-vision',
};

const clearIdentityGuard: PerceptualIdentityGuard = {
  async check(assetSha256) {
    return {
      schema_version: 'signum-perceptual-identity.v0.1',
      check_key: `perceptual_check_clear_${assetSha256.slice(0, 12)}`,
      asset_sha256: assetSha256,
      method_version: 'signum-phash-32x32-dct.v0.1',
      comparison_snapshot: 'asset_snapshot_test',
      distance_threshold: 10,
      perceptual_hash: '0123456789abcdef',
      status: 'clear',
      matches: [],
      failure_reason: null,
    };
  },
};

const noSourceCorroborationGuard: SourceCorroborationGuard = {
  async check() {
    return {
      status: 'not_applicable',
      evidence_refs: [],
      rationale: 'Synthetic test source has no source-specific corroboration contract.',
    };
  },
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'signum-auto-review-'));
  return {
    stage: join(root, 'stage'),
    store: createCorpusStore(join(root, 'corpus')),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function clientReturning(
  output: ArchivalReviewModelOutput,
  calls: { value: number },
): ArchivalReviewClient {
  return {
    async reviewImage() {
      calls.value += 1;
      return output;
    },
  };
}

test('clear single exact-Asset duplicates use one inference and one Advertisement identity', async () => {
  const fx = await fixture();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('source:a'), candidate('source:b')],
      fetch_fn: (async () => imageResponse(jpeg('same-ad'))) as typeof fetch,
      concurrency: 2,
    });
    const calls = { value: 0 };
    const result = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: clientReturning(
        {
          classification: 'single_advertisement',
          confidence: 'high',
          rationale: 'One discrete print advertisement fills the image.',
        },
        calls,
      ),
      provider,
      identity_guard: clearIdentityGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
      concurrency: 2,
    });

    assert.equal(calls.value, 1);
    assert.equal(result.inference_runs, 1);
    assert.equal(result.counts.accept_new, 1);
    assert.equal(result.counts.attach_existing, 1);
    const accepted = result.manifest.items.find((item) => item.decision === 'accept_new')!;
    const attached = result.manifest.items.find((item) => item.decision === 'attach_existing')!;
    assert.equal(attached.advertisement_id, accepted.proposed_advertisement_id);
    assert.ok(accepted.evidence_refs?.[0]?.startsWith('archival-review:'));

    const promotion = await promoteReviewedAcquisitions(fx.store, fx.stage, result.manifest);
    assert.equal(promotion.promoted, 2);
    assert.equal((await fx.store.listAdvertisements()).length, 1);
    assert.equal((await fx.store.listAcquisitionSources()).length, 2);
  } finally {
    await fx.cleanup();
  }
});

test('matching automated review identity is reused without inference', async () => {
  const fx = await fixture();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('source:cache')],
      fetch_fn: (async () => imageResponse(jpeg('cache'))) as typeof fetch,
    });
    const firstCalls = { value: 0 };
    await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: clientReturning(
        {
          classification: 'single_advertisement',
          confidence: 'high',
          rationale: 'Clear single ad.',
        },
        firstCalls,
      ),
      provider,
      identity_guard: clearIdentityGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
    });
    assert.equal(firstCalls.value, 1);

    const second = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: {
        async reviewImage() {
          throw new Error('cache miss');
        },
      },
      provider,
      identity_guard: clearIdentityGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
    });
    assert.equal(second.cache_hits, 1);
    assert.equal(second.inference_runs, 0);
    assert.equal(second.counts.accept_new, 1);
  } finally {
    await fx.cleanup();
  }
});

test('high-confidence non-ad is rejected while uncertain and multiple ads quarantine', async () => {
  for (const [classification, confidence, expected] of [
    ['not_an_advertisement', 'high', 'reject_non_ad'],
    ['multiple_advertisements', 'high', 'quarantine'],
    ['single_advertisement', 'medium', 'quarantine'],
    ['uncertain', 'low', 'quarantine'],
  ] as const) {
    const fx = await fixture();
    try {
      await stageAcquisitionBatch({
        stage_dir: fx.stage,
        candidates: [candidate(`source:${classification}:${confidence}`)],
        fetch_fn: (async () =>
          imageResponse(jpeg(`${classification}:${confidence}`))) as typeof fetch,
      });
      const calls = { value: 0 };
      const result = await runAutomatedArchivalReview({
        stage_dir: fx.stage,
        store: fx.store,
        client: clientReturning(
          { classification, confidence, rationale: 'Visible classification evidence.' },
          calls,
        ),
        provider,
        identity_guard: clearIdentityGuard,
        source_corroboration_guard: noSourceCorroborationGuard,
      });
      assert.equal(result.manifest.items[0]?.decision, expected);
      assert.equal((await fx.store.listAdvertisements()).length, 0);
    } finally {
      await fx.cleanup();
    }
  }
});

test('exact known Corpus owner attaches without invoking visual review', async () => {
  const fx = await fixture();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('source:owned')],
      fetch_fn: (async () => imageResponse(jpeg('owned'))) as typeof fetch,
    });
    const first = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: clientReturning(
        {
          classification: 'single_advertisement',
          confidence: 'high',
          rationale: 'Clear ad.',
        },
        { value: 0 },
      ),
      provider,
      identity_guard: clearIdentityGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
    });
    await promoteReviewedAcquisitions(fx.store, fx.stage, first.manifest);

    const newCandidate: AcquisitionCandidate = {
      ...candidate('source:owned-copy'),
      asset_url: 'https://assets.example/owned-copy.jpg',
    };
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [newCandidate],
      fetch_fn: (async () => imageResponse(jpeg('owned'))) as typeof fetch,
    });
    const result = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: {
        async reviewImage() {
          throw new Error('should not infer exact known owner');
        },
      },
      provider: { ...provider, provider_version: 'different-review-version' },
      identity_guard: clearIdentityGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
    });
    assert.equal(result.inference_runs, 0);
    assert.equal(result.skipped_existing_owner, 1);
    assert.equal(result.counts.attach_existing, 1);
  } finally {
    await fx.cleanup();
  }
});

test('review inference failure quarantines the Asset and never promotes', async () => {
  const fx = await fixture();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('source:failure')],
      fetch_fn: (async () => imageResponse(jpeg('failure'))) as typeof fetch,
    });
    const result = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: {
        async reviewImage() {
          throw new Error('vision unavailable');
        },
      },
      provider,
      identity_guard: clearIdentityGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
    });
    assert.equal(result.failures.length, 1);
    assert.equal(result.manifest.items[0]?.decision, 'quarantine');
    assert.equal(result.counts.accept_new, 0);
    assert.throws(
      () => assertAutomatedReviewPromotable(result),
      /not promotable.*inference\/runtime failure/i,
    );
    assert.equal((await fx.store.listAdvertisements()).length, 0);
  } finally {
    await fx.cleanup();
  }
});

test('automated review key changes with provider/model contract identity', () => {
  const sha = 'a'.repeat(64);
  const first = createArchivalReviewKey(sha, provider);
  assert.equal(first, createArchivalReviewKey(sha, provider));
  assert.notEqual(first, createArchivalReviewKey(sha, { ...provider, provider_version: '2.0.0' }));
  assert.notEqual(first, createArchivalReviewKey(sha, { ...provider, model: 'other-model' }));
});

test('high-confidence single ad quarantines when perceptual identity finds a near duplicate', async () => {
  const fx = await fixture();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('source:near-duplicate')],
      fetch_fn: (async () => imageResponse(jpeg('near-duplicate'))) as typeof fetch,
    });
    const nearDuplicateGuard: PerceptualIdentityGuard = {
      async check(assetSha256) {
        return {
          schema_version: 'signum-perceptual-identity.v0.1',
          check_key: 'perceptual_check_near',
          asset_sha256: assetSha256,
          method_version: 'signum-phash-32x32-dct.v0.1',
          comparison_snapshot: 'asset_snapshot_test',
          distance_threshold: 10,
          perceptual_hash: '0123456789abcdef',
          status: 'near_duplicate',
          matches: [
            {
              asset_sha256: 'b'.repeat(64),
              references: ['corpus-asset:asset_existing'],
              distance: 4,
            },
          ],
          failure_reason: null,
        };
      },
    };
    const result = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: clientReturning(
        {
          classification: 'single_advertisement',
          confidence: 'high',
          rationale: 'One clear advertisement.',
        },
        { value: 0 },
      ),
      provider,
      identity_guard: nearDuplicateGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
    });
    assert.equal(result.counts.accept_new, 0);
    assert.equal(result.counts.quarantine, 1);
    assert.equal(result.identity_checks.near_duplicate, 1);
    assert.match(result.manifest.items[0]?.rationale ?? '', /identity remains ambiguous/i);
    assert.ok(
      result.manifest.items[0]?.evidence_refs?.includes(
        'perceptual-identity-check:perceptual_check_near',
      ),
    );
  } finally {
    await fx.cleanup();
  }
});

test('unavailable perceptual identity preflight blocks automated promotion', async () => {
  const fx = await fixture();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('source:identity-unavailable')],
      fetch_fn: (async () => imageResponse(jpeg('identity-unavailable'))) as typeof fetch,
    });
    const unavailableIdentityGuard: PerceptualIdentityGuard = {
      async check(assetSha256) {
        return {
          schema_version: 'signum-perceptual-identity.v0.1',
          check_key: 'perceptual_check_unavailable',
          asset_sha256: assetSha256,
          method_version: 'signum-phash-32x32-dct.v0.1',
          comparison_snapshot: 'asset_snapshot_test',
          distance_threshold: 10,
          perceptual_hash: '0000000000000000',
          status: 'unavailable',
          matches: [],
          failure_reason: 'ffmpeg unavailable',
        };
      },
    };
    const result = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: clientReturning(
        {
          classification: 'single_advertisement',
          confidence: 'high',
          rationale: 'One clear advertisement.',
        },
        { value: 0 },
      ),
      provider,
      identity_guard: unavailableIdentityGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
    });
    assert.equal(result.identity_checks.unavailable, 1);
    assert.equal(result.counts.quarantine, 1);
    assert.throws(
      () => assertAutomatedReviewPromotable(result),
      /not promotable.*unavailable perceptual identity/i,
    );
  } finally {
    await fx.cleanup();
  }
});

test('high-confidence single ad quarantines when source metadata does not corroborate advertising', async () => {
  const fx = await fixture();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('source:uncorroborated')],
      fetch_fn: (async () => imageResponse(jpeg('uncorroborated'))) as typeof fetch,
    });
    const unsupportedSourceGuard: SourceCorroborationGuard = {
      async check() {
        return {
          status: 'unsupported',
          evidence_refs: ['commons-source-evidence:test_evidence'],
          rationale: 'Source metadata does not explicitly identify advertising.',
        };
      },
    };
    const result = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: clientReturning(
        {
          classification: 'single_advertisement',
          confidence: 'high',
          rationale: 'One clear advertisement.',
        },
        { value: 0 },
      ),
      provider,
      identity_guard: clearIdentityGuard,
      source_corroboration_guard: unsupportedSourceGuard,
    });
    assert.equal(result.counts.accept_new, 0);
    assert.equal(result.counts.quarantine, 1);
    assert.equal(result.source_corroboration_checks.unsupported, 1);
    assert.ok(
      result.manifest.items[0]?.evidence_refs?.includes('commons-source-evidence:test_evidence'),
    );
  } finally {
    await fx.cleanup();
  }
});

test('existing decision receipts prevent later automation from overriding review history', async () => {
  const fx = await fixture();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('source:manual-precedence')],
      fetch_fn: (async () => imageResponse(jpeg('manual-precedence'))) as typeof fetch,
    });
    const calls = { value: 0 };
    const first = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: clientReturning(
        {
          classification: 'not_an_advertisement',
          confidence: 'high',
          rationale: 'Clearly not an advertisement.',
        },
        calls,
      ),
      provider,
      identity_guard: clearIdentityGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
    });
    await promoteReviewedAcquisitions(fx.store, fx.stage, first.manifest);

    const second = await runAutomatedArchivalReview({
      stage_dir: fx.stage,
      store: fx.store,
      client: {
        async reviewImage() {
          throw new Error('must not override decided review history');
        },
      },
      provider: { ...provider, provider_version: '2.0.0' },
      identity_guard: clearIdentityGuard,
      source_corroboration_guard: noSourceCorroborationGuard,
    });
    assert.equal(second.skipped_decided, 1);
    assert.equal(second.inference_runs, 0);
    assert.equal(second.manifest.items.length, 0);
    assert.equal((await fx.store.listAdvertisements()).length, 0);
  } finally {
    await fx.cleanup();
  }
});
