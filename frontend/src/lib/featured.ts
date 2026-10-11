export const FEATURED_CASE_IDS = [
  'real-a-picture-is-worth-1000-words-no-tag-line-necess-b461c1b7',
  'real-a-simple-brilliant-ad-by-land-rover-7ecb02ed',
  'real-mcdonalds-confidently-advertises-with-no-brandin-1110eb18',
  'real-wwf-horrifying-more-horrifying-23bf88a0',
  'real-durex-roasts-facebook-data-leak-cbf48adb',
  'real-kfc-hot-spicy-reimagines-fire-086bbff6',
  'real-lego-ad-651761c0',
  'real-how-to-market-an-aston-martin-53e836bf',
] as const;

export const featuredRank = (caseId: string): number => {
  const rank = FEATURED_CASE_IDS.indexOf(caseId as (typeof FEATURED_CASE_IDS)[number]);
  return rank === -1 ? Number.POSITIVE_INFINITY : rank;
};

export const isFeaturedCase = (caseId: string): boolean =>
  FEATURED_CASE_IDS.includes(caseId as (typeof FEATURED_CASE_IDS)[number]);
