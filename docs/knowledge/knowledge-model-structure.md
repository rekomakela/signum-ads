# Signum knowledge model structure

## Canonical target layers

1. **Corpus model** — what archival advertising objects, provenance, time, revisions, and graph relations exist.
2. **Controlled concept model** — stable reusable analytical vocabulary and hierarchy.
3. **Glossary** — reader-facing explanation generated from controlled concepts.
4. **Concept content** — curated instance banks, especially social/cultural concepts and persuasion vocabulary.
5. **Principles** — reusable decoding rules and learning heuristics.
6. **Legacy/source layers** — imported ontologies and older mappings retained for migration/reference, not current authority.

Canonical target ontology begins at `content/ontology/corpus-model.v0.1.yaml` and the core class/relationship projections. The older `content/ontology/ontology.yaml` layer manifest is source material only.

## Five corpus information planes

Keep these distinct:

- corpus facts;
- perceptual evidence;
- interpretation;
- controlled analytical vocabulary;
- corpus relationships.

Do not promote a term merely because it is useful, and do not let current decoder object shapes determine what can exist in the corpus ontology.

## Rule of thumb

Use stable classes for durable corpus structure, controlled concepts for reusable analytical vocabulary, glossary entries for presentation, and principles for teaching/heuristics. Runtime compatibility terms may persist during migration without remaining target ontology.
