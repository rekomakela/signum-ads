# ADR 0002: Vision reset — real local VLM decoding

- **Status:** Active
- **Date:** 2026-08-15
- **Deciders:** Signum Decoder maintainer (sole user)
- **Supersedes:** ADR-0001 (Automatic-decoder-first)
- **Related:** README north star

## Context

ADR-0001 founded the repo as "automatic-decoding-first", but the only
"providers" were a deterministic stub (placeholder output, no image analysis)
and a manifest provider (a human hand-decodes the ad into JSON). No model, OCR,
or vision ever existed; the "automatic" decode was scaffolding. The repo also
carried a "read-only frontend / no runtime writes / no model or API calls"
constraint.

The product has been reset around two features:

1. Drop an advertisement image and the engine automatically decodes it.
2. Browse already-decoded advertisements.

## Decision

- **The decode engine is a real local vision model**, not a stub: Qwen3.8-27B
  (vision) served by llama.cpp through a `llama-swap` profile (`signum-vision`),
  OpenAI-compatible.
- **Decoding runs locally** (no cloud, no API key); local-first remains a
  project invariant.
- **The existing `decode-draft.v1` envelope and validators are reused** as the
  machine-output shape; the model emits a structured JSON that the
  `image-decode-provider` maps into the envelope.
- **The "read-only frontend", "no model/OCR/VLM", and "no runtime writes"
  constraints are dropped.** Decoding an image persists a case to the local
  case library, and the app must reflect it.
- **The draft→review→export boundary is retained as the integrity mechanism**
  (machine output provisional, canonical output only after review/export), but
  its surface (CLI vs in-app) is a separate, open decision.

## Consequences

- The decode path is: `image → local VLM (structured JSON) → decode-draft.v1 →
  validation → (review/export)`.
- Providers become async (model inference is a socket call even when local).
- The frontend must move from static/prerendered to server-backed to accept
  uploads and persist decoded cases.
- The old "deterministic stub first, real model later" roadmap is superseded.
