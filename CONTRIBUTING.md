# Contributing to Signum Decoder

Signum Decoder is a local-first project. Keep changes small, evidence-driven, and aligned with the current machine-Decode architecture. Open an issue first for anything beyond a small fix so the intended outcome is agreed before code.

## Before changing code

Read, in order:

1. `AGENTS.md`
2. `docs/AUTHORITY.md`
3. the one task-specific authority routed there
4. relevant current code/tests

Use `ARCHITECTURE.md` for a fast system map. Durable architecture semantics live in `docs/architecture/MINIMUM-BACKBONE.md`; product/design authority is mapped by `docs/product/system/README.md`.

## Environment

Requirements:

- Node version pinned in `.nvmrc`
- npm lockfile at `package-lock.json`
- local llama.cpp / llama-swap runtime only when exercising real image decoding

Bootstrap a fresh clone:

```sh
bash scripts/bootstrap
bash scripts/doctor --strict
```

Runtime variables are documented in `.env.example`. Never commit real tokens or credentials.

## Change discipline

- Preserve unrelated worktree/Case changes unless the task explicitly targets them.
- Follow `docs/product/system/01-domain-language.md` for domain terminology and `02-analysis-model.md` for the plain-language/expert-language boundary.
- Keep Case filesystem semantics inside the Case Library module.
- Keep model transport behind the `ModelClient` seam.
- Keep source-specific acquisition inside ingestion adapters.
- Do not reintroduce human review/export promotion semantics.
- Prefer deletion and consolidation over pass-through wrappers.

## Validation

Use the smallest repository-owned gate that proves the change:

```sh
bash scripts/validate --docs
bash scripts/validate --core
bash scripts/validate --frontend
bash scripts/validate
```

The full gate additionally runs the dependency security audit. Documentation topology is executable through `npm run docs:check`.

Useful focused commands:

```sh
npm run lint
npm run format:check
npm run check
npm test
npm run frontend:check
npm run security:audit
```

## Commits and pushes

Default repository policy is conservative:

- do not commit or push unless the current user/task explicitly authorizes it;
- do not reset, stash, clean, or rewrite unrelated dirty work;
- reference the related issue in the commit message when one exists.

## Security

Follow `SECURITY.md`. Do not put credentials, private tokens, or exploit details in public issues, logs, screenshots, fixtures, or generated reports.
