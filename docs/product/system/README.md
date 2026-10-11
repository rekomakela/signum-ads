# Signum product and design authority

This directory is the current target-intent and design-authority package for Signum. It is intentionally compact. Read `docs/AUTHORITY.md` first, then open only the most specific document below for the task at hand.

## Core distinction

```text
CURRENT REALITY != TARGET PRODUCT INTENT != DESIGN AUTHORITY != RUNTIME/PUBLICATION STATE
```

- **Target product intent** says what Signum is intended to achieve and what is in scope.
- **Design authority** says how that product behaves, is organized, and is presented.
- **Current reality** comes from the checked-out code, tests, generated data, and fresh browser/runtime evidence.
- **Runtime/publication state** says what local services or the public static site are actually serving; repository configuration alone does not prove it.

## Package map

| Document                             | Owns                                                                                                                                      | Does not own                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `00-product-intent.md`               | Product purpose, audience, jobs, scope, differentiation, product stance                                                                   | Mutable implementation state           |
| `01-domain-language.md`              | Canonical corpus/domain vocabulary, compatibility terms, and retired terms                                                                | User-facing copy wording               |
| `02-analysis-model.md`               | Corpus planes plus the conceptual relationship between archival identity, evidence, interpretation, concepts, provenance, and uncertainty | Exact mutable TypeScript schema        |
| `03-information-architecture.md`     | Surface roles, navigation labels, page hierarchy, cross-surface movement                                                                  | Visual styling details                 |
| `04-presentation-and-interaction.md` | Visual system, interaction hierarchy, progressive disclosure, component behavior                                                          | Domain semantics                       |
| `05-quality-and-governance.md`       | Epistemic, accessibility, privacy/locality, third-party-content, and public-showcase quality boundaries                                   | Security incident procedure            |
| `DECISIONS.md`                       | Current explicit product/design decisions and supersession notes                                                                          | Task tracking or implementation status |

## Reading discipline

Do not read this entire package by default. The normal agent boot path is:

1. `AGENTS.md`
2. `docs/AUTHORITY.md`
3. one routed authority from this package or the architecture/code authorities
4. relevant current code/tests/runtime evidence

`ARCHITECTURE.md` is a rapid comprehension map, not an authority over mutable state or durable architecture semantics. Durable implementation semantics live in `docs/architecture/MINIMUM-BACKBONE.md`.

## Historical material

Superseded ADRs and old design notes are evidence of previous states. They do not override this package unless `docs/AUTHORITY.md` explicitly routes a question to them.
