# Signum Decoder — Agent Guidance

Signum is a local-first advertisement-analysis project. This is the operating entrypoint for coding agents and a compact statement of the invariants human contributors are asked to respect. The public repository keeps it because the governance it describes is part of how the project was built.

## 1. Grounding

Read, in order:

1. `docs/AUTHORITY.md` — repository-wide authority/task router.
2. **One task-specific current authority** routed by `docs/AUTHORITY.md`.
3. Current code/tests/data/browser/runtime evidence for the affected area when the fact is mutable.

Use `ARCHITECTURE.md` only for a rapid system map. `docs/architecture/MINIMUM-BACKBONE.md` owns durable architecture semantics. Corpus persistence/migration work also reads `docs/architecture/CORPUS-PERSISTENCE-V0.1.md`. The product/design authority package is mapped by `docs/product/system/README.md`.

Do **not** recursively read all of `docs/`, Git history, or the Case corpus by default. Expand context only when the task requires it.

Default pre-implementation budget: this file + `docs/AUTHORITY.md` + one task-specific authority, then relevant code/tests/evidence.

## 2. Authority classes

Keep these distinct:

```text
CURRENT REALITY != TARGET PRODUCT INTENT != DESIGN AUTHORITY != RUNTIME/PUBLICATION STATE
```

- Product intent: `docs/product/system/00-product-intent.md` + `docs/product/system/DECISIONS.md`.
- Domain language: `docs/product/system/01-domain-language.md`.
- Analysis semantics: `docs/product/system/02-analysis-model.md`.
- Information architecture: `docs/product/system/03-information-architecture.md`.
- Presentation/interaction: `docs/product/system/04-presentation-and-interaction.md`.
- Quality/governance: `docs/product/system/05-quality-and-governance.md`.
- Durable architecture semantics: `docs/architecture/MINIMUM-BACKBONE.md`.
- Corpus persistence/migration: `docs/architecture/CORPUS-PERSISTENCE-V0.1.md`.
- Mutable current state: current code/tests/data/browser/runtime evidence.

If authorities materially conflict and no explicit decision supersedes one, stop and reconcile the authority class rather than guessing.

## 3. Product and domain invariants

- A valid machine Decode is terminal machine output; there is no human review/export promotion gate. In Corpus Model v0.1 it is preserved as a versioned DecodeRevision attached to Advertisement identity.
- Primary UI uses plain language first: **what the ad shows → what it may mean → why that interpretation fits**. Domain/expert terms remain available underneath.
- Observation/Evidence is not Claim/Interpretation. Do not collapse evidence and inference.
- Interpretations are contestable readings, not objective truth or proven advertiser intent.
- Current decoder Case filesystem semantics and compatibility persistence belong to the **Case Library**. Target archival Advertisement identity, factual corpus provenance, and DecodeRevision history belong to the **Corpus Store**; do not cut over the decoder write path without an explicit migration decision.
- Upload and Pending-Case orchestration belong to the **Decode module**.
- Model transport stays behind the `ModelClient` seam.
- Source adapters own acquisition provenance, not Case persistence. AcquisitionSource must not be confused with original Placement.
- New Decode writes fail closed on validation. Existing legacy/dirty reads may expose validation issues without being silently rewritten.
- A Decoded Case must not silently replace its evidence-bearing Asset.
- Generated frontend data/images are derived publication artifacts, not independent domain truth.

## 4. Change discipline

Before adding or changing capability, establish:

1. intended observable outcome;
2. current evidence/problem;
3. affected authority/invariant;
4. smallest sufficient implementation;
5. uncertainty/failure behavior;
6. acceptance evidence.

Prefer deep modules and real adapter seams over generic repository/service abstractions without a demonstrated second implementation or need.

## 5. Validation

Use the smallest relevant gate while iterating:

```bash
bash scripts/validate --docs      # documentation / authority changes
bash scripts/validate --core      # contracts, Case Library, Decode, providers, CLI/server
bash scripts/validate --frontend  # Svelte/UI changes
bash scripts/validate             # cross-layer / release completion
```

`bash scripts/doctor --strict` is read-only environment/readiness diagnostics. `bash scripts/bootstrap` recreates the locked npm workspace.

For user-visible behavior, browser/runtime evidence may be required in addition to compiler/tests.

## 6. Execution safety

- Preserve unrelated user changes. Never auto-reset, stash, clean, or overwrite unrelated work.
- Branch creation, commit, push, merge, public publication, and runtime mutation are separate permissions; never infer later permissions from earlier ones.
- Do not expose the local Decode server publicly merely because the static showcase is publishable.
- Never commit credentials; `.env.example` documents runtime variables and `SECURITY.md` defines security/reporting policy.
- If authority or acceptance evidence is insufficient, stop with a bounded blocker instead of inventing state.

## 7. History

- Superseded ADRs are historical/supporting evidence, not current authority.
- If historical material conflicts with current authority, surface the conflict rather than silently following history.
