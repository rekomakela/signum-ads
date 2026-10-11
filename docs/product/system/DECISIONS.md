# Signum current decisions

This register records durable current product/design decisions. It does not track implementation progress. A later entry may explicitly supersede an earlier decision within its stated scope.

## SDEC-001 — Machine Decode is terminal output for a decode run

**Status:** active within the current Decode workflow; superseded as the overall product-identity framing by SDEC-018.

A generated Decode does not require human review, approval, or canonical export promotion. This is a lifecycle rule for the current decode workflow, not a statement that Decode is the archival object of Signum.

Primary background: `docs/adr/0003-machine-decode-is-the-product.md`.

## SDEC-002 — Evidence and inference remain separate

**Status:** active

Visible Observations/Evidence must remain distinguishable from Claims/Interpretations. Interpretations must be traceable to supporting evidence where the contract supports that relationship.

## SDEC-003 — Plain-language UI, rigorous expert layer

**Status:** active

Primary product language follows:

```text
What the ad shows → What it may mean → Why that interpretation fits
```

Internal/domain terms such as Decode, Observation, Claim, Evidence Link, Referent System, and Corpus may remain in code, contracts, and Concepts. They should not be prerequisites for using the primary UI.

## SDEC-004 — Local-first analysis

**Status:** active

The core image-analysis workflow uses the local model/runtime seam. Signum has no cloud-account or multi-user product requirement. The local Decode server is not an Internet-facing production service.

## SDEC-005 — Progressive disclosure is the default density strategy

**Status:** active

Primary meaning stays visible; supporting analytical depth opens in place. Analysis detail starts with archive context, Advertisement + Overall interpretation, then shows a bounded set of key Observation → Interpretation units. Additional readings may expand once; evidence-graph mechanics stay in Analysis map. Deep structures do not auto-open on first load.

## SDEC-006 — One sans typographic voice

**Status:** active

Product UI and wordmarks do not use serif typography. IBM Plex Sans is the display/reading/UI face; monospace is reserved for genuine identifiers/data.

## SDEC-007 — Analytical objects are navigable

**Status:** active

Concepts link to the Concepts browser, evidence traces link back to visible details, analyses can open in Inspect, and adjacent analyses are browsable. Simplification must not remove useful analytical navigation.

## SDEC-008 — Judith Williamson is explicit methodological inspiration

**Status:** active

The UI and product documentation state that Signum is inspired by Judith Williamson's _Decoding Advertisements: Ideology and Meaning in Advertising_ (1978). This is intellectual attribution, not affiliation or endorsement.

## SDEC-009 — Public showcase is static-first

**Status:** active

The public-facing showcase may be published as static frontend output. Public deployment does not imply that the local decode runtime is exposed. Any future hosted interactive analysis service requires a separate architecture/security decision.

## SDEC-010 — Method is a first-class public surface

**Status:** active

`/method` explains Signum's evidence-first analytical model, Judith Williamson inspiration, epistemic uncertainty, local-first architecture, and deliberate limits. It is part of primary navigation because these constraints are central to interpreting the product correctly.

## SDEC-011 — Showcase curation is explicit and bounded

**Status:** active

A small deterministic set of flagship analyses is promoted on the archive surfaces. Cards are image-led and use curated **Brand · Year → analytical title** context when known; analytical counts and taxonomy stay off the default card. Curation optimizes the public showcase for breadth and explanatory value; it does not imply stronger truth or model confidence.

## SDEC-012 — Concepts drill into the analysis collection

**Status:** active

Concepts expose linked ad previews and a concept-filtered Analyses view. The route contract uses `?concept=<id>` so a concept-to-ad exploration can be shared without adding a second concept-specific archive implementation.

## SDEC-013 — Case detail is argument-led, not schema-led

**Status:** active

Analysis detail is object-first and argument-led: archive context and analytical title identify the ad, then the **Advertisement** and **Overall interpretation** share the primary composition. Ranked evidence follows, then concepts, then optional method/provenance. The source object must not be visually subordinated to a generated-output panel. Evidence order reflects interpretive leverage rather than detection order.

## SDEC-014 — Epistemic status leads taxonomy

**Status:** active

The public Case reading surface does not require readers to decode **Observed / Inferred / Synthesized** badges, confidence, location, evidence IDs, or support counts. Natural-language **Observation → Interpretation** is the default grammar. Epistemic status, confidence, provenance, and evidence-graph mechanics belong in contextual expert detail such as the Analysis map. A Case evidence item has at most one reading disclosure level.

## SDEC-015 — Public identity is archive-first

**Status:** active

The public homepage presents Signum first as an archive of decoded advertisements. Existing ads, curated archive context and analytical titles, recurring concepts, and methodological framing precede creation. The image analyser lives at `/analyse` and is a secondary workflow, not the homepage proposition.

## SDEC-016 — Analysis map is contextual expert navigation

**Status:** active

The structure/Workbench view remains available from an individual analysis but is not a primary global navigation destination. Global navigation is grouped as **Explore** (Analyses, Concepts), **Learn** (Method), and **Create** (Analyse an ad).

## SDEC-017 — Archive context is curated, never guessed

**Status:** active

Brand, year/date context, and analytical titles are editorial archive metadata rather than model output. Exact or approximate years appear only when independently established; unknown chronology remains absent instead of being inferred from a source-post timestamp, slug, or title. Archive cards use **image → Brand · Year → analytical title** when that metadata exists.

## SDEC-018 — Advertisement is the archival object

**Status:** active

The Advertisement is the canonical corpus object. Asset bytes, current Case records, and Decode output are representations or enrichments attached to that archival identity. A future persisted DecodeRevision is versioned analytical history attached to an Advertisement. This decision supersedes SDEC-001 only where SDEC-001 was previously read as the overall product identity.

## SDEC-019 — Brand and Campaign are active corpus structure

**Status:** active

Brand is first-class corpus identity with stable IDs and aliases. Campaign is active archival structure rather than `future_only`. Historical analysis and graph queries must not require parsing Brand/Campaign names from prose. This explicitly supersedes the June 2026 assumptions that Brand was non-core and Campaign was future-only.

## SDEC-020 — AdvertiserClaim and Interpretation are distinct

**Status:** active

The ambiguous target-domain term `Claim` is split: **AdvertiserClaim** is what the advertisement asks the viewer to believe; **Interpretation** is what Signum argues about how the advertisement works. `core_message` maps conceptually toward AdvertiserClaim; semiotic/persuasion/audience/general readings map toward Interpretation. Current runtime field names remain unchanged until a separate migration.

## SDEC-021 — Corpus chronology and metadata keep provenance and uncertainty

**Status:** active

Time uses explicit precision (`exact_date`, `month`, `year`, `circa_year`, `range`, `decade`, `unknown`). Placement, AcquisitionSource, and SourceReference are separate concepts. Factual corpus metadata uses provenance-bearing assertions; source-post timestamps or model guesses do not silently become advertisement dates or campaign facts.

## SDEC-022 — Corpus graph edges declare epistemic type

**Status:** active

Graph relations are either **asserted factual**, **analytical**, or **derived**. Derived similarity/chronology edges are computed and regenerable by default. Controlled vocabulary IDs are permanent; decoder-proposed unknown concepts become candidates and never silently mutate canonical vocabulary.
