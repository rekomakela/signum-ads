# ADR 0001: Automatic-decoder-first

- **Status:** Superseded by ADR-0002 (vision reset, 2026-08-15)
- **Date:** 2026-06-22
- **Deciders:** Signum Decoder maintainer (sole user)
- **Supersedes:** none
- **Related:** [Draft envelope vs reviewed decode](../architecture/draft-envelope-vs-reviewed-decode.md), [Roadmap](../roadmap.md)

## Context

`signum-decoder` is a fresh repository. Its purpose is to take an advertisement
**image** as input and **automatically produce a structured decode** of how the
ad makes meaning and persuades. This is a different product from the prior
project.

The prior project, `ad-decoder-starter` (referred to here as the **learning
repo**), is a local educational sandbox. Its centre of gravity is a human
`/workbench` where a learner reads and annotates ads by hand. It also already
contains durable assets we want to reuse as **reference and import material**:

- A canonical, human-reviewed decode contract (`ad-decode.v1.schema.json` plus
  the `ad-decoder.ts` TypeScript interfaces) describing the final
  `{ schemaVersion, ad, decode }` shape.
- A domain ontology (`content/ontology/ontology.yaml`) and glossary
  (`content/glossary/entries.yaml`) defining the semiotic and persuasion
  vocabulary (signifier → signified → referent system → ideology, persuasion
  techniques, emotional levers).
- A worked planning document for a programmatic image-decoding pipeline
  (OCR → face/gaze → segmentation → CLIP → VLM) that already establishes the
  rule "auto output is candidate evidence, human review is authoritative".
- A Signum design system (`app.css` tokens) and a set of `signum/*` review
  components.

The learning repo's own guidance is explicit that automatic output must not be
written straight into canonical data, and that the canonical v1 schema is the
"final, human-reviewed source of truth". We adopt that boundary as the founding
constraint of this repo rather than re-deriving it.

We must decide what `signum-decoder` is **first**, before any code, so that the
data contracts and module boundaries are designed around the right primary flow.

## Decision

**Signum Decoder is automatic-decoding-first.** The primary product flow is:

```
image input
  → deterministic provider / stub
  → decode-draft.v1 (machine draft envelope)
  → validation
  → human review
  → export reviewed decode (canonical v1)
```

Concretely:

1. **The machine is the first author.** A decode begins as machine output from a
   provider, not as a blank human worksheet. The first provider is a
   **deterministic stub** (no real model, no network) so the whole pipeline can
   be built and tested before any model integration exists.

2. **Machine output never lands in the canonical model.** Machine output is
   written into a **separate draft envelope** (`decode-draft.v1`) that carries
   provenance and a review state. It is explicitly *not* a canonical
   `reviewed-decode.v1` file.

3. **v1 canonical = reviewed output.** The reviewed, human-approved decode is the
   `{ schemaVersion, ad, decode }` shape inherited from the learning repo's v1
   contract. Canonical files are produced only by the **export** step after
   review, never written directly by a provider.

4. **The learning repo is reference / import source only.** We read its schema,
   types, ontology, glossary, design tokens, and review components as reference
   and selectively import them. We do **not** fork its frontend, its
   `/workbench`, or its runtime data wholesale.

A draft envelope moves through these lifecycle states:

| State | Meaning | Who sets it |
|---|---|---|
| `draft` | Valid `decode-draft.v1` envelope, awaiting review | provider + validator |
| `reviewed` | A human has read and edited the draft | reviewer |
| `rejected` | Discarded; not exported | reviewer |

Export produces `reviewed-decode.v1`. It is the reviewed/canonical record, but
it is not a draft lifecycle state.

The boundary between the draft envelope and the reviewed canonical decode is
specified in
[draft-envelope-vs-reviewed-decode.md](../architecture/draft-envelope-vs-reviewed-decode.md).

## Non-goals (phase 0)

These are explicitly out of scope for the foundation phase. They are listed so
the scaffold is not over-built:

- **No direct canonical model writes.** A provider may never write a
  `reviewed-decode.v1` file. Canonical output comes only from the export step.
- **No batch processing.** The pipeline targets one image at a time first.
- **No Tauri / desktop shell.**
- **No browser extension.**
- **No SaaS, accounts, or cloud.** This is a local, single-user tool.
- **No learning-module import in phase 0.** The `/workbench`, its routes, and its
  runtime ad bundle are not imported yet. Reuse of ontology, glossary, design
  tokens, and review components is selective and deferred to later sessions.
- **No real model or API calls yet.** The first provider is a deterministic stub.

## Consequences

**Positive**

- The data contract is designed around machine-first reality from day one: a
  draft envelope with provenance and review state, distinct from canonical v1.
- Canonical data integrity is protected by construction — nothing reaches
  canonical without passing review and export.
- The deterministic stub makes the entire flow testable and reproducible before
  any model exists, which keeps early sessions cheap and free of external
  dependencies.
- We inherit a proven, evidence-grounded canonical schema instead of inventing
  one, and keep the door open to importing ontology, glossary, and review UI.

**Negative / costs**

- Two decode shapes must be maintained (draft envelope and canonical v1) plus the
  mapping between them. This is accepted as the core design seam.
- The deterministic stub produces unrealistic content; it validates *structure
  and flow*, not decode *quality*. Real evaluation waits for a real provider.

**Follow-ups**

- Define `decode-draft.v1` (schema + types) — roadmap session 2.
- Build the deterministic provider — session 3.
- Build the validator — session 4.
- Build the minimal review/export UI — session 5.
