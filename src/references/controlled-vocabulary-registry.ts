import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { CatalogReferenceType } from '../contracts/decode-draft-v1.js';
import type { ReferenceRegistry } from './reference-registry.js';

export const CONTROLLED_VOCABULARY_REFERENCE_TYPES = [
  'glossary_concept',
  'ontology_class',
  'persuasion_technique',
  'emotional_lever',
  'cultural_code',
] as const;

export interface ControlledVocabularySnapshot {
  glossary_concept?: readonly string[];
  ontology_class?: readonly string[];
  persuasion_technique?: readonly string[];
  emotional_lever?: readonly string[];
  cultural_code?: readonly string[];
}

export const CONTROLLED_VOCABULARY_SOURCE_PATH = resolve(
  process.cwd(),
  'src/reference-vocabulary/controlled-vocabulary.v1.json',
);

function readControlledVocabularySnapshot(
  sourcePath: string = CONTROLLED_VOCABULARY_SOURCE_PATH,
): ControlledVocabularySnapshot {
  const contents = readFileSync(sourcePath, 'utf8');
  return JSON.parse(contents) as ControlledVocabularySnapshot;
}

/**
 * Single source of truth for the controlled vocabulary default.
 *
 * The canonical vocabulary file lives at
 * `src/reference-vocabulary/controlled-vocabulary.v1.json`. Production code
 * and tests both read that file, so the default registry stays aligned with the
 * canonical snapshot without embedding a second literal copy in source.
 */
export const DEFAULT_CONTROLLED_VOCABULARY_SNAPSHOT: ControlledVocabularySnapshot =
  readControlledVocabularySnapshot();

function isControlledVocabularyType(
  referenceType: CatalogReferenceType,
): referenceType is (typeof CONTROLLED_VOCABULARY_REFERENCE_TYPES)[number] {
  return CONTROLLED_VOCABULARY_REFERENCE_TYPES.includes(referenceType);
}

/**
 * DESIGN NOTE: This registry is backed by the canonical controlled vocabulary
 * snapshot file. It resolves known IDs from that shared read-only source.
 * Unknown IDs return unresolved/null. This will be replaced by a full
 * vocabulary import in a later phase.
 * See: docs/design-notes/controlled-vocabulary-registry.md
 */
export function createControlledVocabularyRegistry(
  snapshot: ControlledVocabularySnapshot = DEFAULT_CONTROLLED_VOCABULARY_SNAPSHOT,
): ReferenceRegistry {
  const values = new Map<CatalogReferenceType, ReadonlySet<string>>();

  for (const referenceType of CONTROLLED_VOCABULARY_REFERENCE_TYPES) {
    values.set(referenceType, new Set(snapshot[referenceType] ?? []));
  }

  return {
    canonicalize(referenceType, referenceValue) {
      if (!isControlledVocabularyType(referenceType)) {
        return null;
      }
      return values.get(referenceType)?.has(referenceValue) === true ? referenceValue : null;
    },
  };
}
