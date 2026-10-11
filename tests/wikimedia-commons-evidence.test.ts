import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  buildAcquisitionReviewManifest,
  stageAcquisitionBatch,
  type AcquisitionCandidate,
} from '../src/acquisition/acquisition-staging.js';
import {
  captureWikimediaCommonsSourceEvidence,
  createWikimediaCommonsSourceCorroborationGuard,
} from '../src/acquisition/wikimedia-commons-evidence.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';

function jpeg(label: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)]);
}

function commonsCandidate(pageId: number): AcquisitionCandidate {
  return {
    acquisition_key: `commons:${pageId}`,
    acquisition_kind: 'web',
    asset_url: `https://upload.wikimedia.org/example/${pageId}.jpg`,
    source_url: `https://commons.wikimedia.org/wiki/File:Example_${pageId}.jpg`,
    source_title: `Example ${pageId}.jpg`,
  };
}

async function fixture(pageId: number) {
  const root = await mkdtemp(join(tmpdir(), 'signum-commons-evidence-'));
  const stage = join(root, 'stage');
  const store = createCorpusStore(join(root, 'corpus'));
  await stageAcquisitionBatch({
    stage_dir: stage,
    candidates: [commonsCandidate(pageId)],
    fetch_fn: (async () =>
      new Response(new Uint8Array(jpeg(`commons-${pageId}`)), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })) as typeof fetch,
  });
  return { root, stage, store, cleanup: () => rm(root, { recursive: true, force: true }) };
}

function evidenceResponse(
  pageId: number,
  categories: readonly string[],
  description = 'Archival source description',
): Response {
  return new Response(
    JSON.stringify({
      query: {
        pages: {
          [String(pageId)]: {
            pageid: pageId,
            title: `File:Example ${pageId}.jpg`,
            categories: categories.map((title) => ({ title: `Category:${title}` })),
            lastrevid: 9000 + pageId,
            imageinfo: [
              {
                extmetadata: {
                  ImageDescription: { value: description },
                  DateTimeOriginal: { value: '1930' },
                },
              },
            ],
          },
        },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

test('Commons source evidence is immutable, reusable, and corroborates explicit advertising categories', async () => {
  const fx = await fixture(123);
  try {
    let calls = 0;
    const first = await captureWikimediaCommonsSourceEvidence(fx.stage, {
      request_delay_ms: 0,
      fetch_fn: (async () => {
        calls += 1;
        return evidenceResponse(123, ['Advertisements by newspaper', '1930 in advertising']);
      }) as typeof fetch,
    });
    assert.equal(calls, 1);
    assert.deepEqual(first, {
      commons_acquisitions: 1,
      captured: 1,
      reused: 0,
      supported: 1,
      unsupported: 0,
    });

    const review = await buildAcquisitionReviewManifest(fx.store, fx.stage);
    const check = await createWikimediaCommonsSourceCorroborationGuard(fx.stage).check(
      review.items,
    );
    assert.equal(check.status, 'supported');
    assert.ok(check.evidence_refs[0]?.startsWith('commons-source-evidence:commons_evidence_'));

    const replay = await captureWikimediaCommonsSourceEvidence(fx.stage, {
      request_delay_ms: 0,
      fetch_fn: (async () => {
        throw new Error('immutable evidence should have been reused');
      }) as typeof fetch,
    });
    assert.equal(replay.captured, 0);
    assert.equal(replay.reused, 1);
    assert.equal(replay.supported, 1);
  } finally {
    await fx.cleanup();
  }
});

test('Commons source corroboration fails closed when evidence is missing and quarantines unsupported metadata', async () => {
  const fx = await fixture(321);
  try {
    const review = await buildAcquisitionReviewManifest(fx.store, fx.stage);
    await assert.rejects(
      () => createWikimediaCommonsSourceCorroborationGuard(fx.stage).check(review.items),
      /source evidence missing.*corpus:commons-evidence/i,
    );

    const captured = await captureWikimediaCommonsSourceEvidence(fx.stage, {
      request_delay_ms: 0,
      fetch_fn: (async () =>
        evidenceResponse(321, [
          'Buildings in Helsinki',
          'Black and white photographs',
        ])) as typeof fetch,
    });
    assert.equal(captured.unsupported, 1);
    const check = await createWikimediaCommonsSourceCorroborationGuard(fx.stage).check(
      review.items,
    );
    assert.equal(check.status, 'unsupported');
    assert.match(check.rationale, /does not explicitly categorize/i);
  } finally {
    await fx.cleanup();
  }
});

test('Commons archival description can corroborate advertising when categories are absent', async () => {
  const fx = await fixture(654);
  try {
    const captured = await captureWikimediaCommonsSourceEvidence(fx.stage, {
      request_delay_ms: 0,
      fetch_fn: (async () =>
        evidenceResponse(
          654,
          [],
          'Genre: Advertising cards. Collection: 19th Century American Trade Cards.',
        )) as typeof fetch,
    });
    assert.equal(captured.supported, 1);
    const review = await buildAcquisitionReviewManifest(fx.store, fx.stage);
    const check = await createWikimediaCommonsSourceCorroborationGuard(fx.stage).check(
      review.items,
    );
    assert.equal(check.status, 'supported');
    assert.match(check.rationale, /archival description explicitly identifies/i);
  } finally {
    await fx.cleanup();
  }
});
