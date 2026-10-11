import type { MetadataCertainty, TemporalExtent } from './corpus-records.js';

export interface CuratedBrandFact {
  readonly brand_id: string;
  readonly canonical_name: string;
  readonly aliases: readonly string[];
  readonly certainty: MetadataCertainty;
  readonly source_refs: readonly string[];
}

export interface CuratedTemporalFact {
  readonly temporal: TemporalExtent;
  readonly certainty: MetadataCertainty;
  readonly source_refs: readonly string[];
}

export interface CuratedCorpusMetadata {
  readonly brand: CuratedBrandFact | null;
  readonly temporal: CuratedTemporalFact | null;
}

const EMPTY: CuratedCorpusMetadata = { brand: null, temporal: null };

const year = (value: number): TemporalExtent => ({
  start_year: value,
  end_year: value,
  precision: 'year',
  start_date: null,
  end_date: null,
});

const CURATED_BY_LEGACY_CASE: Readonly<Record<string, CuratedCorpusMetadata>> = {
  'real-a-picture-is-worth-1000-words-no-tag-line-necess-b461c1b7': {
    brand: {
      brand_id: 'brand_tabasco',
      canonical_name: 'TABASCO',
      aliases: ['Tabasco'],
      certainty: 'confirmed',
      source_refs: ['legacy-case:real-a-picture-is-worth-1000-words-no-tag-line-necess-b461c1b7'],
    },
    temporal: null,
  },
  'real-a-simple-brilliant-ad-by-land-rover-7ecb02ed': {
    brand: {
      brand_id: 'brand_land_rover',
      canonical_name: 'Land Rover',
      aliases: [],
      certainty: 'confirmed',
      source_refs: ['legacy-case:real-a-simple-brilliant-ad-by-land-rover-7ecb02ed'],
    },
    temporal: {
      temporal: year(2011),
      certainty: 'confirmed',
      source_refs: [
        'https://www.campaignlive.com/article/land-rover-defender-passport-rkcr-y-r/1067996',
      ],
    },
  },
  'real-mcdonalds-confidently-advertises-with-no-brandin-1110eb18': {
    brand: {
      brand_id: 'brand_mcdonalds',
      canonical_name: 'McDonald’s',
      aliases: ["McDonald's", 'McDonalds'],
      certainty: 'confirmed',
      source_refs: ['legacy-case:real-mcdonalds-confidently-advertises-with-no-brandin-1110eb18'],
    },
    temporal: null,
  },
  'real-wwf-horrifying-more-horrifying-23bf88a0': {
    brand: {
      brand_id: 'brand_wwf',
      canonical_name: 'WWF',
      aliases: ['World Wide Fund for Nature'],
      certainty: 'confirmed',
      source_refs: ['legacy-case:real-wwf-horrifying-more-horrifying-23bf88a0'],
    },
    temporal: {
      temporal: year(2010),
      certainty: 'confirmed',
      source_refs: ['https://www.commarts.com/exhibit/wwf-print-campaign'],
    },
  },
  'real-durex-roasts-facebook-data-leak-cbf48adb': {
    brand: {
      brand_id: 'brand_durex',
      canonical_name: 'Durex',
      aliases: [],
      certainty: 'confirmed',
      source_refs: ['legacy-case:real-durex-roasts-facebook-data-leak-cbf48adb'],
    },
    temporal: {
      temporal: year(2018),
      certainty: 'confirmed',
      source_refs: [
        'https://www.rvcj.com/durex-trolled-facebook-in-its-latest-ad-people-are-loving-the-creativity/',
      ],
    },
  },
  'real-kfc-hot-spicy-reimagines-fire-086bbff6': {
    brand: {
      brand_id: 'brand_kfc',
      canonical_name: 'KFC',
      aliases: ['Kentucky Fried Chicken'],
      certainty: 'confirmed',
      source_refs: ['legacy-case:real-kfc-hot-spicy-reimagines-fire-086bbff6'],
    },
    temporal: {
      temporal: year(2018),
      certainty: 'confirmed',
      source_refs: [
        'https://www.dpreview.com/news/3570669105/viral-kfc-ad-campaign-turns-fried-chicken-into-flames-with-photoshop',
      ],
    },
  },
  'real-lego-ad-651761c0': {
    brand: {
      brand_id: 'brand_lego',
      canonical_name: 'LEGO',
      aliases: ['Lego'],
      certainty: 'confirmed',
      source_refs: ['legacy-case:real-lego-ad-651761c0'],
    },
    temporal: null,
  },
};

export function curatedCorpusMetadata(caseId: string): CuratedCorpusMetadata {
  return CURATED_BY_LEGACY_CASE[caseId] ?? EMPTY;
}
