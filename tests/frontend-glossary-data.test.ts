import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CATALOG_PATH = resolve(REPO_ROOT, 'frontend/src/lib/generated/signum-glossary-data.json');
const CASES_DIR = resolve(REPO_ROOT, 'cases');
const DECONSTRUCTION_PATH = resolve(REPO_ROOT, 'frontend/src/lib/deconstruction.ts');

const DOMAIN_BUCKETS = new Set(['Semiotics', 'Persuasion', 'Emotion', 'Culture', 'System']);
// Must mirror generate_glossary_catalog.py DOMAIN_MAP.
const DOMAIN_MAP: Record<string, string> = {
  EmotionalLever: 'Emotion',
  PersuasionTechnique: 'Persuasion',
  Signifier: 'Semiotics',
  Signified: 'Semiotics',
  GlossaryEntry: 'Semiotics',
  ReferentSystem: 'Culture',
  Ideology: 'Culture',
  CulturalCode: 'Culture',
  SocialConcept: 'Culture',
};
// Instance-level reference types that the frontend glossary renders as concepts.
// ontology_class values are class names that intentionally fall back, so they are excluded.
const INSTANCE_REFERENCE_TYPES = new Set([
  'glossary_concept',
  'persuasion_technique',
  'emotional_lever',
  'cultural_code',
]);

interface CatalogEntry {
  id: string;
  domain: string;
  ontology_ref: { class: string | null };
  definition: string;
  why_it_matters: string;
  how_to_spot: string[];
}
interface Catalog {
  aliases: Record<string, string>;
  entries: CatalogEntry[];
}

function loadCatalog(): Catalog {
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as Catalog;
}

function loadCaseManifests(): Array<Record<string, unknown>> {
  return readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(CASES_DIR, entry.name, 'manifest.json'))
    .filter((path) => existsSync(path))
    .map((path) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>);
}

test('glossary catalog covers every instance-level concept requested by case manifests', () => {
  const catalog = loadCatalog();
  const ids = new Set(catalog.entries.map((entry) => entry.id));

  for (const manifest of loadCaseManifests()) {
    const needed = new Set<string>();
    const claims = (manifest.claims as Array<Record<string, unknown>>) ?? [];
    for (const claim of claims) {
      const references =
        (claim.references as Array<{ reference_type?: string; reference_value?: string }>) ?? [];
      for (const reference of references) {
        const { reference_type: type, reference_value: value } = reference;
        if (type !== undefined && value !== undefined && INSTANCE_REFERENCE_TYPES.has(type)) {
          needed.add(value);
        }
      }
    }
    const guidance = (manifest.learning_guidance as Record<string, unknown>) ?? {};
    for (const concept of (guidance.concepts_to_know as string[]) ?? []) {
      needed.add(concept);
    }
    for (const conceptId of needed) {
      const resolved = catalog.aliases[conceptId] ?? conceptId;
      assert.ok(
        ids.has(resolved),
        `concept "${conceptId}" (resolved "${resolved}") missing from glossary catalog`,
      );
    }
  }
});

test('authority alias resolves to authority_persuasion', () => {
  const catalog = loadCatalog();
  assert.equal(catalog.aliases.authority, 'authority_persuasion');
  assert.ok(
    catalog.entries.some((entry) => entry.id === 'authority_persuasion'),
    'alias target authority_persuasion must exist as a catalog entry',
  );
});

test('every catalog entry has a valid, correctly mapped domain', () => {
  const catalog = loadCatalog();
  for (const entry of catalog.entries) {
    assert.ok(
      DOMAIN_BUCKETS.has(entry.domain),
      `entry ${entry.id} has unknown domain ${entry.domain}`,
    );
    const expected = DOMAIN_MAP[entry.ontology_ref.class ?? ''] ?? 'System';
    assert.equal(
      entry.domain,
      expected,
      `entry ${entry.id} domain ${entry.domain} does not match class ${entry.ontology_ref.class}`,
    );
  }
});

test('catalog entries referenced by the frontend carry definition text and why_it_matters', () => {
  const catalog = loadCatalog();
  // Concepts known to surface in the glossary drawer must not render empty sections.
  for (const id of ['social_proof', 'scarcity', 'authority_persuasion', 'aspiration', 'trust']) {
    const entry = catalog.entries.find((candidate) => candidate.id === id);
    assert.ok(entry, `expected catalog entry ${id}`);
    assert.ok(entry.definition.length > 0, `${id} must have a definition`);
    assert.ok(entry.why_it_matters.length > 0, `${id} must have why_it_matters`);
    assert.ok(entry.how_to_spot.length > 0, `${id} must have how_to_spot`);
  }
});

test('deconstruction.ts uses the generated catalog and has no hardcoded definitions or YAML', () => {
  const source = readFileSync(DECONSTRUCTION_PATH, 'utf8');
  assert.ok(
    source.includes("from '$lib/generated/signum-glossary-data'"),
    'deconstruction.ts must import the generated glossary catalog',
  );
  assert.ok(!/const DEFINITIONS/.test(source), 'hardcoded DEFINITIONS map must be removed');
  assert.ok(
    !/from\s+['"][^'"]*yaml/i.test(source) && !/yaml\s*\.\s*(parse|load|safeLoad)/i.test(source),
    'deconstruction.ts must not import or parse YAML at runtime',
  );
});
