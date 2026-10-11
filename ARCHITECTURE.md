# Signum Decoder Architecture

This is the fast comprehension map for maintainers and coding agents. It explains how the current system fits together. `docs/AUTHORITY.md` routes authority, `docs/architecture/MINIMUM-BACKBONE.md` owns durable implementation semantics, and current code/tests/data/runtime evidence answer mutable-state questions. If this map conflicts with a routed authority, the routed authority wins.

## System in one line

An Advertisement enters the Case Library as source material, the Decode module asks a local vision-model adapter for a structured interpretation, validation gates writes, and the frontend browses the resulting Cases.

```text
Meta / Reddit / upload
        │
        ▼
  source adapters
        │
        ▼
   Case Library ◄──────────────┐
        │                      │
        │ Pending Case         │ validated Decode
        ▼                      │
   Decode module ──► ModelClient adapter
        │                      │
        └──────────────────────┘
        │
        ▼
 frontend projection ──► Svelte routes
```

## Deep modules and seams

| Module                           | Interface / seam                                                                                        | Owns                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Case Library**                 | `src/cases/case-library.ts`                                                                             | Case filesystem layout, Asset identity and access, Pending/Decoded admission, Decode persistence, Case status, read-side validation reporting                           |
| **Corpus Store**                 | `src/corpus/`                                                                                           | Target archival Advertisement/Asset/Brand identity, factual provenance, DecodeRevision history, typed relationships, migration, and structured queries                  |
| **Decode**                       | `src/decode/decode-module.ts`                                                                           | Upload and Pending-Case orchestration, image constraints, model invocation, validated Decode admission                                                                  |
| **ModelClient**                  | `src/providers/model-client.ts`                                                                         | The real model seam. Local llama-server and mock implementations are adapters behind it                                                                                 |
| **Decode contract + validation** | `src/contracts/decode-draft-v1.ts`, `src/validation/decode-draft-validator.ts`                          | Structured Decode shape and integrity rules                                                                                                                             |
| **Controlled vocabulary**        | `src/references/`, `src/reference-vocabulary/`                                                          | Canonical concepts referenced by Claims                                                                                                                                 |
| **Source adapters**              | `src/ingest/`                                                                                           | Source-specific acquisition and Case identity only; persistence belongs to Case Library                                                                                 |
| **Frontend projection**          | `src/frontend/signum-workbench-data.ts`, `src/frontend/archive-metadata.ts`, `src/cli/frontend-data.ts` | Projects Case Library reads into compact JSON, overlays curated archive display metadata without mutating Case/Decode truth, and publishes Case images as static assets |
| **Local HTTP adapter**           | `src/server/`                                                                                           | Thin transport over Decode and Case Library interfaces                                                                                                                  |

## Domain invariants

The canonical vocabulary is in `docs/product/system/01-domain-language.md`; the stable analysis relationship is in `docs/product/system/02-analysis-model.md`.

1. **A valid machine Decode is terminal machine output.** There is no human review or export promotion step; Corpus Model v0.1 preserves each Decode as a DecodeRevision attached to the archival Advertisement.
2. **Ingestion and Decoding are separate.** Ingestion creates a Pending Case; Decoding turns it into a Decoded Case.
3. **Writes fail closed.** A new Decode must pass validation before Case Library persistence.
4. **Reads remain inspectable.** Existing legacy/dirty Decodes may be loaded with validation issues so the corpus can be audited instead of hidden.
5. **A Decoded Case cannot silently change Asset.** Replacing its evidence-bearing image would invalidate the existing Decode.
6. **Source adapters do not know storage layout.** They provide source data to the Case Library.
7. **Model transport does not leak into orchestration.** Callers know `ModelClient`, not llama.cpp HTTP details.

## Data layout

The Case Library currently persists one directory per Case under `cases/`:

- `asset.<ext>` — evidence-bearing Advertisement image
- `manifest.json` — source metadata for ingested Cases when available
- `draft.json` — legacy filename for the current machine Decode contract

`draft.json` is an implementation/storage name only. In domain language the object is a **Decode**, not a provisional draft.

## Runtime flow

### Direct image decode

1. HTTP/UI accepts an image.
2. Decode module validates media constraints and derives Case/Asset identity.
3. `ModelClient` returns structured model output.
4. The provider mapper constructs the Decode contract.
5. Decode validation runs.
6. Case Library atomically admits the Decoded Case.

### Ingest then decode

1. Meta or Reddit adapter acquires an Advertisement image and source provenance.
2. Case Library admits a Pending Case.
3. Batch Decode loads the Pending Case through the same Case Library interface.
4. The same Decode module + `ModelClient` path produces and persists the Decode.

## Frontend publication flow

`npm run frontend:data` keeps Case metadata and interpretation data in the generated workbench dataset and applies the separate curated archive display layer from `src/frontend/archive-metadata.ts`, but it does **not** embed image bytes as base64. The CLI copies each Case Asset into ignored `frontend/static/generated/cases/` paths and writes ordinary static URLs into the dataset. SvelteKit therefore ships images as static files instead of bundling the full corpus into JavaScript.

Generated workbench JSON and generated Case images are build artifacts. Change their source projection/publishing code rather than editing the generated files directly. Curated archive brand/year/title/deck data belongs in `src/frontend/archive-metadata.ts`; it is presentation metadata, not Case or Decode authority.

## Verification architecture

The canonical cross-layer gate is `bash scripts/validate`. Scoped gates are `--docs`, `--core`, and `--frontend`.

The full gate runs documentation-authority validation, formatting, linting, TypeScript checks, unit/integration tests, Svelte checks/build, dependency security audit, and whitespace verification. CI converges on these repository-owned scripts rather than duplicating validation logic.

## Historical architecture

Older ADRs under `docs/adr/` record implementation history, including the retired review/export architecture. They are not current authority unless `docs/AUTHORITY.md` routes a task there.

## Corpus migration flow

Current decoder writes remain Case-Library-backed while Corpus Model v0.1 is qualified additively:

```text
Case Library
    ↓ deterministic, non-destructive migration
Corpus Store
    ├─ Advertisement / Asset identity
    ├─ Brand/time/provenance assertions
    ├─ immutable DecodeRevisions
    └─ typed/queryable relationships
```

The generated `.state/corpus-v0.1` store is a migration projection until an explicit cutover decision. See `docs/architecture/CORPUS-PERSISTENCE-V0.1.md`.
