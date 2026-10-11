# Signum minimum architecture backbone

This document owns the durable implementation semantics that architecture changes must preserve. `ARCHITECTURE.md` is the faster comprehension map; current code/tests/runtime evidence still answer mutable implementation questions.

## Core modules

### Case Library

`src/cases/case-library.ts` owns Case filesystem layout, Case identity/path validation, Asset identity/access, Pending/Decoded admission, persistence, read-side validation reporting, and Asset immutability semantics.

No frontend, ingestion adapter, audit command, or Decode caller should reimplement Case filesystem rules.

### Corpus Store

`src/corpus/` owns the qualified target persistence model for archival Advertisement identity, Assets, factual corpus metadata/provenance, immutable DecodeRevisions, typed corpus relationships, migration, and structured cross-corpus queries. `docs/architecture/CORPUS-PERSISTENCE-V0.1.md` owns the current migration/cutover boundary.

During the migration phase, Corpus Store is additive: the decoder still writes through Case Library. A generated `.state/corpus-v0.1` projection is reproducible migration state, not a second authoritative write path.

### Decode module

`src/decode/decode-module.ts` owns Decode orchestration for both direct uploads and Pending Cases. Both paths must converge through the same model/client and persistence semantics rather than becoming parallel engines.

### ModelClient seam

`src/providers/model-client.ts` is the model adapter boundary. llama-compatible transport and mocks sit behind it. Product/domain code must not depend directly on one model server's wire format.

### Source adapters

Meta and Reddit ingestion own source-specific acquisition/provenance behavior. They do not own Case persistence semantics.

### Frontend projection

`src/frontend/signum-workbench-data.ts` projects Case Library/domain state into Svelte-facing data. Generated frontend JSON/static image files are derived publication artifacts, not independent domain truth.

## Non-negotiable invariants

1. **Asset evidence is stable.** A Decoded Case cannot silently replace the evidence-bearing Asset it was decoded from.
2. **Filesystem access is confined.** Case IDs and stored Asset paths must not escape the Case Library root/Case directory.
3. **Decode writes fail closed.** New writes validate before persistence. Existing legacy/dirty reads may surface validation issues without silently rewriting history.
4. **Decode writes remain terminal machine outputs.** Do not reintroduce review/export promotion architecture. In Corpus Model v0.1 those outputs persist as immutable DecodeRevisions attached to Advertisement identity.
5. **One Decode orchestration path.** Upload and Pending-Case decoding share orchestration rather than forking semantics.
6. **Model transport is an adapter.** Domain logic stays independent of llama/OpenAI-compatible transport details.
7. **Source acquisition and persistence stay separate.** Source adapters supply material/provenance; Case Library owns Case admission and storage invariants.
8. **Generated frontend artifacts are disposable.** They can be rebuilt from Case/domain sources and do not own identity or analytical truth.
9. **Storage compatibility language is not product language.** Legacy `draft.json`, `draft_id`, and `decode-draft.v1` may remain as compatibility terms without reviving a Draft lifecycle concept.
10. **Evidence and inference remain distinct.** Observation/Evidence is not AdvertiserClaim/Interpretation; UI convenience must not collapse this semantic boundary.
11. **Advertisement identity is not Case identity.** Legacy migration may bootstrap identity from exact Asset hashes, but the target model allows several Assets per Advertisement.
12. **Decode history is append-only in the corpus.** Re-analysis creates another DecodeRevision rather than replacing intellectual history.
13. **Acquisition is not Placement.** Where Signum obtained an Asset must never silently become a claim about where/when the ad originally ran.

## Canonical flow

```text
Meta adapter ───────┐
Reddit adapter ─────┼──→ Case Library
Frontend projection ┤
HTTP browse routes ─┘

Upload ─────────────┐
                    ├──→ Decode module ──→ ModelClient adapter
Pending Case ───────┘          │
                               ↓
                          Case Library

Case Library
    ↓
frontend artifact projection
    ├─ compact metadata/Decode data
    └─ generated static Case image files
             ↓
         SvelteKit
```

## Architecture change test

Before adding a new service/repository/engine abstraction, answer:

1. Which existing module owns the invariant today?
2. Is there a real second implementation or seam that requires abstraction?
3. Does the change increase locality and leverage, or merely distribute one responsibility across more files?
4. Can all current callers inherit the behavior from one deep module?
5. Which executable tests prove the invariant after the change?

Prefer deep modules and real adapter seams over generic repository/service/framework layers with no demonstrated second use.

## Mutable-state discipline

This file does not certify that a particular local model is running, that a Case count is current, that the public site is deployed, or that a specific corpus entry validates. Verify those facts fresh from the relevant code/data/runtime source routed by `docs/AUTHORITY.md`.
