# ADR 0003: Machine decode is the product — remove the review/export ceremony

- **Status:** Active
- **Date:** 2026-08-16
- **Deciders:** Signum Decoder maintainer (sole user)
- **Supersedes:** the review/export consequence of ADR-0002
- **Related:** README north star

## Context

ADR-0001 founded the repo around "machine produces drafts, human reviews, export
is the only path to canonical output" — a world where the machine was a
deterministic stub and human authority was the point. ADR-0002 replaced the stub
with a real local vision model but retained the draft→review→export boundary.

Live decoding showed the machine's semiotic readings are as good as or better
than the hand-authored cases. The review/export machinery (`reviewed-decode.v1`,
the export step, review CLIs, the deterministic-stub and manifest providers, and
the phase-0 pipeline) became dead weight.

## Decision

- **The machine decode is the product output.** A decoded case is an image plus
  its `decode-draft.v1` envelope (observations, claims, references). There is no
  human review step and no canonical export gate.
- **`reviewed-decode.v1`, the export step, review authoring, the deterministic
  stub, the manifest provider, the case-manipulation CLIs, and the phase-0
  pipeline are removed.**
- **The `decode-draft.v1` envelope, its validator, and the controlled vocabulary
  remain** as the integrity layer: machine output is structured and grounded,
  but there is no separate "canonical" shape.
- **Case provenance is metadata**: an ingested case carries `manifest.json`
  (asset + title + source URL); the decode lives in `draft.json`.

## Consequences

- The product flow is: `drop/ingest an ad → local VLM decodes it → browse`.
- ~4,700 lines and ~24 files of review/export, stub/manifest, and phase-0 code
  were removed; the test suite and verify gate were simplified accordingly.
- The controlled vocabulary is expanded to cover advertising's persuasion,
  emotional-lever, cultural-code, and semiotic-device vocabulary.
