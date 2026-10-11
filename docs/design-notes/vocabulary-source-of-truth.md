# Vocabulary Source of Truth

Status: Active

The controlled vocabulary still originates from the old `ad-decoder-starter`
repo, but `signum-decoder` now keeps one checked-in canonical snapshot at
`src/reference-vocabulary/controlled-vocabulary.v1.json` and reads that file
directly.

Core rules:

- `ad-decoder-starter` owns the curated controlled vocabulary: ontology, glossary, persuasion taxonomy, emotional levers, and cultural-code-like terms.
- `signum-decoder` reads the checked-in canonical snapshot directly.
- `signum-decoder` must not write vocabulary source files.
- Historical fixture snapshots are no longer the source of truth.
- `propose_new_reference` records a review artifact only. It has no filesystem write path.
- No code path in `signum-decoder` mutates vocabulary data on disk.

Rationale:

The learning repo contains curated, human-reviewed vocabulary. Forking that
vocabulary without governance would create divergent sources of truth. Until
this repo has its own curation/import process, the old repo remains the source
of curation, but the checked-in canonical snapshot is the runtime source used
by this repo.

Superseded when:

This note is superseded when a full vocabulary import and governance process
replaces the checked-in canonical snapshot.
