import data from './signum-glossary-data.json';

export type GlossaryDomain = 'Semiotics' | 'Persuasion' | 'Emotion' | 'Culture' | 'System';

export interface SignumGlossaryCatalogEntry {
  readonly id: string;
  readonly label: string;
  readonly slug: string;
  readonly domain: GlossaryDomain;
  readonly ontology_ref: { readonly class: string | null };
  readonly definition: string;
  readonly plain_language: string;
  readonly why_it_matters: string;
  readonly how_to_spot: readonly string[];
  readonly related_terms: readonly string[];
  readonly scope_note: string;
  readonly common_misreadings: readonly string[];
  readonly reviewed_at: string | null;
  readonly source_references: readonly unknown[];
}

export interface SignumGlossaryCatalog {
  readonly schema_version: string;
  readonly source: string;
  readonly sources?: readonly string[];
  readonly aliases: Readonly<Record<string, string>>;
  readonly entries: readonly SignumGlossaryCatalogEntry[];
}

/**
 * Build-time generated glossary catalog. Produced by
 * `tools/signum-knowledge/generate_glossary_catalog.py` from the base glossary plus
 * the reviewed editorial refresh layer (via `npm run glossary:data`). No YAML is
 * parsed at runtime; the frontend only imports the generated JSON.
 */
export const signumGlossaryCatalog = data as unknown as SignumGlossaryCatalog;
