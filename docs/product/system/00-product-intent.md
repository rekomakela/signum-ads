# Signum — Product Truth

## Product

**Signum is an archive of decoded advertisements. Decoding is the enrichment mechanism, not the archival object.**

The foundational corpus rule is:

> **The Advertisement is the archival object. A DecodeRevision is a versioned analytical interpretation attached to it.**

This means an advertisement can exist in the corpus before analysis, can have multiple source Assets and Placements, and can accumulate multiple DecodeRevisions over time without losing its identity or intellectual history.

The public reading model remains:

**What is this ad? → What is the central interpretation? → Why is that interpretation defensible?**

The expert analytical model preserves visible evidence, interpretation, concepts, provenance, and uncertainty without making the runtime Decode schema define the corpus ontology.

## Audience

Primary audience:

- advertising strategists and planners;
- creative directors and copy/art teams;
- brand and cultural researchers;
- semiotics, persuasion, and advertising-analysis practitioners;
- researchers interested in advertising history and change over time.

Secondary audience:

- technically curious practitioners exploring inspectable AI-assisted analysis;
- builders interested in structured multimodal analysis and corpus modeling.

## Methodological inspiration

Signum is inspired by Judith Williamson’s _Decoding Advertisements: Ideology and Meaning in Advertising_ (1978), particularly its attention to how advertisements connect visible signs with systems of meaning and ideology.

Signum is an independent software project; this inspiration does not imply affiliation with or endorsement by Judith Williamson or the book’s publisher.

## User jobs

1. Explore a historical archive of advertisements as canonical archival objects.
2. Browse by Brand, time, Campaign, Product, concepts, and analytical patterns as metadata becomes governed.
3. Open an Advertisement and understand its central thesis before inspecting evidence.
4. Trace Interpretations back to Observations and controlled analytical concepts.
5. Compare patterns across advertisements without collapsing corpus facts into model guesses.
6. Use Concepts and Method to understand and challenge the analytical framework.
7. Analyse a new advertisement to enrich the corpus with a new DecodeRevision.

## Corpus Model v0.1 boundary

The target corpus has five information planes that must remain distinct:

1. **Corpus facts** — Advertisement, Asset, Brand, Product, Campaign, Placement, Market, TemporalExtent, AcquisitionSource, factual metadata assertions.
2. **Perceptual evidence** — Observation.
3. **Interpretation** — AdvertiserClaim, Interpretation, EvidenceLink, signifier/signified roles.
4. **Controlled analytical vocabulary** — MeaningMechanism, ReferentSystem, CulturalCode, Ideology, SocialConcept, PersuasionTechnique, EmotionalLever, TheoreticalConcept, AudiencePosition.
5. **Corpus relationships** — campaign membership, variants, references/responses, and derived similarity/chronology relationships.

Do not let one plane silently substitute for another. In particular:

- acquisition provenance is not original placement;
- a source-post timestamp is not the advertisement date;
- a model interpretation is not a corpus fact;
- a controlled concept does not prove an interpretation;
- two image files are not necessarily two Advertisements.

Canonical target detail lives in `content/ontology/corpus-model.v0.1.yaml` and `docs/product/system/02-analysis-model.md`.

## Public product hierarchy

The public showcase is archive-first. Existing advertisements, curated Brand/time context, analytical titles, recurring concepts, and methodological framing precede creation.

The archive should feel like an editorial/research publication rather than a SaaS dashboard. Advertisement imagery and archival context lead; runtime status, model mechanics, and uploader controls belong to creation/expert surfaces.

## Product stance

A valid machine Decode remains terminal machine output for its generation run: there is no human-review promotion or canonical export gate.

That runtime lifecycle rule does **not** make the Decode the archival identity of the product. In the corpus model, a Decode becomes a **DecodeRevision** attached to an Advertisement. Re-analysis appends intellectual history instead of silently replacing it.

Interpretations are contestable readings, not objective ground truth. Evidence exists so a user can inspect, challenge, or disagree with the reasoning.

## Differentiation

Signum is not differentiated by asking a multimodal model to “analyze an ad.”

It is differentiated by combining a governed advertising corpus with inspectable analysis where:

- Advertisement identity is independent of Asset bytes and Decode output;
- Brand/time/Campaign context is provenance-bearing corpus data;
- observations remain separate from interpretation;
- advertiser propositions remain separate from Signum interpretations;
- Interpretations point back to evidence;
- controlled analytical families remain distinct;
- multiple DecodeRevisions and alternative readings can coexist;
- graph relationships declare whether they are factual, analytical, or derived.

## Core surfaces

- **Archive home** (`/`) — editorial entry point into advertisements and recurring patterns.
- **Analyses** (`/cases`) — browse/search the current corpus projection.
- **Analysis detail** (`/cases/[caseId]`) — Advertisement + Overall interpretation → evidence → concepts → optional method/provenance.
- **Concepts** (`/glossary`) — controlled analytical vocabulary and concept-to-ad exploration.
- **Method** (`/method`) — analytical method, Williamson grounding, uncertainty, and limits.
- **Analyse an ad** (`/analyse`) — secondary creation/enrichment workflow.
- **Analysis map** (`/workbench`) — contextual expert view of the current analytical structure.
- **Uploaded analysis** (`/decoded`) — compatibility surface for direct image-analysis results.

## Current implementation boundary

Corpus Model v0.1 is target authority, not a claim that persistence has already migrated.

Current implementation still uses:

- Case Library records as the storage container;
- one primary Asset per current Case;
- `decode-draft.v1` as the current machine output contract;
- current controlled-vocabulary reference types;
- legacy `draft.json` storage naming.

Do not change those runtime contracts merely to make them resemble the target ontology. Storage/schema migration requires a separate explicit implementation decision and compatibility plan.

## Accessibility and interaction commitments

- Keyboard-accessible controls and visible focus states.
- Semantic native controls where possible.
- Progressive disclosure for secondary analytical detail.
- Reduced-motion preferences respected.
- Plain language first; expert vocabulary remains available underneath.

## Language commitments

Primary UI:

- Advertisement / ad
- Analysis
- Observation / visible detail
- Interpretation
- Supporting evidence
- Concept
- Brand / year where governed
- Analysis map

Target corpus/expert language additionally includes:

- Brand
- Product
- Campaign
- Placement
- Market
- TemporalExtent
- AcquisitionSource
- DecodeRevision
- AdvertiserClaim
- MeaningMechanism
- AudiencePosition
- MetadataAssertion

Current runtime code may continue to contain legacy terms such as Case, Decode, Claim, TargetAudience, and `draft.json` until migrated explicitly.

## Brand/content constraints

- No serif typography in product UI or wordmark.
- Do not present Signum as an authority that determines the single correct meaning of an advertisement.
- Third-party advertisements remain analysis material; attribution/provenance should remain available where known.
- The local decode server is not an Internet-facing multi-user production service.

## Success criteria

The corpus model is successful when heterogeneous historical material can be represented without inventing structural categories and without parsing prose to answer core queries such as:

- Brand × Time;
- Brand × MeaningMechanism;
- CulturalCode × Time;
- Campaign × Advertisement;
- Concept × Time.

Unknown dates must remain unknown, approximate dates approximate, and factual metadata provenance auditable.
