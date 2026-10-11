#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const exists = (path) => existsSync(resolve(root, path));

const errors = [];

const requiredAuthorities = [
  'docs/AUTHORITY.md',
  'docs/architecture/MINIMUM-BACKBONE.md',
  'docs/architecture/CORPUS-PERSISTENCE-V0.1.md',
  'docs/product/system/README.md',
  'docs/product/system/00-product-intent.md',
  'docs/product/system/01-domain-language.md',
  'docs/product/system/02-analysis-model.md',
  'docs/product/system/03-information-architecture.md',
  'docs/product/system/04-presentation-and-interaction.md',
  'docs/product/system/05-quality-and-governance.md',
  'docs/product/system/DECISIONS.md',
  'content/ontology/corpus-model.v0.1.yaml',
  'content/ontology/controlled-concept-model.v0.1.yaml',
];

for (const path of requiredAuthorities) {
  if (!exists(path)) errors.push(`missing authority document: ${path}`);
}

const authority = exists('docs/AUTHORITY.md') ? read('docs/AUTHORITY.md') : '';
for (const path of requiredAuthorities.filter((path) => path !== 'docs/AUTHORITY.md')) {
  if (!authority.includes(`\`${path}\``)) {
    errors.push(`docs/AUTHORITY.md does not route to ${path}`);
  }
}

const systemReadme = exists('docs/product/system/README.md')
  ? read('docs/product/system/README.md')
  : '';
for (const path of requiredAuthorities.filter((path) => path.startsWith('docs/product/system/'))) {
  const basename = path.split('/').at(-1);
  if (basename && basename !== 'README.md' && !systemReadme.includes(`\`${basename}\``)) {
    errors.push(`product system README does not map ${basename}`);
  }
}

if (exists('ARCHITECTURE.md')) {
  const architecture = read('ARCHITECTURE.md');
  if (!/comprehension map/i.test(architecture)) {
    errors.push('ARCHITECTURE.md must identify itself as a comprehension map');
  }
  if (!architecture.includes('docs/architecture/MINIMUM-BACKBONE.md')) {
    errors.push(
      'ARCHITECTURE.md must route durable semantics to docs/architecture/MINIMUM-BACKBONE.md',
    );
  }
} else {
  errors.push('missing ARCHITECTURE.md comprehension map');
}

if (exists('AGENTS.md')) {
  const agents = read('AGENTS.md');
  for (const required of [
    'docs/AUTHORITY.md',
    'docs/architecture/MINIMUM-BACKBONE.md',
    'docs/architecture/CORPUS-PERSISTENCE-V0.1.md',
    'CURRENT REALITY != TARGET PRODUCT INTENT != DESIGN AUTHORITY != RUNTIME/PUBLICATION STATE',
  ]) {
    if (!agents.includes(required))
      errors.push(`AGENTS.md missing governance contract: ${required}`);
  }
} else {
  errors.push('missing AGENTS.md');
}

if (errors.length > 0) {
  for (const error of errors) console.error(`FAIL: ${error}`);
  console.error(`documentation authority check failed: ${errors.length} error(s)`);
  process.exit(1);
}

console.log(
  `documentation authority check passed: ${requiredAuthorities.length} canonical surfaces verified`,
);
