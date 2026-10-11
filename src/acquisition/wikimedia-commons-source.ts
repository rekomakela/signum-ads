import { setTimeout as sleep } from 'node:timers/promises';

import type { AcquisitionCandidate } from './acquisition-staging.js';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const USER_AGENT =
  'SignumDecoder/0.1 (https://github.com/rekomakela/signum-ads; archival research)';

interface CommonsCategoryMember {
  readonly pageid: number;
  readonly ns: number;
  readonly title: string;
}

interface CommonsSubcategoryResponse {
  readonly query?: { readonly categorymembers?: CommonsCategoryMember[] };
}

interface CommonsImageInfo {
  readonly url?: string;
  readonly thumburl?: string;
  readonly descriptionurl?: string;
  readonly mime?: string;
}

interface CommonsPage {
  readonly pageid?: number;
  readonly ns?: number;
  readonly title?: string;
  readonly imageinfo?: CommonsImageInfo[];
}

interface CommonsGeneratedResponse {
  readonly continue?: { readonly gcmcontinue?: string };
  readonly query?: { readonly pages?: Record<string, CommonsPage> };
}

export interface FetchWikimediaCommonsOptions {
  readonly count?: number;
  readonly category?: string;
  readonly max_depth?: number;
  readonly rendition_width?: number;
  readonly fetch_fn?: typeof fetch;
}

interface CategoryQueueItem {
  readonly title: string;
  readonly depth: number;
}

function categoryTitle(value: string): string {
  return value.startsWith('Category:') ? value : `Category:${value}`;
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 10_000);
  return Math.min(500 * 2 ** attempt, 4000);
}

async function fetchJson<T>(url: URL, fetchImpl: typeof fetch): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT } });
    if (response.ok) return (await response.json()) as T;
    if ((response.status === 429 || response.status === 503) && attempt < 3) {
      await sleep(retryDelayMs(response, attempt));
      continue;
    }
    throw new Error(`Wikimedia Commons query failed with HTTP ${response.status}.`);
  }
  throw new Error('Wikimedia Commons query retry budget exhausted.');
}

async function listSubcategories(
  title: string,
  fetchImpl: typeof fetch,
): Promise<CommonsCategoryMember[]> {
  const url = new URL(COMMONS_API);
  url.searchParams.set('action', 'query');
  url.searchParams.set('format', 'json');
  url.searchParams.set('list', 'categorymembers');
  url.searchParams.set('cmtitle', title);
  url.searchParams.set('cmtype', 'subcat');
  url.searchParams.set('cmlimit', '500');
  const page = await fetchJson<CommonsSubcategoryResponse>(url, fetchImpl);
  return page.query?.categorymembers ?? [];
}

function candidateFromPage(page: CommonsPage): AcquisitionCandidate | null {
  const pageId = page.pageid;
  const title = page.title;
  const image = page.imageinfo?.[0];
  if (
    pageId === undefined ||
    title === undefined ||
    (image?.thumburl === undefined && image?.url === undefined) ||
    image.mime === undefined ||
    !SUPPORTED_MIME.has(image.mime)
  ) {
    return null;
  }
  return {
    acquisition_key: `commons:${pageId}`,
    acquisition_kind: 'web',
    asset_url: image.thumburl ?? image.url!,
    source_url:
      image.descriptionurl ??
      `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
    source_title: title.replace(/^File:/, ''),
  };
}

async function collectCategoryFiles(
  title: string,
  remaining: number,
  fetchImpl: typeof fetch,
  seenPageIds: Set<number>,
  renditionWidth: number,
): Promise<AcquisitionCandidate[]> {
  const candidates: AcquisitionCandidate[] = [];
  let continuation: string | null = null;

  while (candidates.length < remaining) {
    const url = new URL(COMMONS_API);
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('generator', 'categorymembers');
    url.searchParams.set('gcmtitle', title);
    url.searchParams.set('gcmtype', 'file');
    url.searchParams.set('gcmlimit', String(Math.min(100, Math.max(25, remaining * 2))));
    url.searchParams.set('prop', 'imageinfo');
    url.searchParams.set('iiprop', 'url|mime');
    url.searchParams.set('iiurlwidth', String(renditionWidth));
    if (continuation !== null) url.searchParams.set('gcmcontinue', continuation);

    const response = await fetchJson<CommonsGeneratedResponse>(url, fetchImpl);
    const pages = Object.values(response.query?.pages ?? {}).sort(
      (left, right) => (left.pageid ?? 0) - (right.pageid ?? 0),
    );
    for (const page of pages) {
      if (candidates.length >= remaining) break;
      if (page.pageid === undefined || seenPageIds.has(page.pageid)) continue;
      seenPageIds.add(page.pageid);
      const candidate = candidateFromPage(page);
      if (candidate !== null) candidates.push(candidate);
    }

    continuation = response.continue?.gcmcontinue ?? null;
    if (continuation === null || pages.length === 0) break;
  }
  return candidates;
}

export async function fetchWikimediaCommonsCandidates(
  options: FetchWikimediaCommonsOptions = {},
): Promise<AcquisitionCandidate[]> {
  const targetCount = options.count ?? 500;
  const maxDepth = options.max_depth ?? 1;
  const renditionWidth = options.rendition_width ?? 1600;
  if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 10_000) {
    throw new Error('Wikimedia Commons acquisition count must be an integer between 1 and 10000.');
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 5) {
    throw new Error('Wikimedia Commons max_depth must be an integer between 0 and 5.');
  }
  if (!Number.isInteger(renditionWidth) || renditionWidth < 320 || renditionWidth > 2400) {
    throw new Error('Wikimedia Commons rendition_width must be an integer between 320 and 2400.');
  }

  const fetchImpl = options.fetch_fn ?? globalThis.fetch;
  const queue: CategoryQueueItem[] = [
    { title: categoryTitle(options.category ?? 'Advertisements by newspaper'), depth: 0 },
  ];
  const seenCategories = new Set<string>();
  const seenPageIds = new Set<number>();
  const candidates: AcquisitionCandidate[] = [];

  while (queue.length > 0 && candidates.length < targetCount) {
    const current = queue.shift()!;
    if (seenCategories.has(current.title)) continue;
    seenCategories.add(current.title);

    candidates.push(
      ...(await collectCategoryFiles(
        current.title,
        targetCount - candidates.length,
        fetchImpl,
        seenPageIds,
        renditionWidth,
      )),
    );
    if (candidates.length >= targetCount || current.depth >= maxDepth) continue;

    const subcategories = await listSubcategories(current.title, fetchImpl);
    for (const member of subcategories) {
      if (member.ns === 14 && !seenCategories.has(member.title)) {
        queue.push({ title: member.title, depth: current.depth + 1 });
      }
    }
  }

  return candidates;
}
