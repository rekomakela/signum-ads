# 02 — Corpus and analysis model

## Purpose

This document owns the stable conceptual relationship between archival advertisement identity, perceptual evidence, interpretation, controlled vocabulary, provenance, and corpus relationships.

Exact current persistence and Decode field names remain owned by the TypeScript contracts and Case Library routed in `docs/AUTHORITY.md`.

## Foundational rule

> **The Advertisement is the archival object. A DecodeRevision is a versioned analytical interpretation attached to it.**

The ontology models advertising culture and corpus analysis. It does **not** mirror whatever object shapes the current decoder happens to expose.

## Five information planes

### 1. Corpus facts

What the Advertisement _is_:

```text
Advertisement
├─ Asset[]
├─ Brand[]
├─ Product[]
├─ Campaign?
├─ Placement[]
├─ Market[]
├─ TemporalExtent
├─ AcquisitionSource[] (via Assets)
└─ MetadataAssertion[]
```

These are factual archival assertions. They require provenance when not self-evident from the Asset itself.

### 2. Perceptual evidence

What is actually present:

```text
Advertisement / Asset
    ↓
Observation[]
```

Observations remain descriptive and do not smuggle in interpretation.

### 3. Interpretation

What the Advertisement appears to claim and what Signum argues about how it works:

```text
AdvertiserClaim
Interpretation
EvidenceLink
Signifier → Signified
AudiencePosition
```

AdvertiserClaim and Interpretation are intentionally different entities.

### 4. Controlled analytical vocabulary

Reusable governed classifications:

```text
MeaningMechanism
ReferentSystem
CulturalCode
Ideology
SocialConcept
PersuasionTechnique
EmotionalLever
TheoreticalConcept
```

These families answer different questions and must not collapse into one generic concept bucket.

### 5. Corpus relationships

How Advertisement objects relate:

```text
belongs_to_campaign
variant_of
references_advertisement
responds_to_advertisement
shared concepts (derived)
shared mechanisms (derived)
chronological relationships (derived)
```

## Analytical chain

The canonical conceptual chain is:

```text
Advertisement
  ↓ contains / is perceived through
Observation
  ↓ may function as
Signifier
  ↓ evokes
Signified
  ↓ draws on / activates
ReferentSystem
CulturalCode
  ↓ through
MeaningMechanism
  ↓ supports
Interpretation
  ↓ may identify
AudiencePosition
Ideology
TheoreticalConcept
  ↓ synthesized as
Interpretation(kind = thesis)
```

And the evidence invariant remains explicit:

```text
Interpretation
    ↑
EvidenceLink
    ↑
Observation
```

No amount of taxonomy replaces that evidence relationship.

## AdvertiserClaim vs Interpretation

### AdvertiserClaim

The proposition the Advertisement asks the viewer to accept.

It may be:

- **explicit** — directly stated in copy;
- **implied** — constructed through the creative without direct verbal assertion.

### Interpretation

Signum's analytical proposition about how meaning/persuasion is constructed.

Current runtime claim kinds map conceptually as follows:

| Current runtime kind | Target conceptual home            |
| -------------------- | --------------------------------- |
| `core_message`       | primarily AdvertiserClaim         |
| `semiotic`           | Interpretation                    |
| `persuasion`         | Interpretation                    |
| `audience`           | Interpretation + AudiencePosition |
| `interpretation`     | Interpretation                    |

This mapping is conceptual only in v0.1; **do not change `decode-draft.v1` in this authority slice**.

## Thesis

The current “overall reading” should conceptually be an `Interpretation(kind = thesis)` rather than a disconnected summary blob.

A thesis may reference lower-level Interpretations and/or their EvidenceLinks. This makes synthesis queryable and auditable.

Current runtime summary fields remain unchanged until schema migration is designed separately.

## Counter-readings and analytical relationships

CounterReading is not a separate target class.

Interpretations may relate to one another through:

- `supports`;
- `challenges`;
- `qualifies`;
- `extends`;
- `contradicts`;
- `alternative_to`.

A counter-reading is an Interpretation with an appropriate stance/relationship.

## MeaningMechanism

MeaningMechanism answers:

> **How is meaning being produced?**

Examples include metaphor, metonymy, visual analogy, substitution, juxtaposition, contrast, omission, exaggeration, anchorage, relay, intertextuality, personification, repetition, and idealization.

Keep it distinct from:

- **CulturalCode** — what shared cultural meaning/convention is invoked;
- **PersuasionTechnique** — how influence is attempted;
- **TheoreticalConcept** — what framework explains the phenomenon.

## Controlled concept governance

Every reusable controlled concept has permanent stable identity. The target shape is defined in `content/ontology/controlled-concept-model.v0.1.yaml`.

Core rules:

1. IDs are permanent; labels/definitions may evolve.
2. Aliases resolve to one canonical ID.
3. A decoder may propose a **candidate**, but never silently create canonical vocabulary.
4. Broader/narrower/related relations are explicit.
5. Positive and negative examples help constrain scope.
6. Deprecated concepts retain identity and point to replacements when applicable.

## Time semantics

Historical chronology is corpus identity, not display decoration.

Target temporal shape:

```yaml
temporal:
  start_year: 1987
  end_year: 1987
  precision: year
```

Precision values:

`exact_date · month · year · circa_year · range · decade · unknown`

The UI derives human labels such as `1987`, `c. 1987`, or `1987–1989`.

A Reddit/Ads-of-the-World/agency-page timestamp is an **AcquisitionSource fact**, not automatically the Advertisement's publication date.

## Factual metadata provenance

Interpretive evidence and archival provenance are separate systems.

### Interpretive evidence

> This Observation supports this Interpretation.

### Factual provenance

> This SourceReference supports the assertion that the Advertisement dates from 1987.

Target shape:

```yaml
metadata_assertions:
  - field: temporal.start_year
    value: 1987
    certainty: confirmed
    source_refs: [source_123]
```

Possible certainty values are `confirmed`, `probable`, `possible`, and `unknown`.

Model guesses never silently become archive facts.

## DecodeRevision

One Advertisement may have multiple DecodeRevisions:

```text
Advertisement
├─ DecodeRevision v1
├─ DecodeRevision v2
└─ DecodeRevision v3
```

Each revision preserves at minimum:

- model;
- model version;
- analysis schema version;
- ontology version;
- generated-at timestamp;
- prompt/pipeline version.

Re-analysis appends history rather than silently overwriting the previous analytical state.

## Three graph edge types

### Asserted factual

High-authority corpus relationships backed by provenance:

```text
Advertisement → Brand
Advertisement → Campaign
Advertisement → Product
Advertisement → Placement
Advertisement → variant_of → Advertisement
```

### Analytical

Contestable relations belonging to a DecodeRevision:

```text
Observation → Signifier
Signifier → Signified
Interpretation → MeaningMechanism
Interpretation → CulturalCode
Interpretation → Ideology
```

### Derived

Computed from corpus structure:

```text
shared concepts
shared mechanisms
same brand
chronological distance
```

Derived edges should normally be regenerable, not persisted as timeless truth.

## Acceptance test before scale

Before mass acquisition, a deliberately heterogeneous 50-ad corpus should demonstrate that the model can represent:

- several Assets for one Advertisement;
- duplicate Assets without duplicate Advertisement identity;
- canonical Brand resolution and aliases;
- exact, approximate, range, and unknown time;
- Campaign membership;
- Placement separate from AcquisitionSource;
- evidence-traceable Interpretations;
- AdvertiserClaim separate from Signum Interpretation;
- MeaningMechanism separate from CulturalCode/PersuasionTechnique/TheoreticalConcept;
- stable controlled IDs;
- multiple DecodeRevisions;
- counter/alternative readings;
- graph edge epistemic types;
- queries such as Brand × Time, Brand × Mechanism, Concept × Time, and CulturalCode × Time without parsing prose.

If the heterogeneous corpus breaks the ontology, fix the ontology before scaling acquisition.

## Current runtime compatibility boundary

Corpus Model v0.1 is target authority. Current implementation still uses `Case`, `Decode`, `Claim`, `TargetAudience`, current controlled-vocabulary reference types, and legacy storage names.

This authority change **does not** modify:

- `src/contracts/decode-draft-v1.ts`;
- `src/validation/decode-draft-validator.ts`;
- Case Library persistence/layout;
- current model prompt/output contract;
- current corpus files.

Any migration of those surfaces requires a separate design, compatibility strategy, and executable verification.
