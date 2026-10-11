# Signum Corpus Model v0.1 — ontology decisions

## Status

**Canonical target ontology foundation.** Last reconciled: 2026-08-29.

Primary artifacts:

- `content/ontology/corpus-model.v0.1.yaml`
- `content/ontology/core-classes.v1.yaml`
- `content/ontology/core-relationships.v1.yaml`
- `content/ontology/controlled-concept-model.v0.1.yaml`
- `content/mappings/ontology-class-decisions.v1.yaml`

The older split layer manifest at `content/ontology/ontology.yaml` is retained as imported source material, not master product ontology.

## Foundational decision

> **The Advertisement is the archival object. A DecodeRevision is a versioned analytical interpretation attached to it.**

This supersedes the previous ontology-foundation assumption that the canonical class set should largely mirror current decoder/runtime object shapes.

## Superseded assumptions

The following June 2026 foundation decisions are no longer active:

1. **Exactly 20 classes** — superseded. Class count follows the domain, not an implementation budget.
2. **Brand is not a class** — superseded. Brand is first-class corpus identity (`SIG-C-21`).
3. **Campaign is future-only** — superseded. Campaign is active archival structure (`SIG-C-04`).
4. **Claim is one first-class analytical entity** — superseded. The target model separates AdvertiserClaim (`SIG-C-25`) from Interpretation (`SIG-C-14`).
5. **CounterReading is a separate class** — superseded. It folds into Interpretation stance/relationships.
6. **TargetAudience is the target audience model** — superseded. The target class is AudiencePosition (`SIG-C-27`); TargetAudience remains compatibility terminology.
7. **GlossaryEntry is a core ontology class** — superseded. Glossary is presentation generated from controlled concepts.
8. **Runtime contract shape determines ontology** — superseded. Runtime is a compatibility projection of the corpus model until migrated explicitly.

## Active class model

`core-classes.v1.yaml` contains **27 active canonical classes** across corpus identity/context/provenance, analysis revisions, evidence/interpretation, semiotic structure, controlled vocabulary, and governance.

Four old labels are retained only as compatibility records:

- Claim;
- CounterReading;
- TargetAudience;
- GlossaryEntry.

Stable historical IDs are not reused for unrelated meanings.

## Brand

Brand is first-class because corpus-scale work requires stable identity, alias resolution, and longitudinal queryability.

Target minimum shape includes:

```yaml
id:
canonical_name:
aliases: []
parent_organization_id:
country_of_origin:
status:
```

The current small curated frontend `brand` string is presentation metadata, not yet the canonical persisted Brand entity.

## Campaign

Campaign is active because historical advertising structure cannot be recovered reliably from flat per-ad analysis alone.

An Advertisement may belong to a Campaign; a Campaign may belong to a Brand and contain multiple Advertisement executions.

## Placement vs AcquisitionSource vs SourceReference

The old generic `Source` concept was ambiguous and is split:

- **Placement** — where the Advertisement appeared;
- **AcquisitionSource** — where Signum obtained the Asset;
- **SourceReference** — citation grounding theory or factual metadata.

These must never be conflated.

## Claim split

**AdvertiserClaim** = what the ad asks the viewer to believe.

**Interpretation** = what Signum argues about how the ad constructs meaning/persuasion.

Current runtime `core_message` maps most naturally to AdvertiserClaim; other current claim kinds map to Interpretation facets. This is conceptual mapping only until a separate schema migration.

## Thesis

Thesis is `Interpretation(kind=thesis)`, not a parallel summary species. It may synthesize lower-level Interpretations/EvidenceLinks.

## Counter-reading

Counter-reading becomes an Interpretation stance/relationship. Supported relations include challenge, qualification, extension, contradiction, and alternative.

## MeaningMechanism

MeaningMechanism is a first-class controlled family answering **how meaning is produced**. It is distinct from CulturalCode, PersuasionTechnique, EmotionalLever, and TheoreticalConcept.

## Temporal semantics

Time preserves precision: exact date, month, year, circa year, range, decade, or unknown. Unknown/approximate historical context must never be converted into false exactness.

## Metadata provenance

Corpus facts may be represented as MetadataAssertions with certainty and SourceReferences. This provenance system is separate from interpretive EvidenceLinks.

## Decode revisions

Re-analysis creates a new DecodeRevision. A revision preserves model, model version, analysis schema, ontology version, generation timestamp, and pipeline/prompt version where available.

## Graph epistemics

Every relationship declares one of:

- **asserted_factual**;
- **analytical**;
- **derived**.

Derived similarity/chronology edges are computed/regenerable by default.

## Controlled concept governance

Controlled concept IDs are permanent. Labels may evolve. Decoder-proposed unknown concepts enter candidate status and must not silently mutate canonical vocabulary.

## Runtime boundary

This foundation is content/authority only. It does not alter current Decode schema, validator, Case Library storage, model prompt, or persisted Cases. Runtime migration is a separate future slice.
