import type { SignumClaim, SignumObservation, SignumWorkbenchCase } from '$lib/types';
import {
  signumGlossaryCatalog,
  type SignumGlossaryCatalogEntry,
} from '$lib/generated/signum-glossary-data';

export type DeconstructionLayer = 'raw' | 'signifiers' | 'signifieds' | 'referents' | 'ideology';

export interface SignumGlossaryEntry {
  id: string;
  label: string;
  domain: 'Semiotics' | 'Persuasion' | 'Emotion' | 'Culture' | 'System';
  definition: string;
  plain_language: string;
  why_it_matters: string;
  how_to_spot: readonly string[];
  related_terms: readonly string[];
  scope_note: string;
  common_misreadings: readonly string[];
  reviewed_at: string | null;
  case_ids: readonly string[];
}

/**
 * Learner-facing definitions come from the build-time generated glossary catalog.
 * The base glossary is layered with the reviewed editorial refresh before generation;
 * no definitions are hardcoded here and no YAML is parsed at runtime.
 */
const CATALOG_BY_ID: ReadonlyMap<string, SignumGlossaryCatalogEntry> = new Map(
  signumGlossaryCatalog.entries.map((entry) => [entry.id, entry]),
);

export function resolveGlossaryConceptId(id: string): string {
  return signumGlossaryCatalog.aliases[id] ?? id;
}

function resolveCatalogEntry(id: string): SignumGlossaryCatalogEntry | undefined {
  return CATALOG_BY_ID.get(resolveGlossaryConceptId(id));
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

type GlossaryDefinition = Pick<
  SignumGlossaryEntry,
  | 'domain'
  | 'definition'
  | 'plain_language'
  | 'why_it_matters'
  | 'how_to_spot'
  | 'related_terms'
  | 'scope_note'
  | 'common_misreadings'
  | 'reviewed_at'
>;

function fallbackEntry(id: string, domain: SignumGlossaryEntry['domain']): GlossaryDefinition {
  return {
    domain,
    definition: `${humanize(id)} is a supported Signum reference used to classify part of an advertisement deconstruction.`,
    plain_language: '',
    why_it_matters: 'It keeps the analytical vocabulary explicit and inspectable.',
    how_to_spot: ['Inspect the interpretations and evidence links where this reference is used.'],
    related_terms: [],
    scope_note: '',
    common_misreadings: [],
    reviewed_at: null,
  };
}

function domainForReference(referenceType: string): SignumGlossaryEntry['domain'] {
  if (referenceType === 'persuasion_technique') return 'Persuasion';
  if (referenceType === 'emotional_lever') return 'Emotion';
  if (referenceType === 'cultural_code') return 'Culture';
  if (referenceType === 'ontology_class') return 'System';
  return 'Semiotics';
}

function definitionFromCatalog(entry: SignumGlossaryCatalogEntry): GlossaryDefinition {
  return {
    domain: entry.domain,
    definition: entry.definition,
    plain_language: entry.plain_language,
    why_it_matters: entry.why_it_matters,
    how_to_spot: entry.how_to_spot,
    related_terms: entry.related_terms,
    scope_note: entry.scope_note,
    common_misreadings: entry.common_misreadings,
    reviewed_at: entry.reviewed_at,
  };
}

export function claimsForObservation(
  caseData: SignumWorkbenchCase,
  observation: SignumObservation,
): readonly SignumClaim[] {
  return caseData.claims.filter((claim) =>
    claim.evidence_refs.some((reference) => reference.ref === observation.ref),
  );
}

export function conceptIdsForCase(caseData: SignumWorkbenchCase): readonly string[] {
  return Array.from(
    new Set(
      caseData.claims.flatMap((claim) =>
        claim.references.map((reference) => reference.reference_value),
      ),
    ),
  );
}

export function buildGlossary(
  cases: readonly SignumWorkbenchCase[],
): readonly SignumGlossaryEntry[] {
  const caseIdsByConcept = new Map<string, Set<string>>();
  const unresolvedReferences = new Map<string, string>();

  for (const caseData of cases) {
    for (const reference of caseData.claims.flatMap((claim) => claim.references)) {
      const canonicalId = resolveGlossaryConceptId(reference.reference_value);
      if (CATALOG_BY_ID.has(canonicalId)) {
        const caseIds = caseIdsByConcept.get(canonicalId) ?? new Set<string>();
        caseIds.add(caseData.case_id);
        caseIdsByConcept.set(canonicalId, caseIds);
      } else {
        unresolvedReferences.set(reference.reference_value, reference.reference_type);
        const caseIds = caseIdsByConcept.get(reference.reference_value) ?? new Set<string>();
        caseIds.add(caseData.case_id);
        caseIdsByConcept.set(reference.reference_value, caseIds);
      }
    }
  }

  const entries: SignumGlossaryEntry[] = signumGlossaryCatalog.entries.map((catalogEntry) => ({
    id: catalogEntry.id,
    label: catalogEntry.label,
    ...definitionFromCatalog(catalogEntry),
    case_ids: Array.from(caseIdsByConcept.get(catalogEntry.id) ?? []).sort(),
  }));

  for (const [id, referenceType] of unresolvedReferences) {
    const base = fallbackEntry(id, domainForReference(referenceType));
    entries.push({
      id,
      label: humanize(id),
      ...base,
      case_ids: Array.from(caseIdsByConcept.get(id) ?? []).sort(),
    });
  }

  return entries.sort((left, right) => left.label.localeCompare(right.label));
}

export function displayClaimKind(value: string): string {
  const labels: Record<string, string> = {
    core_message: 'Main message',
    semiotic: 'Signs & associations',
    persuasion: 'How it persuades',
    interpretation: 'Possible interpretation',
    audience: 'Audience',
  };
  return labels[value] ?? humanize(value);
}

export function rankClaimsForReading(claims: readonly SignumClaim[]): readonly SignumClaim[] {
  const kindWeight: Record<string, number> = {
    core_message: 50,
    semiotic: 40,
    persuasion: 30,
    interpretation: 20,
    audience: 10,
  };
  return claims.toSorted((left, right) => {
    const kindDelta = (kindWeight[right.kind] ?? 0) - (kindWeight[left.kind] ?? 0);
    if (kindDelta !== 0) return kindDelta;
    return right.evidence_refs.length - left.evidence_refs.length;
  });
}

export function rankObservationsForReading(
  caseData: SignumWorkbenchCase,
): readonly SignumObservation[] {
  const kindWeight: Record<string, number> = {
    core_message: 50,
    semiotic: 40,
    persuasion: 30,
    interpretation: 20,
    audience: 10,
  };
  const originalIndex = new Map(
    caseData.observations.map((observation, index) => [observation.ref, index]),
  );

  return caseData.observations.toSorted((left, right) => {
    const score = (observation: SignumObservation): number => {
      const linked = claimsForObservation(caseData, observation);
      const strongest = Math.max(0, ...linked.map((claim) => kindWeight[claim.kind] ?? 5));
      return strongest + linked.length;
    };
    const scoreDelta = score(right) - score(left);
    if (scoreDelta !== 0) return scoreDelta;
    return (originalIndex.get(left.ref) ?? 0) - (originalIndex.get(right.ref) ?? 0);
  });
}

export function displayEvidenceType(value: string): string {
  return humanize(value);
}

export function displayReferenceType(value: string): string {
  return humanize(value);
}
