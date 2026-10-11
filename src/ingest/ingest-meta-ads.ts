import { createCaseLibrary } from '../cases/case-library.js';
import { fetchCreativeImageUrl, queryAdsArchive, type MetaAdRecord } from './meta-ad-library.js';

export interface IngestedAd {
  slug: string;
  page_name: string;
  has_image: boolean;
}

export interface IngestMetaSummary {
  ingested: number;
  skipped: number;
  cases: IngestedAd[];
}

function sanitize(value: string): string {
  const slugged = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slugged || 'ad';
}

export function slugForAd(pageName: string, id: string): string {
  const numericSuffix = id.replace(/[^0-9]/g, '').slice(-6) || id.slice(-6);
  return `real-${sanitize(pageName)}-${numericSuffix}`;
}

function summarize(record: MetaAdRecord): string {
  return (
    record.ad_creative_link_titles[0] ??
    record.ad_creative_bodies[0] ??
    `${record.page_name} advertisement`
  );
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function fileExtension(imageUrl: string, response: Response): string {
  const urlExtension = imageUrl.match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
  if (urlExtension?.[1]) {
    return `.${urlExtension[1].toLowerCase() === 'jpeg' ? 'jpg' : urlExtension[1].toLowerCase()}`;
  }
  const contentType = response.headers.get('content-type') ?? '';
  for (const [mime, extension] of Object.entries(EXT_BY_MIME)) {
    if (contentType.startsWith(mime)) return extension;
  }
  return '.jpg';
}

export interface IngestMetaAdsOptions {
  accessToken: string;
  searchTerms: string[];
  targetCount?: number;
  casesDir?: string;
  fetchFn?: typeof fetch;
  imageFetchFn?: typeof fetch;
  log?: (message: string) => void;
}

/**
 * Pull recent ads from the Meta Ad Library across the given search terms and
 * write each as a Pending Case with its Asset and source metadata. The ad copy
 * and snapshot URL are provenance; Decoding happens later.
 */
export async function ingestMetaAds(options: IngestMetaAdsOptions): Promise<IngestMetaSummary> {
  const targetCount = options.targetCount ?? 50;
  const casesDir = options.casesDir ?? 'cases';
  const fetchImpl = options.fetchFn ?? globalThis.fetch;
  const imageFetch = options.imageFetchFn ?? globalThis.fetch;
  const log = options.log ?? (() => {});
  const library = createCaseLibrary(casesDir);

  const seenIds = new Set<string>();
  const ingested: IngestedAd[] = [];
  let skipped = 0;

  for (const term of options.searchTerms) {
    if (ingested.length >= targetCount) break;

    const records = await queryAdsArchive({
      accessToken: options.accessToken,
      searchTerms: term,
      maxResults: 40,
      fetchFn: fetchImpl,
    });

    for (const record of records) {
      if (ingested.length >= targetCount) break;
      if (seenIds.has(record.id)) continue;
      seenIds.add(record.id);

      const imageUrl = await fetchCreativeImageUrl(record.ad_snapshot_url, imageFetch);
      if (imageUrl === null) {
        skipped += 1;
        continue;
      }

      const imageResponse = await imageFetch(imageUrl);
      if (!imageResponse.ok) {
        skipped += 1;
        continue;
      }
      const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
      const extension = fileExtension(imageUrl, imageResponse);
      const slug = slugForAd(record.page_name, record.id);

      await library.admitPendingCase({
        case_id: slug,
        image_buffer: imageBuffer,
        extension,
        summary: summarize(record),
        source_url: record.ad_snapshot_url,
      });

      ingested.push({ slug, page_name: record.page_name, has_image: true });
      log(`ingested ${slug} (${record.page_name})`);
    }
  }

  return { ingested: ingested.length, skipped, cases: ingested };
}
