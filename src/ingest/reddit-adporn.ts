import { createHash } from 'node:crypto';

import { createCaseLibrary } from '../cases/case-library.js';

export interface AdPornPost {
  title: string;
  url: string;
  image: string | null;
  permalink: string;
  score?: number | null;
}

export interface IngestAdPornSummary {
  ingested: number;
  skipped: number;
  cases: Array<{ slug: string; title: string }>;
}

function sanitize(value: string): string {
  const slugged = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slugged || 'ad';
}

/** Strip "[NSFW]" and "[720x960]" dimension tags from a post title. */
export function cleanTitle(title: string): string {
  return title
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugForAdPost(title: string, permalink: string): string {
  const hash = createHash('sha256').update(permalink).digest('hex').slice(0, 8);
  return `real-${sanitize(cleanTitle(title)).slice(0, 48)}-${hash}`;
}

/** Prefer a direct image URL; fall back to Reddit's preview thumbnail. */
export function bestImageUrl(post: AdPornPost): string | null {
  if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(post.url)) return post.url;
  return post.image;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function fileExtension(url: string, response: Response): string {
  const match = url.match(/\.(jpe?g|png|webp|gif)(\?|$)/i);
  if (match?.[1]) {
    return `.${match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()}`;
  }
  const contentType = response.headers.get('content-type') ?? '';
  for (const [mime, extension] of Object.entries(EXT_BY_MIME)) {
    if (contentType.startsWith(mime)) return extension;
  }
  return '.jpg';
}

export interface IngestAdPornOptions {
  posts: AdPornPost[];
  casesDir?: string;
  fetchFn?: typeof fetch;
  log?: (message: string) => void;
}

/**
 * Download ad images from r/AdPorn posts and admit each as a Pending Case.
 * The post title and permalink are source provenance; Decoding happens later.
 */
export async function ingestAdPornPosts(
  options: IngestAdPornOptions,
): Promise<IngestAdPornSummary> {
  const casesDir = options.casesDir ?? 'cases';
  const fetchImpl = options.fetchFn ?? globalThis.fetch;
  const log = options.log ?? (() => {});
  const library = createCaseLibrary(casesDir);

  const ingested: IngestAdPornSummary['cases'] = [];
  let skipped = 0;

  for (const post of options.posts) {
    const imageUrl = bestImageUrl(post);
    if (imageUrl === null) {
      skipped += 1;
      continue;
    }

    let response: Response;
    try {
      response = await fetchImpl(imageUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        },
      });
    } catch {
      skipped += 1;
      continue;
    }
    if (!response.ok) {
      skipped += 1;
      continue;
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const extension = fileExtension(imageUrl, response);
    const slug = slugForAdPost(post.title, post.permalink);

    await library.admitPendingCase({
      case_id: slug,
      image_buffer: imageBuffer,
      extension,
      summary: cleanTitle(post.title),
      source_url: `https://reddit.com${post.permalink}`,
    });

    ingested.push({ slug, title: cleanTitle(post.title) });
    log(`ingested ${slug}`);
  }

  return { ingested: ingested.length, skipped, cases: ingested };
}
