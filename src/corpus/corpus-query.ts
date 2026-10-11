import type {
  AdvertisementRecord,
  BrandRecord,
  CorpusConceptFamily,
  DecodeRevisionRecord,
  ProductRecord,
  TemporalExtent,
} from './corpus-records.js';
import type { CorpusStore } from './corpus-store.js';

export interface CorpusQueryIndex {
  readonly advertisements: readonly AdvertisementRecord[];
  readonly brands: ReadonlyMap<string, BrandRecord>;
  readonly products: ReadonlyMap<string, ProductRecord>;
  readonly revisions: readonly DecodeRevisionRecord[];
  readonly revisions_by_advertisement: ReadonlyMap<string, readonly DecodeRevisionRecord[]>;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

export function temporalContainsYear(temporal: TemporalExtent, year: number): boolean {
  if (temporal.precision === 'unknown') return false;
  if (temporal.start_year === null || temporal.end_year === null) return false;
  return year >= temporal.start_year && year <= temporal.end_year;
}

export async function buildCorpusQueryIndex(store: CorpusStore): Promise<CorpusQueryIndex> {
  const [advertisements, brands, products, revisions] = await Promise.all([
    store.listAdvertisements(),
    store.listBrands(),
    store.listProducts(),
    store.listDecodeRevisions(),
  ]);
  const revisionsByAdvertisement = new Map<string, DecodeRevisionRecord[]>();
  for (const revision of revisions) {
    const items = revisionsByAdvertisement.get(revision.advertisement_id) ?? [];
    items.push(revision);
    revisionsByAdvertisement.set(revision.advertisement_id, items);
  }
  return {
    advertisements,
    brands: new Map(brands.map((brand) => [brand.brand_id, brand])),
    products: new Map(products.map((product) => [product.product_id, product])),
    revisions,
    revisions_by_advertisement: revisionsByAdvertisement,
  };
}

export function resolveBrandByName(
  index: CorpusQueryIndex,
  nameOrAlias: string,
): BrandRecord | null {
  const needle = normalizeName(nameOrAlias);
  for (const brand of index.brands.values()) {
    if (
      normalizeName(brand.canonical_name) === needle ||
      brand.aliases.some((alias) => normalizeName(alias) === needle)
    ) {
      return brand;
    }
  }
  return null;
}

function revisionsUseConcept(
  revisions: readonly DecodeRevisionRecord[],
  conceptId: string,
  family?: CorpusConceptFamily,
): boolean {
  return revisions.some((revision) =>
    revision.interpretations.some((interpretation) =>
      interpretation.concept_refs.some(
        (reference) =>
          reference.concept_id === conceptId &&
          (family === undefined || reference.family === family),
      ),
    ),
  );
}

export function queryBrandByTime(
  index: CorpusQueryIndex,
  brandId: string,
  year?: number,
): AdvertisementRecord[] {
  return index.advertisements.filter(
    (advertisement) =>
      advertisement.brand_ids.includes(brandId) &&
      (year === undefined || temporalContainsYear(advertisement.temporal, year)),
  );
}

export function queryConceptByTime(
  index: CorpusQueryIndex,
  conceptId: string,
  year?: number,
): AdvertisementRecord[] {
  return index.advertisements.filter((advertisement) => {
    if (year !== undefined && !temporalContainsYear(advertisement.temporal, year)) return false;
    return revisionsUseConcept(
      index.revisions_by_advertisement.get(advertisement.advertisement_id) ?? [],
      conceptId,
    );
  });
}

export function queryBrandByMeaningMechanism(
  index: CorpusQueryIndex,
  brandId: string,
  mechanismId: string,
): AdvertisementRecord[] {
  return index.advertisements.filter((advertisement) => {
    if (!advertisement.brand_ids.includes(brandId)) return false;
    return revisionsUseConcept(
      index.revisions_by_advertisement.get(advertisement.advertisement_id) ?? [],
      mechanismId,
      'MeaningMechanism',
    );
  });
}

export function queryProductCategoryByCulturalCode(
  index: CorpusQueryIndex,
  categoryId: string,
  culturalCodeId: string,
): AdvertisementRecord[] {
  return index.advertisements.filter((advertisement) => {
    const matchesCategory = advertisement.product_ids.some((productId) =>
      index.products.get(productId)?.category_ids.includes(categoryId),
    );
    if (!matchesCategory) return false;
    return revisionsUseConcept(
      index.revisions_by_advertisement.get(advertisement.advertisement_id) ?? [],
      culturalCodeId,
      'CulturalCode',
    );
  });
}
