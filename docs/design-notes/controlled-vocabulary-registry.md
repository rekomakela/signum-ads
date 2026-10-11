# Controlled Vocabulary Registry

Status: Active

The controlled vocabulary registry is read-only.

Core rules:

- It resolves exact known IDs for glossary concepts, ontology classes, persuasion techniques, emotional levers, and cultural codes when the canonical controlled vocabulary snapshot supports them.
- Unknown values return unresolved and become structured validation issues.
- The registry must not mutate the canonical snapshot file or old repo files.
- The canonical snapshot is intentionally small and identifier-focused.
- The registry is a bridge toward a future full vocabulary import process, not the final curation mechanism.

References:

- `src/references/controlled-vocabulary-registry.ts`
- `src/reference-vocabulary/controlled-vocabulary.v1.json`
- `tests/fixtures/reference-vocabulary/SOURCE-NOTES.md`

Superseded when:

This note is superseded when a full vocabulary import and governance process replaces the canonical snapshot-backed registry.
