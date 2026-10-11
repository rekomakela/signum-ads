import {
  curatedCorpusMetadata,
  type CuratedCorpusMetadata,
} from '../corpus/curated-corpus-metadata.js';
import type { TemporalExtent } from '../corpus/corpus-records.js';

export interface ArchiveEditorialMetadata {
  readonly brand: string | null;
  readonly year_label: string | null;
  readonly analytical_title: string | null;
  readonly analytical_deck: string | null;
}

export interface ArchiveEditorialCopy {
  readonly analytical_title: string;
  readonly analytical_deck: string;
}

const EDITORIAL_COPY_BY_CASE: Readonly<Record<string, ArchiveEditorialCopy>> = {
  'real-a-picture-is-worth-1000-words-no-tag-line-necess-b461c1b7': {
    analytical_title: 'Making everyday food feel unexpected',
    analytical_deck:
      'An ordinary food becomes a stage for experimentation, making the sauce feel like a simple way to transform everyday eating.',
  },
  'real-a-simple-brilliant-ad-by-land-rover-7ecb02ed': {
    analytical_title: 'Adventure encoded in a passport',
    analytical_deck:
      'Passport stamps turn travel itself into the shape of the Defender, making the vehicle a symbol of mobility, independence, and global exploration.',
  },
  'real-mcdonalds-confidently-advertises-with-no-brandin-1110eb18': {
    analytical_title: 'Branding without showing the brand',
    analytical_deck:
      'Product recognition, colour, and appetite appeal make explicit branding unnecessary—the fries are expected to identify McDonald’s on their own.',
  },
  'real-wwf-horrifying-more-horrifying-23bf88a0': {
    analytical_title: 'When absence becomes more frightening',
    analytical_deck:
      'The campaign reverses fear: an animal that seems threatening becomes less frightening than the ecological emptiness created by its disappearance.',
  },
  'real-durex-roasts-facebook-data-leak-cbf48adb': {
    analytical_title: 'Turning a data leak into product proof',
    analytical_deck:
      'A topical joke turns Facebook’s data leak into a product promise, making reliability memorable through cultural timing.',
  },
  'real-kfc-hot-spicy-reimagines-fire-086bbff6': {
    analytical_title: 'Turning heat into spectacle',
    analytical_deck:
      'Fried chicken replaces literal fire, translating spiciness into speed, heat, and spectacle.',
  },
  'real-lego-ad-651761c0': {
    analytical_title: 'Making imagination feel tangible',
    analytical_deck:
      'A whale emerging from a book turns imagination into something physical, positioning LEGO as a bridge from reading to creative play.',
  },
};

export function archiveEditorialCopy(caseId: string): ArchiveEditorialCopy | null {
  return EDITORIAL_COPY_BY_CASE[caseId] ?? null;
}

export function formatTemporalLabel(temporal: TemporalExtent | null): string | null {
  if (temporal === null || temporal.precision === 'unknown') return null;
  if (temporal.precision === 'exact_date' || temporal.precision === 'month') {
    return (
      temporal.start_date ?? (temporal.start_year === null ? null : String(temporal.start_year))
    );
  }
  if (temporal.start_year === null) return null;
  if (temporal.precision === 'circa_year') return `c. ${temporal.start_year}`;
  if (temporal.precision === 'decade') return `${temporal.start_year}s`;
  if (
    temporal.precision === 'range' &&
    temporal.end_year !== null &&
    temporal.end_year !== temporal.start_year
  ) {
    return `${temporal.start_year}–${temporal.end_year}`;
  }
  return String(temporal.start_year);
}

function corpusContext(
  metadata: CuratedCorpusMetadata,
): Pick<ArchiveEditorialMetadata, 'brand' | 'year_label'> {
  return {
    brand: metadata.brand?.canonical_name ?? null,
    year_label: formatTemporalLabel(metadata.temporal?.temporal ?? null),
  };
}

export function archiveEditorialMetadata(caseId: string): ArchiveEditorialMetadata {
  const context = corpusContext(curatedCorpusMetadata(caseId));
  const copy = archiveEditorialCopy(caseId);
  return {
    ...context,
    analytical_title: copy?.analytical_title ?? null,
    analytical_deck: copy?.analytical_deck ?? null,
  };
}
