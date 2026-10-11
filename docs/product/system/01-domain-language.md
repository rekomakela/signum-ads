# Signum — Ubiquitous Language

This document defines target domain language for the Signum corpus. Current TypeScript/storage names may lag behind it; exact mutable field names remain code/schema concerns.

## Foundational distinction

> **The Advertisement is the archival object. A DecodeRevision is a versioned analytical interpretation attached to it.**

Do not use Asset, Case, Decode, or DecodeRevision as synonyms for Advertisement.

## Corpus facts

### Advertisement

The canonical real-world creative execution preserved by Signum. It has stable corpus identity independent of any specific image file or analysis revision.

Two scans/crops/resolutions of one creative may be one Advertisement. Two genuinely different creative executions are separate Advertisements even if they belong to the same Campaign.

### Asset

A concrete media representation of an Advertisement: scan, image, crop, resolution variant, or later another supported media form.

`sha256` identifies Asset bytes. It does not identify the real-world Advertisement.

### Brand

A canonical advertiser/brand identity with a permanent ID and aliases. Brand is first-class corpus identity, not an arbitrary string.

### Product

An item, service, platform, cause, idea, or product family promoted by an Advertisement. One Advertisement may promote more than one Product.

### Campaign

A related group of Advertisement executions united by a creative, strategic, temporal, or media program. Campaign is active corpus structure, not future-only scope.

### Placement

A known occurrence of an Advertisement in a publication, platform, location, format, or media context.

Example: `Vogue UK · September 1987 · United Kingdom · full-page print`.

Placement describes where the Advertisement appeared. It is not where Signum obtained its copy.

### Market

A geographic, linguistic, regulatory, or commercial context in which an Advertisement or Placement circulated.

### TemporalExtent

A time value that preserves uncertainty and precision. Supported precision semantics are:

`exact_date · month · year · circa_year · range · decade · unknown`

Never convert uncertainty into false precision merely because a database prefers one year value.

### AcquisitionSource

Where Signum obtained an Asset: archive, ad library, agency site, Reddit/community post, scan collection, or user submission.

AcquisitionSource is distinct from Placement and from SourceReference.

### MetadataAssertion

A factual corpus metadata assertion with value, certainty, and source references. It is how disputed or uncertain facts such as date/campaign membership can remain auditable.

Model guesses must never silently become MetadataAssertions.

## Analysis revisions

### DecodeRevision

An immutable/versioned analytical interpretation attached to an Advertisement.

A DecodeRevision preserves at minimum the model/pipeline/schema/ontology provenance necessary to understand how the analysis was produced. Re-analysis creates another revision rather than silently overwriting the previous one.

### Decode

**Current runtime compatibility term.** The existing machine-generated `decode-draft.v1` object is terminal machine output for one run and is the implementation precursor to DecodeRevision.

Do not infer from the current Decode shape that the corpus ontology must have the same shape.

### Case

**Current storage compatibility term.** A Case is the current Case Library record that bundles source material and, when available, a Decode.

Target corpus identity is Advertisement, not Case.

## Perceptual evidence

### Observation

A directly visible/readable/perceptible fact about an Advertisement stated without interpretive conclusion.

An Observation answers: **What is actually present?**

### Evidence

An Observation considered in the role of supporting, challenging, or failing to support an analytical proposition.

### EvidenceLink

The explicit support relationship connecting an Interpretation or identified AdvertiserClaim to one or more Observations. EvidenceLink belongs to analytical reasoning, not corpus metadata provenance.

## Interpretation

### AdvertiserClaim

What the Advertisement asks the viewer to believe, explicitly or implicitly.

Example: _The Defender can take you anywhere._

The current runtime `core_message` claim kind maps most naturally to AdvertiserClaim.

### Interpretation

A contestable Signum proposition about how an Advertisement creates meaning, persuades, positions an audience, or participates in ideology.

Example: _By making passport stamps form the vehicle, travel experience becomes a symbolic property of owning the Defender._

Interpretation kinds may include thesis, semiotic, persuasion, audience, ideology, or other governed facets.

### Thesis

Not a separate ontology class. **Thesis is `Interpretation(kind=thesis)`**, synthesizing the broader argument from lower-level evidence and interpretations.

### Counter-reading

Not a separate core class. A counter-reading is an Interpretation with a counter/alternative stance and a typed relation to another Interpretation, such as `challenges`, `qualifies`, `contradicts`, or `alternative_to`.

### Signifier

A perceptible element functioning as a carrier of meaning in an analytical reading.

### Signified

The meaning, value, quality, or association evoked/acquired by a Signifier in context.

### AudiencePosition

The subject/viewer position, identity, role, or relation to the world that an Advertisement constructs or invites.

Use AudiencePosition in the target corpus model. **TargetAudience** remains a current runtime compatibility label where needed.

## Controlled analytical vocabulary

### MeaningMechanism

How meaning is being produced: for example metaphor, metonymy, visual analogy, substitution, juxtaposition, contrast, omission, exaggeration, anchorage, relay, intertextuality, personification, repetition, or idealization.

MeaningMechanism is distinct from CulturalCode, PersuasionTechnique, and TheoreticalConcept.

### ReferentSystem

A broader social/cultural domain of meaning that signs draw upon.

### CulturalCode

A culturally learned convention, association, identity marker, opposition, or shared meaning activated by an Advertisement.

### Ideology

A broader system of assumptions, values, or social relations that an Interpretation argues the Advertisement may normalize, naturalize, or reproduce.

### SocialConcept

A governed social/cultural analytical concept used as reusable vocabulary.

### PersuasionTechnique

A governed method by which an Advertisement attempts to influence an audience.

### EmotionalLever

A governed emotion or affective pressure an Advertisement relies on or activates.

### TheoreticalConcept

A concept from a theoretical/critical framework used to explain an Interpretation, such as commodity fetishism, subject position, or denotation/connotation.

### Controlled Concept

A reusable concept with a permanent stable ID. Labels and definitions may evolve; IDs do not.

A decoder may propose a candidate concept but must never silently create canonical vocabulary.

### Glossary entry

A reader-facing presentation of a controlled concept. **GlossaryEntry is not a core corpus entity.**

## Provenance and sources

### SourceReference

An auditable citation used to ground theory or factual MetadataAssertions.

It is distinct from:

- **Placement** — where the Advertisement appeared;
- **AcquisitionSource** — where Signum obtained an Asset;
- **EvidenceLink** — what visible evidence supports an Interpretation.

The generic term **Source** is too ambiguous for canonical corpus modeling; use the specific term.

## Graph relations

Every corpus graph edge has an epistemic type:

- **asserted factual** — provenance-backed corpus fact;
- **analytical** — contestable relation belonging to a DecodeRevision;
- **derived** — computed/regenerable relationship such as shared concepts or years apart.

Derived edges should normally be regenerated rather than stored as timeless truth.

## Terms to avoid as target domain language

### Claim

Ambiguous. Split into **AdvertiserClaim** (what the ad asks us to believe) and **Interpretation** (what Signum argues about the ad). Current runtime identifiers may retain `claim` until migration.

### CounterReading as a class

Use Interpretation stance/relationships instead.

### TargetAudience as target ontology

Use **AudiencePosition**. Runtime compatibility may retain TargetAudience.

### GlossaryEntry as core ontology

The glossary is a presentation projection of controlled concepts.

### Source

Too ambiguous. Use Placement, AcquisitionSource, or SourceReference.

### Draft / Reviewed / Canonical Export

Do not reintroduce the retired human-review/export lifecycle. A valid current Decode is terminal output for its run; the corpus may later preserve it as a DecodeRevision.
