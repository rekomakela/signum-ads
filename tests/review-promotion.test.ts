import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  buildAcquisitionReviewManifest,
  stageAcquisitionBatch,
  type AcquisitionCandidate,
} from '../src/acquisition/acquisition-staging.js';
import {
  createAcquisitionDecisionTemplate,
  listAcquisitionDecisionReceipts,
  promoteReviewedAcquisitions,
  type AcquisitionDecisionItem,
  type AcquisitionDecisionManifest,
} from '../src/acquisition/review-promotion.js';
import { ingestArchiveBatch } from '../src/corpus/archive-ingestion.js';
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

async function roots() {
  const root = await mkdtemp(join(tmpdir(), 'signum-review-promotion-'));
  return {
    root,
    stage: join(root, 'stage'),
    corpus: join(root, 'corpus'),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function candidate(key: string, suffix: string): AcquisitionCandidate {
  return {
    acquisition_key: key,
    acquisition_kind: 'web',
    asset_url: `https://assets.example/${suffix}.jpg`,
    source_url: `https://source.example/${suffix}`,
    source_title: `Advertisement ${suffix}`,
  };
}

function manifestWith(
  base: AcquisitionDecisionManifest,
  items: readonly AcquisitionDecisionItem[],
): AcquisitionDecisionManifest {
  return { ...base, items };
}

test('explicit accept_new promotes one staged acquisition and replay is idempotent', async () => {
  const fx = await roots();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('test:new', 'new')],
      fetch_fn: (async () => imageResponse(jpeg('new'))) as typeof fetch,
    });
    const store = createCorpusStore(fx.corpus);
    const review = await buildAcquisitionReviewManifest(store, fx.stage);
    const template = createAcquisitionDecisionTemplate(review);
    const item = template.items[0]!;
    assert.equal(item.advertisement_id, null);
    assert.ok(item.proposed_advertisement_id?.startsWith('ad_'));

    const decisions = manifestWith(template, [
      { ...item, decision: 'accept_new', rationale: 'Reviewed as a distinct advertisement.' },
    ]);
    const first = await promoteReviewedAcquisitions(store, fx.stage, decisions);
    assert.equal(first.promoted, 1);
    assert.equal(first.receipts_written, 1);
    assert.equal((await store.listAdvertisements()).length, 1);
    assert.equal((await store.listDecodeRevisions()).length, 0);

    const second = await promoteReviewedAcquisitions(store, fx.stage, decisions);
    assert.equal(second.promoted, 1);
    assert.equal(second.corpus?.results[0]?.status, 'unchanged');
    assert.equal(second.receipts_written, 0);
    assert.equal((await listAcquisitionDecisionReceipts(fx.stage, 'test:new')).length, 1);
  } finally {
    await fx.cleanup();
  }
});

test('reject_non_ad remains unpromoted and later reconsideration appends review history', async () => {
  const fx = await roots();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('test:reconsider', 'reconsider')],
      fetch_fn: (async () => imageResponse(jpeg('reconsider'))) as typeof fetch,
    });
    const store = createCorpusStore(fx.corpus);
    const template = createAcquisitionDecisionTemplate(
      await buildAcquisitionReviewManifest(store, fx.stage),
    );
    const item = template.items[0]!;
    const rejected = manifestWith(template, [
      { ...item, decision: 'reject_non_ad', rationale: 'Reviewed source is not an advertisement.' },
    ]);
    const rejectedResult = await promoteReviewedAcquisitions(store, fx.stage, rejected);
    assert.equal(rejectedResult.rejected, 1);
    assert.equal(rejectedResult.promoted, 0);
    assert.equal((await store.listAdvertisements()).length, 0);

    const accepted = manifestWith(template, [
      {
        ...item,
        decision: 'accept_new',
        rationale: 'Reconsidered after stronger archival evidence.',
      },
    ]);
    const acceptedResult = await promoteReviewedAcquisitions(store, fx.stage, accepted);
    assert.equal(acceptedResult.promoted, 1);
    assert.equal((await store.listAdvertisements()).length, 1);
    assert.equal((await listAcquisitionDecisionReceipts(fx.stage, 'test:reconsider')).length, 2);
  } finally {
    await fx.cleanup();
  }
});

test('attach_existing explicitly adds a second Asset representation to one Advertisement', async () => {
  const fx = await roots();
  try {
    const candidates = [candidate('test:first', 'first'), candidate('test:second', 'second')];
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates,
      fetch_fn: (async (input: string | URL | Request) =>
        imageResponse(jpeg(String(input).includes('first') ? 'first' : 'second'))) as typeof fetch,
    });
    const store = createCorpusStore(fx.corpus);
    const template = createAcquisitionDecisionTemplate(
      await buildAcquisitionReviewManifest(store, fx.stage),
    );
    const first = template.items.find((item) => item.acquisition_key === 'test:first')!;
    const second = template.items.find((item) => item.acquisition_key === 'test:second')!;
    const adId = first.proposed_advertisement_id!;

    await promoteReviewedAcquisitions(
      store,
      fx.stage,
      manifestWith(template, [
        { ...first, decision: 'accept_new', rationale: 'Reviewed primary representation.' },
      ]),
    );
    const attached = await promoteReviewedAcquisitions(
      store,
      fx.stage,
      manifestWith(template, [
        {
          ...second,
          decision: 'attach_existing',
          advertisement_id: adId,
          rationale: 'Reviewed as another representation of the same advertisement.',
        },
      ]),
    );
    assert.equal(attached.promoted, 1);
    assert.equal((await store.readAdvertisement(adId))?.asset_ids.length, 2);
  } finally {
    await fx.cleanup();
  }
});

test('review plan fails closed before promotion when one exact Asset is assigned to two Advertisements', async () => {
  const fx = await roots();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('test:dup-a', 'dup-a'), candidate('test:dup-b', 'dup-b')],
      fetch_fn: (async () => imageResponse(jpeg('same'))) as typeof fetch,
    });
    const store = createCorpusStore(fx.corpus);
    const template = createAcquisitionDecisionTemplate(
      await buildAcquisitionReviewManifest(store, fx.stage),
    );
    const [first, second] = template.items;
    await assert.rejects(
      () =>
        promoteReviewedAcquisitions(
          store,
          fx.stage,
          manifestWith(template, [
            {
              ...first!,
              decision: 'accept_new',
              advertisement_id: 'ad_reviewed_a',
              rationale: 'Reviewed A.',
            },
            {
              ...second!,
              decision: 'accept_new',
              advertisement_id: 'ad_reviewed_b',
              rationale: 'Reviewed B.',
            },
          ]),
        ),
      /assign exact Asset .* to multiple Advertisements/,
    );
    assert.equal((await store.listAdvertisements()).length, 0);
    assert.equal(
      (await listAcquisitionDecisionReceipts(fx.stage, first!.acquisition_key)).length,
      0,
    );
  } finally {
    await fx.cleanup();
  }
});

test('review decision SHA is frozen against staged Asset drift', async () => {
  const fx = await roots();
  try {
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('test:sha', 'sha')],
      fetch_fn: (async () => imageResponse(jpeg('sha'))) as typeof fetch,
    });
    const store = createCorpusStore(fx.corpus);
    const template = createAcquisitionDecisionTemplate(
      await buildAcquisitionReviewManifest(store, fx.stage),
    );
    const item = template.items[0]!;
    await assert.rejects(
      () =>
        promoteReviewedAcquisitions(
          store,
          fx.stage,
          manifestWith(template, [
            {
              ...item,
              sha256: 'f'.repeat(64),
              decision: 'accept_new',
              rationale: 'Bad frozen hash.',
            },
          ]),
        ),
      /SHA-256 drift/,
    );
    assert.equal((await store.listAdvertisements()).length, 0);
  } finally {
    await fx.cleanup();
  }
});

test('quarantine can be recorded even when exact corpus ownership is already ambiguous', async () => {
  const fx = await roots();
  try {
    const bytes = jpeg('ambiguous');
    await stageAcquisitionBatch({
      stage_dir: fx.stage,
      candidates: [candidate('test:ambiguous', 'ambiguous')],
      fetch_fn: (async () => imageResponse(bytes)) as typeof fetch,
    });
    const assetPath = join(fx.root, 'ambiguous.jpg');
    await writeFile(assetPath, bytes);
    const store = createCorpusStore(fx.corpus);
    await ingestArchiveBatch(store, [
      {
        advertisement_id: 'ad_ambiguous_one',
        asset_path: assetPath,
        acquisition_key: 'seed:one',
        acquisition_kind: 'web',
      },
    ]);
    const asset = (await store.listAssets())[0]!;
    await store.putAdvertisement({
      ...(await store.readAdvertisement('ad_ambiguous_one'))!,
      advertisement_id: 'ad_ambiguous_two',
      asset_ids: [asset.asset_id],
      acquisition_source_ids: [],
    });

    const review = await buildAcquisitionReviewManifest(store, fx.stage);
    assert.equal(review.items[0]?.review_state, 'blocked_ambiguous_owner');
    const decision: AcquisitionDecisionItem = {
      acquisition_key: review.items[0]!.acquisition_key,
      sha256: review.items[0]!.sha256,
      source_title: review.items[0]!.source_title,
      source_url: review.items[0]!.source_url,
      review_state: 'blocked_ambiguous_owner',
      decision: 'quarantine',
      advertisement_id: null,
      proposed_advertisement_id: null,
      rationale: 'Quarantined pending corpus identity repair.',
    };
    const result = await promoteReviewedAcquisitions(store, fx.stage, {
      schema_version: 'signum-acquisition-decisions.v0.1',
      review_schema_version: 'signum-acquisition-review.v0.1',
      items: [decision],
    });
    assert.equal(result.quarantined, 1);
    assert.equal(result.promoted, 0);
    assert.equal((await listAcquisitionDecisionReceipts(fx.stage, 'test:ambiguous')).length, 1);
  } finally {
    await fx.cleanup();
  }
});
