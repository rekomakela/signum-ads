# Decisions

Last reviewed: 2026-08-16

## Active Decisions

| ID | Title | File | Summary |
|----|-------|------|---------|
| ADR-0003 | Machine decode is the product | ../adr/0003-machine-decode-is-the-product.md | The machine decode is the output; the review/export ceremony, stub, and manifest providers are removed. |
| ADR-0002 | Vision reset: real local VLM decoding | ../adr/0002-vision-reset-local-vlm-decoding.md | Drop an ad image → local Qwen3.8-27B vision model decodes it; browse decoded ads. |
| DN-0002 | Vocabulary source of truth | ../design-notes/vocabulary-source-of-truth.md | The old repo owns vocabulary; the new repo imports read-only snapshots. |
| DN-0003 | Registry interface extraction | ../design-notes/registry-interface.md | ReferenceRegistry is replaceable; the validator depends on the interface. |
| DN-0005 | Controlled vocabulary registry | ../design-notes/controlled-vocabulary-registry.md | Snapshot-backed registry resolves known vocabulary IDs; unknown IDs remain unresolved. |
| KN-0001 | Master ontology foundation (content-only) | ../knowledge/master-ontology-decisions.md | 20 canonical classes + 25 relationships; content-only, not wired to runtime. |

## Archived / Superseded Decisions

| ID | Title | Reason |
|----|-------|--------|
| ADR-0001 | Automatic decoder first | Superseded by ADR-0002 (vision reset) and ADR-0003 (machine is the product). |
| DN-0001 | Deterministic stub provider | Removed — the stub provider was deleted. |
| DN-0004 | Draft envelope vs reviewed/canonical decode | Removed — the reviewed/canonical shape and export step were deleted. |
