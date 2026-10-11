# 03 — Information architecture

## Purpose

This document owns the intended role and navigation model of Signum's user-facing surfaces. Current rendered behavior must still be verified from `frontend/src/`, tests, and fresh browser evidence.

## Primary navigation

The public navigation is archive-first and groups destinations by purpose:

**Explore**

1. **Analyses** — browse the advertisement-analysis archive.
2. **Concepts** — follow recurring ideas across analyses and explore the expert vocabulary.

**Learn**

3. **Method** — understand the evidence-first analytical model, Williamson inspiration, uncertainty stance, and deliberate limits.

**Create**

4. **Analyse an ad** — open the local analysis workflow for a new advertisement.

`Inspect` is not primary navigation. It is an expert structure view entered from a specific analysis when the user deliberately wants to inspect the underlying analytical layers.

Technical route names remain implementation details:

| Public label      | Route             | Role                                                                                           |
| ----------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| Archive home      | `/`               | Editorial entry point: archive proposition, featured analyses, concepts, method, then creation |
| Analyses          | `/cases`          | Browse/search the reference collection and uploaded analyses                                   |
| Analysis detail   | `/cases/[caseId]` | Argument-led reading: synthesis + ranked evidence + possible readings                          |
| Concepts          | `/glossary`       | Glossary/reference browser and concept-to-analysis links                                       |
| Method            | `/method`         | Evidence-first method, Williamson inspiration, uncertainty, and limits                         |
| Analyse an ad     | `/analyse`        | Local image-analysis creation workflow                                                         |
| Structure view    | `/workbench`      | Expert layer-by-layer inspection of a selected analysis                                        |
| Uploaded analysis | `/decoded`        | Compatibility surface for a result created directly through the analyser                       |

## Core reading hierarchy

Analysis detail is an archive object first and an analytical argument second:

```text
Brand · year/context
  → Analytical title
      → Advertisement + Overall interpretation
          → Evidence and interpretation
              → Concepts used in the analysis
                  → About this interpretation / Analysis map
```

The advertisement and thesis share the primary composition. A large generated-summary panel must not precede or visually overpower the source advertisement.

### Reader-facing grammar

The default reading surface uses ordinary analytical language:

- **Observation** — something directly visible or readable in the advertisement.
- **Interpretation** — a possible meaning built from that visible evidence.
- **Concept** — theory that helps connect the concrete ad to a broader pattern of meaning.

Internal epistemic classifications such as Observed, Inferred, Synthesized, confidence, location, evidence IDs, and support counts remain available through expert/contextual detail rather than competing with the argument.

### Progressive disclosure

Default reading mode should satisfy most visitors without exposing the schema.

- Show the advertisement and overall interpretation together.
- Show the three highest-leverage observations first; reveal remaining observations on request.
- Each observation exposes its strongest linked interpretation directly.
- One observation expansion may reveal additional linked interpretations; Case detail does not nest interpretation accordions inside evidence accordions.
- Concepts are gathered into their own later section instead of repeated as dominant taxonomy throughout the page.
- Method, confidence, provenance, and evidence-graph mechanics are subordinate and link to Method or Analysis map.

## Cross-surface navigation

Analytical objects should be connected rather than dead-ended:

- A concept opens **Concepts** with that concept selected and origin context preserved where possible.
- Supporting-evidence rows jump to the relevant visible detail.
- Analysis detail can open the same item in **Analysis map**.
- Previous/next navigation supports continuous browsing through analyses.
- Source attribution/open-original links remain available where known.

## Archive home

The homepage establishes Signum as an archive before exposing creation tools. Its reading order is:

1. what Signum is — an archive of decoded advertisements;
2. why the archive matters — ads construct cultural meaning, values, identities, and assumptions;
3. real featured analyses, with the advertisements visually dominant;
4. recurring concepts that lead back into the analysis collection;
5. a concise explanation of how Signum reads ads;
6. methodological grounding and uncertainty;
7. only then, a secondary invitation to analyse a new advertisement.

The homepage must not contain the dropzone or lead with model/runtime language. The first viewport should show the archive proposition and at least part of the featured analysis material on ordinary desktop sizes.

## Analyse surface

`/analyse` owns the creation workflow. It may use more operational language because the user has deliberately chosen to create a new analysis. The upload action is primary there; local-processing and method explanation are supporting context.

## Analyses surface

The collection behaves like an image-first creative contact sheet. Card hierarchy is **image → Brand · Year → analytical title** when governed archive metadata exists. Observation counts, interpretation counts, evidence-type counts, confidence, and concept taxonomy do not belong on the default archive card. Missing brand/year context is left absent rather than guessed.

A small curated flagship set may be promoted ahead of the general collection. Curation is an editorial showcase decision, not a claim that those analyses are more objectively correct.

Search covers visible details, interpretations, and concepts in addition to titles. Sorting defaults to featured-first and can switch to title or evidence density. A concept drilldown enters the collection through `?concept=<id>` and keeps that concept visible as active context.

Search and filtering should describe user-visible state, not persistence mechanics.

## Analysis map surface

`/workbench` is not a human approval workflow and not currently a multi-analysis comparison tool. **Analysis map** is a contextual expert view entered from a specific analysis when the reader wants the underlying analytical layers, evidence relationships, confidence, provenance, or technical structure.

It is deliberately absent from primary global navigation. The implementation may retain internal `workbench` naming.

## Concepts surface

Concepts is the expert reference layer. It can use rigorous terminology that the primary analysis UI deliberately demotes. It supports movement from concept → related concepts → linked ad previews → the filtered Analyses collection.

The full curated concept set is an authority concern of the glossary/content system, not merely the subset currently used in Cases.

## Method surface

`/method` is a concise public explanation of the analytical contract, not an academic essay or implementation manual. It makes four things explicit:

1. visible detail precedes interpretation;
2. interpretations are supported readings rather than ground truth;
3. Judith Williamson's _Decoding Advertisements_ is methodological inspiration, not affiliation;
4. the public showcase is static and does not expose the local model service.

It should link back into a worked analysis and the Concepts browser so methodology remains connected to the product rather than becoming detached documentation.

## Empty-state rule

An empty state says:

1. what is missing;
2. what the user can do next.

Avoid generic "nothing here" copy and internal status language when an outcome-oriented explanation is available.
