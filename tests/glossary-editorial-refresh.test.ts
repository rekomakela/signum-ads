import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const CATALOG_PATH = resolve(REPO_ROOT, 'frontend/src/lib/generated/signum-glossary-data.json');

interface CatalogEntry {
  id: string;
  definition: string;
  plain_language: string;
  scope_note: string;
  common_misreadings: string[];
  reviewed_at: string | null;
}

interface Catalog {
  schema_version: string;
  sources: string[];
  entries: CatalogEntry[];
}

function loadCatalog(): Catalog {
  return JSON.parse(readFileSync(CATALOG_PATH, 'utf8')) as Catalog;
}

function requireEntry(catalog: Catalog, id: string): CatalogEntry {
  const entry = catalog.entries.find((candidate) => candidate.id === id);
  assert.ok(entry, `expected glossary entry ${id}`);
  return entry;
}

test('glossary catalog v2 layers the editorial refresh over the base catalog', () => {
  const catalog = loadCatalog();
  assert.equal(catalog.schema_version, 'signum_glossary_catalog.v2');
  assert.deepEqual(catalog.sources, [
    'content/glossary/entries.yaml',
    'content/glossary/editorial-refresh.v2.yaml',
  ]);

  const claim = requireEntry(catalog, 'claim');
  assert.equal(claim.reviewed_at, '2026-08-29');
  assert.match(claim.definition, /interpretive proposition/i);
  assert.match(claim.scope_note, /Evidence Links connect Claims to Observations/i);
});

test('reviewed core semiotic concepts expose boundaries and common misreadings', () => {
  const catalog = loadCatalog();

  for (const id of [
    'signifier',
    'signified',
    'referent_system',
    'ideology',
    'observation',
    'interpretation',
    'evidence_link',
    'counter_reading',
  ]) {
    const entry = requireEntry(catalog, id);
    assert.equal(entry.reviewed_at, '2026-08-29', `${id} must be editorially reviewed`);
    assert.ok(entry.scope_note.length > 0, `${id} must define its boundary`);
    assert.ok(entry.common_misreadings.length > 0, `${id} must name common misreadings`);
  }

  assert.match(requireEntry(catalog, 'signifier').scope_note, /Observation/i);
  assert.match(
    requireEntry(catalog, 'evidence_link').scope_note,
    /not a controlled-concept Reference/i,
  );
});

test('contested and externally dependent concepts fail closed in their glossary wording', () => {
  const catalog = loadCatalog();

  const contextCollapse = requireEntry(catalog, 'context_collapse');
  assert.match(contextCollapse.definition, /multiple distinct audiences|social contexts/i);
  assert.match(
    contextCollapse.scope_note,
    /distribution environment|communication and audience conditions/i,
  );

  const greenwashing = requireEntry(catalog, 'greenwashing');
  assert.match(
    greenwashing.scope_note,
    /cannot establish greenwashing conclusively|external evidence/i,
  );

  const luxuryBelief = requireEntry(catalog, 'luxury_belief');
  assert.match(luxuryBelief.definition, /Rob Henderson/i);
  assert.match(luxuryBelief.scope_note, /contested/i);

  const wokeCapitalism = requireEntry(catalog, 'woke_capitalism');
  assert.match(wokeCapitalism.definition, /contested political label/i);
  assert.match(wokeCapitalism.scope_note, /not a neutral ontology primitive/i);

  const technoOrientalism = requireEntry(catalog, 'techno_orientalism');
  assert.match(technoOrientalism.definition, /East Asia|Asians/i);
  assert.match(technoOrientalism.scope_note, /Do not apply it solely/i);
});

test('previously minimal semiotic entries now explain the analytical distinction', () => {
  const catalog = loadCatalog();

  assert.match(requireEntry(catalog, 'metaphor').definition, /understood in terms of another/i);
  assert.match(requireEntry(catalog, 'metonymy').definition, /closely associated/i);
  assert.match(
    requireEntry(catalog, 'denotation').scope_note,
    /not as a claim that perception is culturally neutral/i,
  );
  assert.match(
    requireEntry(catalog, 'connotation').common_misreadings.join(' '),
    /fixed meanings/i,
  );
  assert.match(requireEntry(catalog, 'iconic_sign').scope_note, /does not mean famous/i);
});
