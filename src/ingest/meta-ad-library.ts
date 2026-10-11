/**
 * Client for the Meta Ad Library API (`ads_archive`).
 *
 * Retrieves public ad records (advertiser, dates, regions, creative text,
 * snapshot URL) for recent ads. The creative *image* is not part of the basic
 * archive response; it is resolved separately from the snapshot page.
 */

export interface MetaAdRecord {
  id: string;
  page_id: string;
  page_name: string;
  ad_creative_bodies: string[];
  ad_creative_link_titles: string[];
  ad_creative_link_descriptions: string[];
  ad_delivery_start_time: string | null;
  ad_delivery_stop_time: string | null;
  ad_snapshot_url: string;
  ad_reached_countries: string[];
  publisher_platforms: string[];
  languages: string[];
  bylines: string[];
}

interface AdsArchivePage {
  data?: MetaAdRecord[];
  paging?: { cursors?: { after?: string }; next?: string };
}

const GRAPH_VERSION = 'v19.0';
const ADS_ARCHIVE_URL = `https://graph.facebook.com/${GRAPH_VERSION}/ads_archive`;

const ADS_ARCHIVE_FIELDS = [
  'id',
  'page_id',
  'page_name',
  'ad_creative_bodies',
  'ad_creative_link_titles',
  'ad_creative_link_descriptions',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'ad_snapshot_url',
  'ad_reached_countries',
  'publisher_platforms',
  'languages',
  'bylines',
].join(',');

export interface QueryAdsArchiveOptions {
  accessToken: string;
  searchTerms: string;
  adReachedCountries?: string[];
  /** Ads delivered on or after this date, e.g. "2015-01-01". */
  dateMin?: string;
  maxResults?: number;
  fetchFn?: typeof fetch;
}

/**
 * Query the ads archive, following pagination cursors, up to `maxResults`
 * records for a single search term.
 */
export async function queryAdsArchive(options: QueryAdsArchiveOptions): Promise<MetaAdRecord[]> {
  const fetchImpl = options.fetchFn ?? globalThis.fetch;
  const countries = options.adReachedCountries ?? ['US'];
  const dateMin = options.dateMin ?? '2015-01-01';
  const maxResults = options.maxResults ?? 25;

  const records: MetaAdRecord[] = [];
  let after: string | undefined;

  while (records.length < maxResults) {
    const params = new URLSearchParams({
      access_token: options.accessToken,
      search_terms: options.searchTerms,
      ad_reached_countries: JSON.stringify(countries),
      ad_delivery_date_min: dateMin,
      fields: ADS_ARCHIVE_FIELDS,
      limit: String(Math.min(100, maxResults - records.length)),
    });
    if (after !== undefined) params.set('after', after);

    const response = await fetchImpl(`${ADS_ARCHIVE_URL}?${params.toString()}`);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Meta Ad Library query failed (HTTP ${response.status}): ${body.slice(0, 300)}`,
      );
    }

    const page = (await response.json()) as AdsArchivePage;
    records.push(...(page.data ?? []));
    after = page.paging?.cursors?.after;
    if (after === undefined) break;
  }

  return records.slice(0, maxResults);
}

function stripQuery(url: string): string {
  const index = url.search(/[?#]/);
  return index === -1 ? url : url.slice(0, index);
}

/**
 * Extract a likely creative-image URL from an Ad Library snapshot page. The
 * snapshot HTML carries the image in an `og:image` meta tag or as an
 * `scontent*.fbcdn.net` CDN URL. Query strings are stripped so the URL can be
 * downloaded directly.
 */
export function extractImageUrlFromHtml(html: string): string | null {
  const ogImage =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (ogImage?.[1]) return stripQuery(ogImage[1]);

  const cdn = html.match(/https?:\/\/[^"'\s]+\.fbcdn\.net[^"'\s]+/i);
  return cdn?.[0] ? stripQuery(cdn[0]) : null;
}

/**
 * Fetch an ad's snapshot page and return the creative image URL, or `null` if
 * none can be resolved. Best-effort: never throws on network/parse failure.
 */
export async function fetchCreativeImageUrl(
  snapshotUrl: string,
  fetchFn?: typeof fetch,
): Promise<string | null> {
  const fetchImpl = fetchFn ?? globalThis.fetch;
  try {
    const response = await fetchImpl(snapshotUrl);
    if (!response.ok) return null;
    return extractImageUrlFromHtml(await response.text());
  } catch {
    return null;
  }
}
