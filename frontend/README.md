# Signum Frontend

Svelte 5 / SvelteKit presentation area for browsing and inspecting Signum Cases and Decodes.

## Authority

Before changing frontend behavior, read:

1. `../AGENTS.md`
2. `../docs/AUTHORITY.md`
3. the most-specific routed product/design authority, normally `../docs/product/system/03-information-architecture.md`, `04-presentation-and-interaction.md`, or `05-quality-and-governance.md`
4. current route/component code, generated data types, and fresh browser evidence when behavior is user-visible

## Data flow

The frontend does not own Case persistence. Build-time metadata/interpretation data is projected from the Case Library through `src/frontend/signum-workbench-data.ts` and written to ignored generated files under `src/lib/generated/`. `src/corpus/curated-corpus-metadata.ts` owns verified Brand/time facts and factual provenance; `src/frontend/archive-metadata.ts` only adds presentation copy such as analytical titles/decks and formats the corpus facts for display. Case image bytes are published separately by `src/cli/frontend-data.ts` under ignored `static/generated/cases/` paths, and the generated dataset contains only static URLs to those files.

## Commands

From the repository root:

```sh
npm run frontend:dev
npm run frontend:check
npm run frontend:build
npm run test:frontend
```

The frontend completion gate is:

```sh
bash scripts/validate --frontend
```

Use `bash scripts/validate` for cross-layer/release completion.

## Constraints

- Use the plain-language UI model from `../docs/product/system/02-analysis-model.md`; keep domain terminology secondary when the interface does not require it.
- Do not expose legacy human review/export lifecycle semantics.
- Preserve accessibility semantics and design tokens unless the task explicitly changes them.
- Treat generated data files as build artifacts; change their sources, not their generated contents.

## Public hierarchy

- `/` is the archive-first editorial entry point.
- `/cases` is the image-first analysis collection. Default cards are **image → Brand · Year → analytical title** when governed metadata exists.
- `/cases/[caseId]` starts with archive context, **Advertisement + Overall interpretation**, then key Observation → Interpretation units, Concepts, and optional provenance/method detail.
- `/analyse` owns creation.
- `/workbench` is the contextual **Analysis map**, not primary navigation.

Do not infer missing brand/year context from slugs, Reddit post dates, or source titles. Unknown archive chronology stays absent until independently established.
