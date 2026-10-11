# Controlled vocabulary ↔ Corpus Model v0.1 alignment

## Purpose

Keep current runtime vocabulary compatible while the target corpus ontology evolves independently of decoder object shapes.

## Authority layers

- **Target ontology:** `content/ontology/corpus-model.v0.1.yaml`, `core-classes.v1.yaml`, `core-relationships.v1.yaml`.
- **Controlled concept model:** `content/ontology/controlled-concept-model.v0.1.yaml`.
- **Current runtime snapshot:** `src/reference-vocabulary/controlled-vocabulary.v1.json`.

The runtime snapshot is a compatibility projection, not the authority that determines which corpus classes may exist.

## Class vs instance discipline

`ontology_class` contains class-level labels used by the current runtime contract. Instance-level reusable concepts belong in their dedicated types where those types already exist.

Current runtime may still contain compatibility labels such as `TargetAudience` or `GlossaryEntry`. Their presence does not make them active target corpus classes.

## Active controlled families

The target model distinguishes:

- MeaningMechanism;
- ReferentSystem;
- CulturalCode;
- Ideology;
- SocialConcept;
- PersuasionTechnique;
- EmotionalLever;
- TheoreticalConcept.

Do not merge these into one concept bucket merely because the current Decode contract uses a small set of reference types.

## Stable identity

Canonical controlled concepts follow `controlled-concept-model.v0.1.yaml`:

- IDs are permanent;
- labels/definitions may evolve;
- aliases resolve to one canonical ID;
- broader/narrower/related relations are explicit;
- deprecated IDs remain resolvable through replacement metadata;
- decoder-proposed unknown terms become candidates, not automatic canonical vocabulary.

## Compatibility classes

The target foundation retains four old labels only for compatibility during migration:

- Claim;
- CounterReading;
- TargetAudience;
- GlossaryEntry.

Target semantics are AdvertiserClaim/Interpretation, Interpretation stance, AudiencePosition, and controlled-concept presentation respectively.

## Validation rules

`tools/signum-knowledge/validate_knowledge_yaml.py` must enforce:

1. declared active class count matches the actual active class list;
2. active and compatibility IDs/labels are unique and do not overlap;
3. relationship endpoints reference active canonical classes;
4. runtime `ontology_class` values resolve to either an active canonical label or an explicit compatibility label;
5. contract-structure objects do not become flat vocabulary IDs;
6. existing case/runtime vocabulary remains resolvable;
7. glossary/catalog coverage remains intact.

The validator is read-only and must not mutate runtime vocabulary or corpus data.

## Migration rule

Do not edit `decode-draft.v1` merely to mirror the target ontology. Runtime changes require a separate migration with compatibility tests. The corpus model is allowed to be richer than the current decoder contract.
