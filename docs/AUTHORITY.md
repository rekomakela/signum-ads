# Signum authority routing

This is the repository-wide authority and documentation router for Signum. It routes questions to current sources; it is not itself a mutable product, corpus, runtime, or publication-status snapshot.

## Core distinctions

Keep these states separate:

```text
CURRENT REALITY != TARGET PRODUCT INTENT != DESIGN AUTHORITY != RUNTIME/PUBLICATION STATE
```

- **Target product intent** says what Signum is intended to achieve and what is in scope.
- **Design authority** says how the intended product behaves, is organized, and is presented.
- **Current reality** says what the checked-out code, tests, Case data, generated artifacts, or browser currently do.
- **Runtime/publication state** says what local services or the public static site are actually serving; configuration or a workflow file does not prove live state.

`docs/product/system/DECISIONS.md` may explicitly supersede older product/design text within the scope of a recorded decision. Otherwise use the most-specific authority below. If two current authorities materially conflict and neither explicitly wins, stop and reconcile that authority class instead of guessing.

`ARCHITECTURE.md` is a rapid comprehension map only. It never overrides the sources below and must not be used as proof of mutable state. Durable architecture semantics live in `docs/architecture/MINIMUM-BACKBONE.md`.

## Authority by question

| Question class                                   | Current authority                                                                                                                                                                 | How to use it                                                                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product intent / validated scope                 | `docs/product/system/00-product-intent.md` + `docs/product/system/DECISIONS.md`                                                                                                   | Owns product purpose, audience, scope, stance, and explicit current product decisions. Do not infer product intent from implementation drift.                       |
| Domain language / ubiquitous terminology         | `docs/product/system/01-domain-language.md`                                                                                                                                       | Owns canonical domain terms and retired terms. Exact mutable field names remain code/schema concerns.                                                               |
| Corpus model / archival identity                 | `docs/product/system/01-domain-language.md`, `docs/product/system/02-analysis-model.md`, `content/ontology/corpus-model.v0.1.yaml`, `docs/knowledge/master-ontology-decisions.md` | Owns Advertisement identity, Brand/time/Campaign/Placement/Acquisition semantics, DecodeRevision target model, and corpus graph epistemics.                         |
| Analysis semantics                               | `docs/product/system/02-analysis-model.md`                                                                                                                                        | Owns stable relationships between Observation, AdvertiserClaim, Interpretation, evidence links, analytical concepts, uncertainty, and thesis.                       |
| Current Decode lifecycle / no-review rule        | `docs/adr/0003-machine-decode-is-the-product.md` + current Decode contracts                                                                                                       | Owns the current runtime rule that a valid machine Decode is terminal output for its run; it does not define corpus archival identity.                              |
| Information architecture / navigation            | `docs/product/system/03-information-architecture.md` + scoped decisions in `docs/product/system/DECISIONS.md`                                                                     | Owns surface roles, public labels, navigation hierarchy, progressive disclosure placement, and cross-surface movement.                                              |
| Visual / interaction authority                   | `docs/product/system/04-presentation-and-interaction.md` + scoped decisions in `docs/product/system/DECISIONS.md`                                                                 | Owns visual system and interaction behavior. It does not own domain semantics.                                                                                      |
| Quality / epistemic / accessibility governance   | `docs/product/system/05-quality-and-governance.md`                                                                                                                                | Owns uncertainty language, evidence integrity, accessibility, local-first/public-showcase boundaries, and quality expectations.                                     |
| Durable architecture semantics                   | `docs/architecture/MINIMUM-BACKBONE.md`                                                                                                                                           | Owns module boundaries and non-negotiable implementation invariants. `ARCHITECTURE.md` is only a faster map.                                                        |
| Current product/frontend reality                 | Current `frontend/src/`, generated frontend projection, relevant tests, and fresh browser evidence                                                                                | Code/tests/browser answer what exists now. Product/design docs answer what should exist. Reconcile drift explicitly.                                                |
| Decode schema / validation semantics             | `src/contracts/decode-draft-v1.ts`, `src/validation/decode-draft-validator.ts`                                                                                                    | Exact current contract and validation behavior. Tests under `tests/` are executable evidence.                                                                       |
| Corpus persistence / legacy migration            | `docs/architecture/CORPUS-PERSISTENCE-V0.1.md` + `src/corpus/`                                                                                                                    | Owns the qualified target Corpus Store, migration/query semantics, and migration boundary. Case Library remains current decoder persistence until explicit cutover. |
| Case persistence / Asset invariants              | `src/cases/case-library.ts` + `docs/architecture/MINIMUM-BACKBONE.md`                                                                                                             | Case Library owns layout, identity/path safety, persistence, Pending/Decoded admission, and Asset invariants.                                                       |
| Decode orchestration                             | `src/decode/decode-module.ts` + `docs/architecture/MINIMUM-BACKBONE.md`                                                                                                           | Upload and Pending-Case decoding must share the same orchestration seam.                                                                                            |
| Model transport                                  | `src/providers/model-client.ts`, `src/providers/llama-server-client.ts`                                                                                                           | Owns the current adapter seam and transport behavior. A configured endpoint does not prove that the runtime is live.                                                |
| Controlled concepts / glossary                   | `content/ontology/controlled-concept-model.v0.1.yaml`, `content/`, `src/reference-vocabulary/`, and current glossary-generation code                                              | Target concept governance comes from the controlled-concept model; current runtime vocabulary/catalog remain compatibility projections until migrated.              |
| Local runtime configuration                      | `.env.example`, `src/server/`, current provider configuration, and fresh local runtime evidence                                                                                   | Configuration defines intended local settings, not whether a process/model is currently running.                                                                    |
| Static public publication                        | `.github/workflows/pages.yml` + fresh GitHub Pages/Actions evidence                                                                                                               | Workflow defines publication mechanism. Verify actual run/deployment state before claiming the showcase is live.                                                    |
| Build / test / docs / security gates             | `scripts/validate`, `scripts/check-docs.mjs`, `package.json`                                                                                                                      | Repository-owned validation entrypoints. CI should converge on the same gate rather than define a parallel contract.                                                |
| Repository security / third-party-content policy | `SECURITY.md`, `LICENSE`, `README.md`                                                                                                                                             | Security reporting, licensing, and third-party creative/removal policy.                                                                                             |

## Current-reality discipline

For mutable questions, resolve evidence fresh from the canonical worktree and affected runtime/data source.

Examples:

- Current frontend behavior: inspect `frontend/src/`, relevant tests, then browser evidence when the claim is user-visible.
- Current corpus count or validation status: inspect current Case Library/data state with a named method; do not reuse a historical count from prose.
- Current model availability: probe the configured local runtime; `.env.example` does not prove service health.
- Current public deployment: inspect the actual GitHub Pages/Actions state; committed `pages.yml` does not prove publication success.

## Repository and mutation boundary

Before changing files, inspect the actual worktree status and preserve unrelated state. Do not reset, stash, clean, or overwrite unrelated changes merely to make a task easier.

Local implementation does not authorize push, PR merge, public publication, external runtime mutation, or exposing the local Decode service. Those are separate actions and require the active user/repository authorization.

## Context budget

Default pre-implementation read budget:

1. `AGENTS.md`
2. this file
3. one task-specific authority from the table
4. relevant code/tests/evidence

Do not recursively ingest all of `docs/`, all Git history, or the whole Case corpus by default. Expand only when the task requires it.

## Historical / non-authoritative material

These paths contain history or superseded direction and should not override current authorities:

- ADR-0001 / ADR-0002 where superseded by ADR-0003
- old design notes unless a current authority explicitly cites them
- generated reports/screenshots as proof of a past run only

Historical documents may contain terms such as review, reviewed Decode, export, phase-0, or manifest-provider. Those describe retired architecture unless a current authority explicitly reintroduces them.

## Documentation entrypoints

- `docs/product/system/README.md` — map of current product/design authorities.
- `docs/architecture/MINIMUM-BACKBONE.md` — durable architecture semantics.
- `ARCHITECTURE.md` — fast comprehension map only.
