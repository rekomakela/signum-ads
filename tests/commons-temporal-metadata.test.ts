import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  buildCommonsTemporalProposalManifest,
  extractCommonsTemporalSignals,
  promoteCommonsTemporalMetadata,
} from '../src/acquisition/commons-temporal-metadata.js';
import {
  ACQUISITION_REVIEW_VERSION,
  buildAcquisitionReviewManifest,
  stageAcquisitionBatch,
} from '../src/acquisition/acquisition-staging.js';
import {
  ACQUISITION_DECISION_VERSION,
  promoteReviewedAcquisitions,
} from '../src/acquisition/review-promotion.js';
import {
  captureWikimediaCommonsSourceEvidence,
  WIKIMEDIA_COMMONS_SOURCE_EVIDENCE_VERSION,
  type WikimediaCommonsSourceEvidenceRecord,
} from '../src/acquisition/wikimedia-commons-evidence.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';

function jpeg(label: string): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)]);
}

function evidence(overrides: Partial<WikimediaCommonsSourceEvidenceRecord> = {}) {
  return {
    schema_version: WIKIMEDIA_COMMONS_SOURCE_EVIDENCE_VERSION,
    evidence_key: 'commons_evidence_test',
    acquisition_key: 'commons:123',
    page_id: 123,
    page_revision_id: 456,
    source_url: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
    source_title: 'Test.jpg',
    categories: ['1953 advertisements'],
    image_description: '1953 advertisement',
    date_time_original: '2024-09-15',
    advertisement_support_categories: ['1953 advertisements'],
    advertisement_support_description_match: true,
    supports_advertisement: true,
    ...overrides,
  } satisfies WikimediaCommonsSourceEvidenceRecord;
}

test('Commons temporal extraction ignores generic DateTimeOriginal upload/capture metadata', () => {
  const signals = extractCommonsTemporalSignals('commons:123', evidence());
  assert.deepEqual(
    signals.map((signal) => [signal.kind, signal.value]),
    [['advertisement_year_category', '1953']],
  );
});

test('Commons temporal extraction reads explicit Date of Publishing statements from archival descriptions', () => {
  const signals = extractCommonsTemporalSignals(
    'commons:123',
    evidence({
      categories: [],
      image_description: '<p><b>Date of Publishing</b> : 1885</p>',
      date_time_original: '2013-12-10',
    }),
  );
  assert.deepEqual(
    signals.map((signal) => [signal.kind, signal.value]),
    [['publication_year_description', '1885']],
  );
});

async function acceptedFixture(
  categories: readonly string[],
  imageDescription: string | null,
  dateTimeOriginal = '2024-09-15',
) {
  const root = await mkdtemp(join(tmpdir(), 'signum-commons-temporal-'));
  const stage = join(root, 'stage');
  const store = createCorpusStore(join(root, 'corpus'));
  await stageAcquisitionBatch({
    stage_dir: stage,
    candidates: [
      {
        acquisition_key: 'commons:123',
        acquisition_kind: 'web',
        asset_url: 'https://upload.wikimedia.org/test.jpg',
        source_url: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
        source_title: 'Test.jpg',
      },
    ],
    fetch_fn: (async () =>
      new Response(new Uint8Array(jpeg('temporal-test')), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })) as typeof fetch,
  });
  const review = await buildAcquisitionReviewManifest(store, stage);
  const item = review.items[0]!;
  await promoteReviewedAcquisitions(store, stage, {
    schema_version: ACQUISITION_DECISION_VERSION,
    review_schema_version: ACQUISITION_REVIEW_VERSION,
    items: [
      {
        acquisition_key: item.acquisition_key,
        sha256: item.sha256,
        source_title: item.source_title,
        source_url: item.source_url,
        review_state: item.review_state,
        proposed_advertisement_id: item.proposed_advertisement_id,
        decision: 'accept_new',
        advertisement_id: null,
        rationale: 'Reviewed advertisement fixture.',
        evidence_refs: ['fixture:review'],
      },
    ],
  });
  await captureWikimediaCommonsSourceEvidence(stage, {
    request_delay_ms: 0,
    fetch_fn: (async () =>
      new Response(
        JSON.stringify({
          query: {
            pages: {
              '123': {
                pageid: 123,
                title: 'File:Test.jpg',
                lastrevid: 456,
                categories: categories.map((category) => ({ title: `Category:${category}` })),
                imageinfo: [
                  {
                    extmetadata: {
                      ImageDescription: { value: imageDescription ?? '' },
                      DateTimeOriginal: { value: dateTimeOriginal },
                    },
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch,
  });
  return {
    root,
    stage,
    store,
    advertisement_id: item.proposed_advertisement_id!,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test('Commons temporal metadata promotes exact archival date with provenance and is idempotent', async () => {
  const fx = await acceptedFixture(
    ['1930 advertisements', '1930-02-10'],
    'Newspaper advertisement.',
  );
  try {
    const manifest = await buildCommonsTemporalProposalManifest(fx.store, fx.stage);
    assert.equal(manifest.counts.proposed, 1);
    assert.equal(manifest.counts.exact_date, 1);
    assert.equal(manifest.proposals[0]?.temporal?.start_date, '1930-02-10');

    const result = await promoteCommonsTemporalMetadata(fx.store, manifest);
    assert.equal(result.promoted, 1);
    assert.equal(result.assertions_written, 1);
    const advertisement = await fx.store.readAdvertisement(fx.advertisement_id);
    assert.equal(advertisement?.temporal.precision, 'exact_date');
    assert.equal(advertisement?.temporal.start_date, '1930-02-10');
    assert.equal(advertisement?.metadata_assertion_ids.length, 1);
    const assertions = await fx.store.listMetadataAssertions();
    assert.equal(assertions.length, 1);
    assert.equal(assertions[0]?.field, 'temporal');
    assert.ok(assertions[0]?.source_refs.some((ref) => ref.startsWith('commons-source-evidence:')));
    assert.ok(assertions[0]?.source_refs.some((ref) => ref.startsWith('acquisition-source:')));

    const rerun = await buildCommonsTemporalProposalManifest(fx.store, fx.stage);
    assert.equal(rerun.counts.already_known, 1);
    assert.equal((await promoteCommonsTemporalMetadata(fx.store, rerun)).promoted, 0);
    assert.equal((await fx.store.listMetadataAssertions()).length, 1);
  } finally {
    await fx.cleanup();
  }
});

test('Commons temporal metadata promotes explicit publication year but ignores conflicting upload date', async () => {
  const fx = await acceptedFixture(
    ['1953 advertisements'],
    '1953 advertisement for a trailer.',
    '2024-09-15',
  );
  try {
    const manifest = await buildCommonsTemporalProposalManifest(fx.store, fx.stage);
    assert.equal(manifest.counts.year, 1);
    assert.deepEqual(manifest.proposals[0]?.temporal, {
      start_year: 1953,
      end_year: 1953,
      precision: 'year',
      start_date: null,
      end_date: null,
    });
  } finally {
    await fx.cleanup();
  }
});

test('Commons temporal metadata fails closed on conflicting explicit publication years', async () => {
  const fx = await acceptedFixture(
    ['1930 advertisements', '1931 advertisements'],
    'Advertisement with conflicting catalogue metadata.',
  );
  try {
    const manifest = await buildCommonsTemporalProposalManifest(fx.store, fx.stage);
    assert.equal(manifest.counts.conflict, 1);
    assert.equal(manifest.counts.proposed, 0);
    assert.match(manifest.proposals[0]?.reason ?? '', /conflicting temporal values/i);
    const result = await promoteCommonsTemporalMetadata(fx.store, manifest);
    assert.equal(result.promoted, 0);
    assert.equal(
      (await fx.store.readAdvertisement(fx.advertisement_id))?.temporal.precision,
      'unknown',
    );
    assert.equal((await fx.store.listMetadataAssertions()).length, 0);
  } finally {
    await fx.cleanup();
  }
});
