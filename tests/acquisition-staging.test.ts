import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  ACQUISITION_REVIEW_VERSION,
  buildAcquisitionReviewManifest,
  listStagedAcquisitions,
  stageAcquisitionBatch,
  type AcquisitionCandidate,
} from '../src/acquisition/acquisition-staging.js';
import { loadOrCreateDiscoverySnapshot } from '../src/acquisition/discovery-snapshot.js';
import { fetchWikimediaCommonsCandidates } from '../src/acquisition/wikimedia-commons-source.js';
import {
  CORPUS_RECORD_VERSION,
  UNKNOWN_TEMPORAL_EXTENT,
  type AdvertisementRecord,
  type AssetRecord,
} from '../src/corpus/corpus-records.js';
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

async function tempRoots(): Promise<{
  stage: string;
  corpus: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'signum-acquisition-'));
  return {
    stage: join(root, 'stage'),
    corpus: join(root, 'corpus'),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

const candidates: AcquisitionCandidate[] = [
  {
    acquisition_key: 'web:a',
    acquisition_kind: 'web',
    asset_url: 'https://assets.example/a.jpg',
    source_url: 'https://source.example/a',
    source_title: 'A',
  },
  {
    acquisition_key: 'web:b',
    acquisition_kind: 'web',
    asset_url: 'https://assets.example/b.jpg',
    source_url: 'https://source.example/b',
    source_title: 'B',
  },
  {
    acquisition_key: 'web:c',
    acquisition_kind: 'web',
    asset_url: 'https://assets.example/c.jpg',
    source_url: 'https://source.example/c',
    source_title: 'C',
  },
];

test('staging acquires concurrently, deduplicates exact binary Assets, and does not create Advertisements', async () => {
  const roots = await tempRoots();
  try {
    const fetchFn = (async (input: string | URL | Request) => {
      const url = String(input);
      return imageResponse(url.endsWith('/c.jpg') ? jpeg('unique') : jpeg('same'));
    }) as typeof fetch;
    const result = await stageAcquisitionBatch({
      stage_dir: roots.stage,
      candidates,
      fetch_fn: fetchFn,
      concurrency: 3,
    });
    assert.equal(result.staged, 3);
    assert.equal(result.reused, 0);
    assert.equal(result.failed, 0);

    const records = await listStagedAcquisitions(roots.stage);
    assert.equal(records.length, 3);
    assert.equal(new Set(records.map((record) => record.asset_id)).size, 2);
    assert.equal((await createCorpusStore(roots.corpus).listAdvertisements()).length, 0);

    const review = await buildAcquisitionReviewManifest(
      createCorpusStore(roots.corpus),
      roots.stage,
    );
    assert.equal(review.schema_version, ACQUISITION_REVIEW_VERSION);
    assert.equal(review.counts.acquisitions, 3);
    assert.equal(review.counts.unique_assets, 2);
    assert.equal(review.counts.exact_duplicate_groups, 1);
    assert.equal(review.counts.requires_identity_review, 3);
    assert.ok(review.items.every((item) => item.advertisement_id === null));
    assert.ok(review.items.every((item) => item.proposed_advertisement_id?.startsWith('ad_')));
  } finally {
    await roots.cleanup();
  }
});

test('staging rerun is resumable and does not redownload immutable acquisitions', async () => {
  const roots = await tempRoots();
  try {
    let downloads = 0;
    const fetchFn = (async () => {
      downloads += 1;
      return imageResponse(jpeg('once'));
    }) as typeof fetch;
    await stageAcquisitionBatch({
      stage_dir: roots.stage,
      candidates: [candidates[0]!],
      fetch_fn: fetchFn,
    });
    const second = await stageAcquisitionBatch({
      stage_dir: roots.stage,
      candidates: [candidates[0]!],
      fetch_fn: (async () => {
        throw new Error('should not fetch');
      }) as typeof fetch,
    });
    assert.equal(downloads, 1);
    assert.equal(second.staged, 0);
    assert.equal(second.reused, 1);
  } finally {
    await roots.cleanup();
  }
});

test('review safely recognizes an exact Asset already owned by one Corpus Advertisement', async () => {
  const roots = await tempRoots();
  try {
    const fetchFn = (async () => imageResponse(jpeg('owned'))) as typeof fetch;
    const staged = await stageAcquisitionBatch({
      stage_dir: roots.stage,
      candidates: [candidates[0]!],
      fetch_fn: fetchFn,
    });
    const record = staged.records[0]!;
    const store = createCorpusStore(roots.corpus);
    const asset: AssetRecord = {
      schema_version: CORPUS_RECORD_VERSION,
      asset_id: record.asset_id,
      media_type: 'image',
      sha256: record.sha256,
      legacy_paths: [],
      acquisition_source_ids: [],
    };
    const advertisement: AdvertisementRecord = {
      schema_version: CORPUS_RECORD_VERSION,
      advertisement_id: 'ad_reviewed_existing',
      asset_ids: [record.asset_id],
      brand_ids: [],
      product_ids: [],
      campaign_ids: [],
      placement_ids: [],
      market_ids: [],
      temporal: UNKNOWN_TEMPORAL_EXTENT,
      acquisition_source_ids: [],
      metadata_assertion_ids: [],
      decode_revision_ids: [],
      legacy_case_ids: [],
    };
    await store.putAsset(asset);
    await store.putAdvertisement(advertisement);

    const review = await buildAcquisitionReviewManifest(store, roots.stage);
    assert.equal(review.items[0]?.review_state, 'existing_owner');
    assert.equal(review.items[0]?.advertisement_id, 'ad_reviewed_existing');
    assert.equal(review.items[0]?.proposed_advertisement_id, null);
  } finally {
    await roots.cleanup();
  }
});

test('conflicting duplicate acquisition keys fail before any network work', async () => {
  const roots = await tempRoots();
  try {
    let called = false;
    await assert.rejects(
      () =>
        stageAcquisitionBatch({
          stage_dir: roots.stage,
          candidates: [
            candidates[0]!,
            { ...candidates[0]!, asset_url: 'https://other.example/a.jpg' },
          ],
          fetch_fn: (async () => {
            called = true;
            return imageResponse(jpeg('x'));
          }) as typeof fetch,
        }),
      /Conflicting acquisition candidate definitions/,
    );
    assert.equal(called, false);
  } finally {
    await roots.cleanup();
  }
});

test('Asset acquisition retries a rate-limited download', async () => {
  const roots = await tempRoots();
  try {
    let calls = 0;
    const fetchFn = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
      }
      return imageResponse(jpeg('after-retry'));
    }) as typeof fetch;
    const result = await stageAcquisitionBatch({
      stage_dir: roots.stage,
      candidates: [candidates[0]!],
      fetch_fn: fetchFn,
    });
    assert.equal(calls, 2);
    assert.equal(result.staged, 1);
    assert.equal(result.failed, 0);
  } finally {
    await roots.cleanup();
  }
});

test('bad Assets are reported without discarding successful acquisitions', async () => {
  const roots = await tempRoots();
  try {
    const fetchFn = (async (input: string | URL | Request) =>
      String(input).endsWith('/a.jpg')
        ? imageResponse(jpeg('good'))
        : new Response('<html>not an image</html>', { status: 200 })) as typeof fetch;
    const result = await stageAcquisitionBatch({
      stage_dir: roots.stage,
      candidates: [candidates[0]!, candidates[1]!],
      fetch_fn: fetchFn,
      concurrency: 2,
    });
    assert.equal(result.staged, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.failures[0]?.acquisition_key, 'web:b');
    assert.match(result.failures[0]?.reason ?? '', /not a supported image binary/);
  } finally {
    await roots.cleanup();
  }
});

test('Wikimedia Commons source stops at the target and emits image candidates', async () => {
  const requested: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    requested.push(url.toString());
    if (url.searchParams.get('generator') === 'categorymembers') {
      const pages = {
        '11': {
          pageid: 11,
          ns: 6,
          title: 'File:First ad.jpg',
          imageinfo: [
            {
              url: 'https://upload.wikimedia.org/original-11.jpg',
              thumburl: 'https://upload.wikimedia.org/11.jpg',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:11',
              mime: 'image/jpeg',
            },
          ],
        },
        '12': {
          pageid: 12,
          ns: 6,
          title: 'File:Second ad.png',
          imageinfo: [
            {
              url: 'https://upload.wikimedia.org/12.png',
              descriptionurl: 'https://commons.wikimedia.org/wiki/File:12',
              mime: 'image/png',
            },
          ],
        },
      };
      return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
    }
    throw new Error(`unexpected request ${url}`);
  }) as typeof fetch;

  const result = await fetchWikimediaCommonsCandidates({
    count: 2,
    max_depth: 1,
    fetch_fn: fetchFn,
  });
  assert.equal(requested.length, 1);
  assert.deepEqual(
    result.map((candidate) => candidate.acquisition_key),
    ['commons:11', 'commons:12'],
  );
  assert.equal(result[0]?.source_title, 'First ad.jpg');
  assert.equal(result[0]?.asset_url, 'https://upload.wikimedia.org/11.jpg');
  assert.equal(new URL(requested[0]!).searchParams.get('iiurlwidth'), '1600');
  assert.equal(
    new URL(requested[0]!).searchParams.get('gcmtitle'),
    'Category:Advertisements by newspaper',
  );
  assert.equal(result[0]?.acquisition_kind, 'web');
});

test('Wikimedia Commons source retries a rate-limited API request', async () => {
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response('rate limited', { status: 429, headers: { 'retry-after': '0' } });
    }
    return new Response(
      JSON.stringify({
        query: {
          pages: {
            '11': {
              pageid: 11,
              ns: 6,
              title: 'File:Ad.jpg',
              imageinfo: [
                {
                  url: 'https://upload.wikimedia.org/11.jpg',
                  descriptionurl: 'https://commons.wikimedia.org/wiki/File:11',
                  mime: 'image/jpeg',
                },
              ],
            },
          },
        },
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await fetchWikimediaCommonsCandidates({ count: 1, fetch_fn: fetchFn });
  assert.equal(calls, 2);
  assert.equal(result.length, 1);
});

test('discovery snapshot freezes one source request for resumable acquisition', async () => {
  const roots = await tempRoots();
  let discoveries = 0;
  try {
    const first = await loadOrCreateDiscoverySnapshot(
      roots.stage,
      'wikimedia-commons',
      { category: 'Advertisements', count: 100, depth: 1 },
      async () => {
        discoveries += 1;
        return [candidates[1]!, candidates[0]!];
      },
    );
    const second = await loadOrCreateDiscoverySnapshot(
      roots.stage,
      'wikimedia-commons',
      { depth: 1, count: 100, category: 'Advertisements' },
      async () => {
        discoveries += 1;
        return [candidates[2]!];
      },
    );

    assert.equal(discoveries, 1);
    assert.equal(first.reused, false);
    assert.equal(second.reused, true);
    assert.equal(first.snapshot.discovery_id, second.snapshot.discovery_id);
    assert.deepEqual(
      second.snapshot.candidates.map((candidate) => candidate.acquisition_key),
      ['web:a', 'web:b'],
    );
  } finally {
    await roots.cleanup();
  }
});

test('discovery snapshot identity changes when the requested cohort changes', async () => {
  const roots = await tempRoots();
  try {
    const first = await loadOrCreateDiscoverySnapshot(
      roots.stage,
      'wikimedia-commons',
      { category: 'Advertisements', count: 100, depth: 1 },
      async () => [candidates[0]!],
    );
    const second = await loadOrCreateDiscoverySnapshot(
      roots.stage,
      'wikimedia-commons',
      { category: 'Advertisements', count: 500, depth: 1 },
      async () => [candidates[1]!],
    );

    assert.notEqual(first.snapshot.discovery_id, second.snapshot.discovery_id);
    assert.equal(second.reused, false);
  } finally {
    await roots.cleanup();
  }
});

test('discovery snapshot identity changes when the Commons rendition width changes', async () => {
  const roots = await tempRoots();
  try {
    const first = await loadOrCreateDiscoverySnapshot(
      roots.stage,
      'wikimedia-commons',
      { category: 'Advertisements', count: 100, depth: 1, rendition_width: 2400 },
      async () => [candidates[0]!],
    );
    const second = await loadOrCreateDiscoverySnapshot(
      roots.stage,
      'wikimedia-commons',
      { category: 'Advertisements', count: 100, depth: 1, rendition_width: 1600 },
      async () => [candidates[0]!],
    );

    assert.notEqual(first.snapshot.discovery_id, second.snapshot.discovery_id);
    assert.equal(second.reused, false);
  } finally {
    await roots.cleanup();
  }
});

test('staged record blob remains readable and content-addressed', async () => {
  const roots = await tempRoots();
  try {
    const bytes = jpeg('content-addressed');
    const result = await stageAcquisitionBatch({
      stage_dir: roots.stage,
      candidates: [candidates[0]!],
      fetch_fn: (async () => imageResponse(bytes)) as typeof fetch,
    });
    const record = result.records[0]!;
    assert.deepEqual(await readFile(join(roots.stage, record.storage_path)), bytes);
    assert.ok(record.asset_id.startsWith('asset_'));
  } finally {
    await roots.cleanup();
  }
});
