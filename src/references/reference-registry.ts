import type { CatalogReferenceType, ReferenceCatalog } from '../contracts/decode-draft-v1.js';

const CATALOG_REFERENCE_TYPES: readonly CatalogReferenceType[] = [
  'glossary_concept',
  'ontology_class',
  'persuasion_technique',
  'emotional_lever',
  'cultural_code',
];

export interface ReferenceRegistry {
  /**
   * DESIGN NOTE: ReferenceRegistry is a replaceable interface.
   * Validation depends on this interface rather than concrete registries.
   * This keeps reference lookup replaceable without changing validation call sites.
   * See: docs/design-notes/registry-interface.md
   */
  canonicalize(referenceType: CatalogReferenceType, referenceValue: string): string | null;
}

export function createReferenceRegistry(catalog: ReferenceCatalog = {}): ReferenceRegistry {
  const knownValues = new Map<CatalogReferenceType, ReadonlySet<string>>();

  for (const referenceType of CATALOG_REFERENCE_TYPES) {
    knownValues.set(referenceType, new Set(catalog[referenceType] ?? []));
  }

  return {
    canonicalize(referenceType, referenceValue) {
      return knownValues.get(referenceType)?.has(referenceValue) === true ? referenceValue : null;
    },
  };
}
