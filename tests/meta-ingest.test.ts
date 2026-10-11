import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  extractImageUrlFromHtml,
  queryAdsArchive,
  type MetaAdRecord,
} from '../src/ingest/meta-ad-library.js';
import { ingestMetaAds, slugForAd } from '../src/ingest/ingest-meta-ads.js';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
}

function imageResponse(bytes: Buffer, contentType = 'image/jpeg'): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': contentType },
  });
}

function makeAdRecord(id: string, pageName: string): MetaAdRecord {
  return {
    id,
    page_id: `page_${id}`,
    page_name: pageName,
    ad_creative_bodies: [`Body for ${id}`],
    ad_creative_link_titles: [`Title for ${id}`],
    ad_creative_link_descriptions: [],
    ad_delivery_start_time: '2022-03-01',
    ad_delivery_stop_time: null,
    ad_snapshot_url: `https://www.facebook.com/ads/library/?id=${id}`,
    ad_reached_countries: ['US'],
    publisher_platforms: ['facebook'],
    languages: ['en'],
    bylines: [],
  };
}

test('extractImageUrlFromHtml finds og:image, fbcdn, or nothing', () => {
  assert.equal(
    extractImageUrlFromHtml('<meta property="og:image" content="https://x.example/a.jpg" />'),
    'https://x.example/a.jpg',
  );
  assert.equal(
    extractImageUrlFromHtml('...https://scontent.fhel1-1.fna.fbcdn.net/v/t1/img.png?...'),
    'https://scontent.fhel1-1.fna.fbcdn.net/v/t1/img.png',
  );
  assert.equal(extractImageUrlFromHtml('<html>no images</html>'), null);
});

test('slugForAd sanitizes page names and appends an id suffix', () => {
  assert.equal(slugForAd('Nike & Co.', '1099441329615398'), 'real-nike-co-615398');
  assert.equal(slugForAd('!!!', 'abc'), 'real-ad-abc');
});

test('queryAdsArchive follows pagination cursors', async () => {
  const fetchFn = (async (url: string) => {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('after')) {
      return jsonResponse({
        data: [makeAdRecord('1', 'First Page')],
        paging: { cursors: { after: 'NEXT' } },
      });
    }
    return jsonResponse({ data: [makeAdRecord('2', 'Second Page')] });
  }) as typeof fetch;

  const records = await queryAdsArchive({
    accessToken: 'token',
    searchTerms: 'x',
    maxResults: 5,
    fetchFn,
  });

  assert.equal(records.length, 2);
  assert.equal(records[0]?.id, '1');
  assert.equal(records[1]?.id, '2');
});

test('queryAdsArchive surfaces a non-OK response as an error', async () => {
  const fetchFn = (async () =>
    new Response('{"error":{"message":"bad token"}}', { status: 400 })) as typeof fetch;

  await assert.rejects(
    () => queryAdsArchive({ accessToken: 'bad', searchTerms: 'x', fetchFn }),
    /query failed \(HTTP 400\)/,
  );
});

test('ingestMetaAds writes cases with asset + manifest + provenance', async () => {
  const casesDir = await mkdtemp(join(tmpdir(), 'signum-meta-'));

  const fetchFn = (async (url: string) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'graph.facebook.com') {
      return jsonResponse({
        data: [makeAdRecord('101', 'Brand One'), makeAdRecord('102', 'Brand Two')],
      });
    }
    if (parsed.hostname === 'www.facebook.com') {
      const id = parsed.searchParams.get('id');
      return htmlResponse(`<meta property="og:image" content="https://img.example/${id}.jpg" />`);
    }
    // image download
    return imageResponse(Buffer.from(`image-bytes-${parsed.pathname}`));
  }) as typeof fetch;

  try {
    const summary = await ingestMetaAds({
      accessToken: 'token',
      searchTerms: ['test'],
      targetCount: 10,
      casesDir,
      fetchFn,
      imageFetchFn: fetchFn,
    });

    assert.equal(summary.ingested, 2);
    assert.equal(summary.skipped, 0);

    for (const slug of summary.cases.map((entry) => entry.slug)) {
      const draftStat = await stat(join(casesDir, slug, 'manifest.json'));
      const assetStat = await stat(join(casesDir, slug, 'asset.jpg'));
      assert.ok(draftStat.isFile());
      assert.ok(assetStat.isFile());

      const manifest = JSON.parse(
        await readFile(join(casesDir, slug, 'manifest.json'), 'utf8'),
      ) as {
        summary: string;
        source_url: string;
      };
      assert.ok(manifest.summary.startsWith('Title for'));
      assert.match(manifest.source_url, /facebook\.com\/ads\/library/);
    }
  } finally {
    await rm(casesDir, { recursive: true, force: true });
  }
});
