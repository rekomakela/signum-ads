# Corpus persistence v0.1

## Status

**Qualified primary archival persistence and publication read model.**

This document describes the first executable persistence implementation of Corpus Model v0.1. The conceptual authority remains `content/ontology/corpus-model.v0.1.yaml` and `docs/product/system/02-analysis-model.md`.

## Foundational storage rule

> **Advertisement identity is independent of Case identity, Asset path, and Decode identity.**

The Case Library remains readable and writable as a compatibility/blob adapter. Corpus Store owns archival Advertisement identity, append-only DecodeRevision history, acquisition provenance, and the generated frontend publication projection.

## Implementation

- `src/corpus/corpus-records.ts` — persisted v0.1 record shapes.
- `src/corpus/corpus-store.ts` — file-backed record store with conflict-safe immutable writes.
- `src/corpus/legacy-migration.ts` — deterministic Case → Corpus migration adapter.
- `src/corpus/corpus-query.ts` — structured cross-corpus query helpers.
- `src/corpus/corpus-qualification.ts` — heterogeneous 50-Advertisement acceptance harness.
- `src/corpus/curated-corpus-metadata.ts` — governed Brand/time facts and factual provenance currently known for selected legacy Cases.
- `src/cli/corpus-migrate.ts` / `src/cli/corpus-qualify.ts` — operator entrypoints.

The default mutable runtime projection is `.state/corpus-v0.1`. `.state/` remains ignored. The legacy baseline is reproducible from tracked Cases plus governed migration metadata; reviewed post-Case archival additions needed by static publication are carried as a deterministic tracked publication overlay rather than by checking in mutable runtime state or the full binary corpus.

## Record families

The executable v0.1 store persists separate records for:

- Advertisement;
- Asset;
- Brand;
- Product;
- AcquisitionSource;
- MetadataAssertion;
- DecodeRevision;
- typed Corpus relationships.

The record shapes also reserve Advertisement references for Campaign, Placement, Market, and Product even when current legacy data cannot populate them responsibly.

## Legacy identity migration

Exact SHA-256 is authoritative for **Asset identity only**. It is not sufficient evidence for Advertisement identity.

Migration defaults to one Advertisement identity per legacy Case. When two or more legacy Cases share an exact binary Asset, migration **fails closed unless the group has a human-reviewed disposition** in `src/corpus/legacy-identity.ts`.

A reviewed disposition may:

- merge Cases that demonstrably contain the same Advertisement;
- quarantine a Case when the stored file is not actually the intended Advertisement.

The current reviewed identity groups include three exact-binary duplicate groups and seven same-Advertisement groups whose reproductions have distinct Asset hashes:

- Stabilo direct upload + Reddit acquisition → one Advertisement;
- DHL direct upload + Reddit acquisition → one Advertisement;
- two BIC pens/razors acquisitions → one Advertisement;
- Keloptic glasses campaign reproductions → one Advertisement;
- IKEA importance-of-sleep reproductions → one Advertisement;
- Tabasco popcorn/corn reproductions → one Advertisement;
- Volkswagen Beetles reproductions → one Advertisement;
- Ford Saudi women-driving reproductions → one Advertisement;
- Mercedes-Benz Christmas star reproductions → one Advertisement;
- Lemon, Ice & Alcohol reproductions → one Advertisement.

The distinct-binary dispositions are reviewed archival identity decisions, not automatic perceptual merges. Provenance, source agreement, and/or pairwise visual review establishes the disposition; perceptual similarity only surfaces candidates for review.

Three unrelated HP / Gold’s Gym / Mercedes-Benz Cases shared the same hosting “media unavailable” placeholder Asset. Those Cases are explicitly quarantined from Corpus migration because the stored binary is not an Advertisement at all.

This distinction is non-negotiable:

```text
exact binary SHA-256 → Asset identity
reviewed archival evidence → Advertisement identity
```

Corpus Model v0.1 allows one Advertisement to own several Assets. A later identity decision can therefore attach another scan/crop/reproduction without changing Advertisement identity.

Every migrated legacy Case ID remains attached to its Advertisement. Reviewed duplicates preserve every acquisition source and every Decode as separate history.

## Decode migration

Every legacy `draft.json` becomes an immutable DecodeRevision.

Migration preserves:

- source Case ID;
- legacy Decode ID;
- model name/version;
- original generated timestamp;
- analysis schema version;
- Corpus ontology version;
- migration pipeline version;
- original legacy payload;
- normalized Observations;
- normalized EvidenceLinks;
- AdvertiserClaims derived only from current `core_message` claim records;
- Signum Interpretations for the remaining analytical claim kinds;
- a thesis Interpretation derived from the legacy Decode summary.

Migration does not overwrite an earlier DecodeRevision when the same Advertisement has multiple Decodes.

## Provenance boundaries

Three things remain different:

1. **AcquisitionSource** — where Signum obtained a copy.
2. **Placement** — where/when the Advertisement actually appeared.
3. **MetadataAssertion source refs** — evidence for factual corpus metadata such as Brand or publication time.

A Reddit permalink is therefore migrated as AcquisitionSource provenance. It is never silently promoted into Placement or publication time.

## Factual metadata

Verified Brand/time values previously owned by frontend presentation code now live in `src/corpus/curated-corpus-metadata.ts` with stable Brand IDs and explicit source refs.

Unknown chronology remains `precision: unknown`; no source-post timestamp is converted into ad publication time.

## Graph edges

Every persisted relationship has an epistemic type:

- `asserted_factual`;
- `analytical`;
- `derived`.

Migration persists factual and analytical edges only. Derived similarity/chronology edges remain regenerable by default.

## Query contract

The corpus query layer can answer structured forms of:

- Brand × Time;
- Product Category × Cultural Code;
- Brand × Meaning Mechanism;
- Concept × Time.

The query API operates on stable structured fields and concept references. It does not parse prose to recover identity.

## Scalable acquisition staging

Bulk source collection is intentionally separated from canonical Advertisement creation. Source adapters may acquire many candidate Assets, but unseen candidates first enter an ignored local staging area with acquisition provenance and no Advertisement identity.

Run the built-in Wikimedia Commons source collector:

```sh
npm run corpus:acquire -- --wikimedia-commons --count 500 --concurrency 4
```

Or stage candidates emitted by another governed source adapter:

```sh
npm run corpus:acquire -- --input acquisition-candidates.json
```

The default staging root is `.state/acquisition-v0.1`. Successful Assets are stored content-addressably under `blobs/`, acquisition records are immutable and resumable under `candidates/`, source-discovery cohorts are frozen under `discoveries/`, and every run regenerates `review.json`. Acquisition records do not carry timestamps, Case IDs, Decode IDs, or inferred corpus facts. A repeated source/category/depth/count request reuses its immutable discovery snapshot; changing those request parameters creates a distinct cohort.

The scaling boundary is:

```text
source discovery
  -> concurrent Asset acquisition
  -> exact binary fingerprint + durable staged provenance
  -> deterministic duplicate review
  -> reviewed Advertisement identity
  -> corpus:ingest
  -> optional DecodeRevision later
```

Exact SHA-256 deduplicates staged Asset bytes but never auto-creates or auto-merges unseen Advertisement identities. `review.json` marks each acquisition as one of:

- `existing_owner` — the exact Asset already resolves to exactly one canonical Advertisement;
- `requires_identity_review` — unseen Asset, no canonical Advertisement is assigned;
- `blocked_ambiguous_owner` — corpus state itself is ambiguous and promotion must stop.

For unseen candidates, the review projection includes a deterministic `proposed_advertisement_id` derived from the stable acquisition key, not from Asset SHA-256. It remains only a proposal until archival review explicitly copies/accepts an `advertisement_id`. Identical staged binaries from several acquisition sources therefore remain a review group rather than silently becoming one Advertisement.

The staging downloader uses bounded concurrency with HTTP 429/503 and transient-network retry/backoff, validates supported image binaries by signature, caps Asset size, preserves separate acquisition provenance for exact duplicates, and resumes already-staged acquisition keys without re-downloading. Individual network/binary failures are reported without discarding successful acquisitions. Conflicting definitions for the same acquisition key fail before network work. Source discovery is independently snapshotted so an interrupted run resumes the same candidate cohort rather than silently following a changing upstream category.

## Automated archival review

Staged acquisitions can be triaged by a separate local vision classification contract without creating a DecodeRevision:

```sh
npm run corpus:auto-review -- --limit 50 --concurrency 2
```

Add `--promote` only when clear automated decisions should be applied to the Corpus Store. The generated decision manifest is written to `.state/acquisition-v0.1/auto-decisions.json`; durable dispositions are preserved separately as append-only decision receipts under `review-decisions/`.

For Wikimedia Commons staging, capture immutable source-side archival evidence before automated promotion:

```sh
npm run corpus:commons-evidence
```

The evidence cache records the Commons page/revision identity, source title/URL, categories, archival description, and original-date metadata under a versioned `source-evidence/` sidecar. Automated policy `signum-automated-archival-review-policy.v0.3` treats this as a **second-factor corroboration only**: Commons metadata can never classify an image as an Advertisement by itself. A new Commons Advertisement requires a high-confidence visual `single_advertisement` classification, a clear cross-corpus perceptual identity preflight, and explicit advertising support in the cached Commons categories or archival description. Missing source evidence is a retriable runtime failure; source evidence that does not corroborate advertising quarantines the candidate for manual review.

This asymmetry is deliberate. Advertisement-related Commons categories can include documentary photographs, section-title pages, or images containing incidental advertising, so source metadata is not sufficiently precise to replace visual classification. It is useful as independent positive provenance after the visual boundary has already been established.

Automated archival review is intentionally narrower than Decode. It asks only whether an Asset is visibly one advertisement, multiple advertisements, not an advertisement, or uncertain. It must not infer Brand, date, Campaign, Placement, ideology, audience, advertiser intent, or other analytical meaning. The model request uses temperature 0, seed 0, structured JSON, and a fixed review prompt; reproducibility is guaranteed by immutable caching keyed by Asset SHA-256 + review schema/method/prompt + provider/model identity, not by sampling settings alone.

The qualified local Qwen3.8 review runtime caps each image at 1024 vision tokens, uses two 4096-token slots, caps model output at 48 tokens, and asks for a rationale of at most 12 words. The short-output contract is `signum-archival-review-prompt.v0.2`; the default provider identity is `qwen3.8-27b.signum-vision.img1024.short48.v2`. On a balanced 10-Asset benchmark drawn from durable reviewed decisions, the 1024-token/short-output contract reproduced 10/10 classifications. Two-slot execution also reproduced 10/10 and improved effective throughput from about 19.1 seconds per Asset to about 14.6 seconds per Asset. Four-slot execution was slower and is not the qualified default.

The deterministic promotion policy is fail-closed:

- an exact Asset already owned by exactly one Advertisement attaches new acquisition provenance without inference;
- exact staged duplicates share one visual review and one proposed Advertisement identity;
- only `single_advertisement` + `high` confidence **and** a clear cross-corpus perceptual identity preflight may produce `accept_new`;
- perceptual preflight uses a deterministic 32×32 grayscale DCT perceptual hash over the current staged + Corpus Asset snapshot; Hamming distance ≤10 is treated as identity ambiguity, not proof of sameness;
- a near perceptual match quarantines the candidate instead of establishing a new Advertisement identity; an unavailable perceptual check is treated as infrastructure/data-readability failure and blocks automated batch promotion rather than writing a durable quarantine receipt;
- perceptual fingerprints and identity-check records are cached by immutable Asset/method/snapshot identity; local `ffmpeg` supplies deterministic image normalization for this preflight;
- `not_an_advertisement` + `high` confidence produces an auditable rejection while retaining staged bytes/provenance;
- multiple-ad images, lower-confidence classifications, and ambiguous Corpus ownership quarantine rather than promote;
- inference/runtime failures may appear as temporary quarantine decisions in the generated manifest, but `--promote` refuses the entire automated batch while any such failure exists, so a transient model outage can never become a durable review receipt;
- any existing decision receipt takes precedence over later automated reclassification; newly acquired exact copies may still attach to an already-known canonical owner;
- automated review evidence is archival intake evidence, not an Observation/AdvertiserClaim/Interpretation and never becomes a DecodeRevision.

Manual decision manifests remain available through `corpus:review` and `corpus:promote` for exceptions and identity repair. Reconsideration appends a new decision receipt instead of rewriting earlier review history.

`src/acquisition/wikimedia-commons-source.ts` is the first native high-volume source adapter. Its safe default is the higher-precision `Advertisements by newspaper` category; broader Commons category trees must be selected explicitly because the root `Advertisements` tree contains substantial non-advertising material. The adapter traverses Commons categories through the public MediaWiki API, acquires a bounded 1600px Commons rendition for staging efficiency, and preserves the canonical Commons file page as acquisition provenance. Existing `reddit:ingest` and `meta:ingest` remain Case-Library compatibility paths; new corpus-scale source work should target acquisition staging instead of creating Pending Cases.

## Governed post-ingestion temporal metadata

Advertisement archival metadata may become better supported after identity review, so the Corpus Store exposes a narrow metadata-promotion path rather than a generic record update. `promoteAdvertisementMetadata` permits only an `unknown` temporal extent to become one evidence-backed known extent and permits `metadata_assertion_ids` only to grow. It cannot change Asset, Brand, Product, Campaign, Placement, Market, acquisition, DecodeRevision, legacy-identity, or already-known temporal fields. A temporal change requires a newly referenced immutable `MetadataAssertionRecord`.

For accepted Wikimedia Commons acquisitions, temporal proposals are generated with:

```sh
npm run corpus:commons-temporal
```

Add `--apply` only after inspecting the deterministic proposal manifest. The contract `signum-commons-temporal-metadata.v0.1` accepts only explicit original-publication evidence:

- an exact `YYYY-MM-DD` Commons category becomes `exact_date`;
- a Commons category explicitly naming `YYYY advertisements` becomes year precision;
- an archival description field explicitly stating `Date of Publishing: YYYY` becomes year precision;
- multiple strong signals must agree; conflicting years/dates fail closed and leave Advertisement time unknown;
- generic Commons `DateTimeOriginal` values are never promoted because they frequently describe scan, upload, photography, or derivative-file dates rather than the Advertisement publication date.

Temporal assertions cite both the immutable Commons source-evidence snapshot and the corresponding AcquisitionSource. Reruns are idempotent. Ads without one of the governed publication signals remain explicitly unknown rather than receiving inferred dates.

## Static publication overlay

GitHub Pages builds from a fresh checkout and must not depend on a developer's ignored `.state` directory or localhost analyzer. The tracked `publication/corpus-overlay-v0.1/overlay.json` therefore carries the deterministic Corpus delta that cannot be reconstructed from legacy Cases alone.

Generate or refresh it from the qualified local canonical Corpus with:

```sh
npm run corpus:publication-overlay
```

The exporter first rebuilds the legacy Case baseline in an isolated runtime directory and then fails closed if a baseline record would need replacement. The overlay contains only records absent from that reproducible baseline: reviewed Advertisement/Asset identities, acquisition provenance, governed metadata assertions, corpus-native DecodeRevisions, and their relationships. It does not copy the full acquired binary archive. Binary blobs are included only for corpus-native DecodeRevisions that the static frontend must actually render, and every copied blob is SHA-256 verified.

On a fresh `frontend:data` run, the baseline migration is created first and the tracked overlay is then applied only to that newly created projection. Existing local canonical Corpus state is never overlaid or rewritten. Overlay application verifies both the legacy baseline fingerprint and the overlay fingerprint before writes. This gives Pages a deterministic analyzer-free publication projection while keeping `.state` as mutable local runtime state rather than repository authority.

## Archive ingestion without Decode

Corpus Store also supports operator-reviewed archive ingestion that does not invoke analysis and does not require a DecodeRevision. This is the preferred path for scaling the archival corpus independently of analytical coverage.

Run:

```sh
npm run corpus:ingest -- --input archive-batch.json
npm run corpus:ingest -- --input archive-batch.json --inspect-only
```

The manifest is a JSON array (or `{ "items": [...] }`) whose entries provide an explicit reviewed `advertisement_id`, an `asset_path`, a stable `acquisition_key`, acquisition kind/provenance, and optional already-governed archival fields. Relative asset paths resolve from the manifest directory.

The ingestion contract is deliberately fail-closed:

- `advertisement_id` is explicit reviewed archival identity; it is never derived from SHA-256, filename, URL, current time, or frontend state;
- Asset identity is deterministic from exact binary SHA-256 and the binary is copied into the Corpus Store at `blobs/<asset_id>`;
- an exact Asset already owned by a different Advertisement causes the batch to fail before writes rather than auto-merge identities;
- `--inspect-only` surfaces exact-binary duplicate candidates in deterministic order without mutating the Corpus Store;
- repeat ingestion of the same Advertisement/Asset/acquisition tuple is idempotent;
- acquisition provenance remains AcquisitionSource provenance and is represented by asserted-factual `has_asset` and `acquired_from` relationships;
- source-specific bounded renditions may be used for acquisition transport; the requested rendition parameters are part of immutable discovery identity while SHA-256 still identifies the acquired Asset bytes;
- archive-created AcquisitionSources have `legacy_case_id: null` because they do not originate in the Case Library;
- an Advertisement may validly have `decode_revision_ids: []`.

The ingestion path does not infer Brand, chronology, Campaign, Placement, Market, advertiser claims, or interpretations. Any supplied archival fields must already be governed facts; immutable archival-field conflicts fail closed.

## 50-Advertisement qualification

The real 102-Case legacy corpus currently migrates **99 valid legacy Cases into 89 Advertisement identities and 96 Assets**. Three Cases are quarantined because their stored Asset is a generic unavailable-media placeholder rather than the intended ad. Ten reviewed identity groups consolidate duplicate acquisitions/reproductions into canonical Advertisements while preserving all distinct Assets, AcquisitionSources, and DecodeRevisions. The qualification harness prioritizes those reviewed identities, known Brand/time records, direct uploads, different image formats, and analytically rich records before deterministically filling the cohort to 50 unique Advertisements.

Acceptance requires, among other checks:

- exact-binary duplicates require an explicit reviewed Advertisement identity disposition;
- Asset, Brand, EvidenceLink, and DecodeRevision references resolve;
- unknown temporal precision remains unknown;
- acquisition is not confused with Placement;
- AdvertiserClaim is not confused with Interpretation;
- unknown controlled-concept categories fail closed instead of being invented;
- multiple DecodeRevisions coexist;
- persisted graph edges carry epistemic type;
- cross-corpus query contracts execute without prose parsing.

Run:

```sh
npm run corpus:qualify -- --count 50
```

## Cutover implementation

Decode has two explicit entry paths that converge on the same immutable Corpus revision model.

Legacy upload/Pending-Case compatibility keeps the Case Library adapter: the incoming Asset/Decode may be written there for rollback compatibility, then Corpus identity resolution appends the canonical Advertisement/DecodeRevision state.

Existing archive Advertisements use the corpus-native path instead. `decodeAdvertisement()` selects a persisted Asset already owned by that Advertisement, verifies unique Advertisement ownership, reads and SHA-256-verifies the corpus-owned blob, invokes analysis only when the canonical analysis identity is absent, and appends a DecodeRevision directly. It never creates a synthetic Case, new AcquisitionSource, or replacement Asset.

Corpus-native DecodeRevisions record `source_case_id: null` and `source_kind: corpus_asset`. Legacy revisions retain their real `source_case_id`. Frontend/static publication branches on that provenance: legacy revisions may still read compatibility Case assets, while corpus-native revisions publish directly from the Corpus Asset blob.

The cutover follows these rules:

1. Unseen upload acquisitions receive a deterministic explicit Advertisement ID from their acquisition/compatibility identity, never from Asset SHA-256.
2. A corpus-native Decode requires an existing Advertisement and a uniquely owned persisted Asset. Multi-Asset Advertisements require explicit Asset selection; ambiguous ownership fails before inference.
3. Corpus Asset bytes are read only through the governed blob path and must still hash to the recorded Asset SHA-256 before analysis or publication.
4. DecodeRevision and analytical relationships are immutable/idempotent. Corpus-native decoding appends only the new DecodeRevision reference to the existing Advertisement.
5. Frontend route/publication identity, archival metadata, and corpus-native image bytes come from Corpus Store. Case Library is only a legacy compatibility adapter.

```text
Legacy upload/Pending Case → Case compatibility write → Corpus identity → DecodeRevision
Existing Advertisement     → Corpus Asset verification ───────────────→ DecodeRevision

Frontend legacy revision       → Corpus metadata + Case compatibility blob
Frontend corpus-native revision → Corpus metadata + Corpus Asset blob
```

For bounded archive analysis:

```sh
npm run corpus:decode -- --limit 10
npm run corpus:decode -- --advertisement-id <ad_id>
```

The command defaults to undecoded Advertisements only and a small bounded batch. The provider/model contract version is explicit in analysis identity; normal reruns reuse an existing canonical DecodeRevision without contacting the analyzer.

## Deterministic analysis execution contract

Signum does not claim that a generative model is mathematically deterministic. Product determinism is instead enforced by canonical analysis identity plus immutable persistence.

For live image analysis, the canonical analysis key is SHA-256 over the stable tuple:

- Asset SHA-256;
- Decode analysis schema version;
- Corpus ontology version;
- live Decode→Corpus pipeline version;
- analysis method version;
- prompt version;
- provider ID;
- provider name;
- provider/model version.

Generation time, Case ID, filename, acquisition source, current date, and frontend state are deliberately excluded. They are provenance or presentation facts, not analytical computation identity.

Normal analysis uses `analysis_request_key = canonical`. Before inference, the Decode module resolves the Asset/Advertisement under the existing fail-closed identity rules and looks for exactly one DecodeRevision with the same Asset, Advertisement, analysis key, and canonical request key. A match is returned directly from Corpus Store; the model is not invoked. No match permits one inference, after which the revision is persisted immutably and becomes the canonical result for that analysis identity.

Explicit re-analysis is opt-in (`reanalyze: true`) and never replaces the canonical revision. It appends a new DecodeRevision with the same analysis key and an auditable `reanalysis:N` request key. A changed provider/model version, prompt/method version, schema, ontology, pipeline version, or Asset naturally produces a different analysis key and therefore a new canonical revision.

Within one Decode module process, identical concurrent canonical requests share the same in-flight operation so they cannot create duplicate inference or revision work. Corpus immutability remains the final conflict guard.

The local llama-compatible client uses `temperature: 0` and `seed: 0` to reduce inference variance when a new run is genuinely required. These settings improve reproducibility but are not the determinism guarantee.

Archive browsing, Advertisement detail, corpus queries, static frontend projection, and compatibility image reads are all Corpus/Case read paths. They do not require a running analyzer. Analyzer availability matters only for a cache miss or an explicit re-analysis request.
