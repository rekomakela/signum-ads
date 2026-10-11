export const CORPUS_RECORD_VERSION = 'signum-corpus-records.v0.1' as const;
export const CORPUS_ONTOLOGY_VERSION = 'signum_corpus_model.v0.1' as const;

export const TEMPORAL_PRECISIONS = [
  'exact_date',
  'month',
  'year',
  'circa_year',
  'range',
  'decade',
  'unknown',
] as const;
export type TemporalPrecision = (typeof TEMPORAL_PRECISIONS)[number];

export interface TemporalExtent {
  readonly start_year: number | null;
  readonly end_year: number | null;
  readonly precision: TemporalPrecision;
  readonly start_date: string | null;
  readonly end_date: string | null;
}

export const UNKNOWN_TEMPORAL_EXTENT: TemporalExtent = {
  start_year: null,
  end_year: null,
  precision: 'unknown',
  start_date: null,
  end_date: null,
};

export type MetadataCertainty = 'confirmed' | 'probable' | 'possible' | 'unknown';
export type CorpusEdgeEpistemicType = 'asserted_factual' | 'analytical' | 'derived';
export type CorpusConceptFamily =
  | 'MeaningMechanism'
  | 'ReferentSystem'
  | 'CulturalCode'
  | 'Ideology'
  | 'SocialConcept'
  | 'PersuasionTechnique'
  | 'EmotionalLever'
  | 'TheoreticalConcept';

export interface AdvertisementRecord {
  readonly schema_version: typeof CORPUS_RECORD_VERSION;
  readonly advertisement_id: string;
  readonly asset_ids: readonly string[];
  readonly brand_ids: readonly string[];
  readonly product_ids: readonly string[];
  readonly campaign_ids: readonly string[];
  readonly placement_ids: readonly string[];
  readonly market_ids: readonly string[];
  readonly temporal: TemporalExtent;
  readonly acquisition_source_ids: readonly string[];
  readonly metadata_assertion_ids: readonly string[];
  readonly decode_revision_ids: readonly string[];
  readonly legacy_case_ids: readonly string[];
}

export interface AssetRecord {
  readonly schema_version: typeof CORPUS_RECORD_VERSION;
  readonly asset_id: string;
  readonly media_type: 'image';
  readonly sha256: string;
  readonly storage_path?: string;
  readonly legacy_paths: readonly string[];
  readonly acquisition_source_ids: readonly string[];
}

export interface BrandRecord {
  readonly schema_version: typeof CORPUS_RECORD_VERSION;
  readonly brand_id: string;
  readonly canonical_name: string;
  readonly aliases: readonly string[];
  readonly parent_organization_id: string | null;
  readonly country_of_origin: string | null;
  readonly status: 'active' | 'inactive' | 'historical' | 'unknown';
}

export interface ProductRecord {
  readonly schema_version: typeof CORPUS_RECORD_VERSION;
  readonly product_id: string;
  readonly canonical_name: string;
  readonly category_ids: readonly string[];
}

export interface AcquisitionSourceRecord {
  readonly schema_version: typeof CORPUS_RECORD_VERSION;
  readonly acquisition_source_id: string;
  readonly kind: 'reddit' | 'meta_ad_library' | 'direct_upload' | 'web' | 'unknown';
  readonly source_url: string | null;
  readonly source_title: string | null;
  readonly legacy_case_id: string | null;
}

export interface MetadataAssertionRecord {
  readonly schema_version: typeof CORPUS_RECORD_VERSION;
  readonly assertion_id: string;
  readonly advertisement_id: string;
  readonly field: string;
  readonly value: string | TemporalExtent;
  readonly certainty: MetadataCertainty;
  readonly source_refs: readonly string[];
}

export interface CorpusConceptReference {
  readonly concept_id: string;
  readonly family: CorpusConceptFamily | null;
  readonly legacy_reference_type: string;
  readonly required_for_interpretation: boolean;
}

export interface CorpusObservationRecord {
  readonly observation_id: string;
  readonly description: string;
  readonly evidence_type: string;
  readonly location: string | null;
  readonly confidence: string;
  readonly legacy_evidence_id: string;
}

export interface CorpusEvidenceLinkRecord {
  readonly evidence_link_id: string;
  readonly observation_id: string;
  readonly target_type: 'advertiser_claim' | 'interpretation';
  readonly target_id: string;
  readonly support: string;
}

export interface AdvertiserClaimRecord {
  readonly advertiser_claim_id: string;
  readonly text: string;
  readonly mode: 'explicit' | 'implied' | 'unknown';
  readonly evidence_link_ids: readonly string[];
  readonly concept_refs: readonly CorpusConceptReference[];
  readonly legacy_claim_id: string;
}

export interface InterpretationRecord {
  readonly interpretation_id: string;
  readonly kind: 'thesis' | 'semiotic' | 'persuasion' | 'audience' | 'ideology' | 'other';
  readonly stance: 'primary' | 'alternative' | 'counter' | 'qualifying';
  readonly text: string;
  readonly evidence_link_ids: readonly string[];
  readonly supporting_interpretation_ids: readonly string[];
  readonly concept_refs: readonly CorpusConceptReference[];
  readonly legacy_claim_id: string | null;
}

export interface DecodeRevisionRecord {
  readonly schema_version: typeof CORPUS_RECORD_VERSION;
  readonly revision_id: string;
  readonly advertisement_id: string;
  readonly asset_id: string;
  readonly source_case_id: string | null;
  readonly source_kind?: 'legacy_case' | 'corpus_asset';
  readonly model: string;
  readonly model_version: string;
  readonly analysis_schema_version: string;
  readonly ontology_version: string;
  readonly generated_at: string;
  readonly pipeline_version: string;
  readonly analysis_key?: string;
  readonly analysis_method_version?: string;
  readonly analysis_prompt_version?: string;
  readonly analysis_request_key?: string;
  readonly provider_id?: string;
  readonly legacy_decode_id: string;
  readonly observations: readonly CorpusObservationRecord[];
  readonly advertiser_claims: readonly AdvertiserClaimRecord[];
  readonly interpretations: readonly InterpretationRecord[];
  readonly evidence_links: readonly CorpusEvidenceLinkRecord[];
  readonly legacy_payload: unknown;
}

export interface CorpusRelationshipRecord {
  readonly schema_version: typeof CORPUS_RECORD_VERSION;
  readonly relationship_id: string;
  readonly relation: string;
  readonly source_id: string;
  readonly target_id: string;
  readonly epistemic_type: CorpusEdgeEpistemicType;
  readonly decode_revision_id: string | null;
  readonly source_refs: readonly string[];
}

export interface CorpusMigrationExclusion {
  readonly legacy_case_id: string;
  readonly reason: string;
  readonly rationale: string;
}

export interface CorpusMigrationManifest {
  readonly schema_version: typeof CORPUS_RECORD_VERSION;
  readonly generated_at: string;
  readonly source_cases_dir: string;
  readonly source_fingerprint: string;
  readonly pipeline_version: string;
  readonly ontology_version: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly warnings: readonly string[];
  readonly exclusions: readonly CorpusMigrationExclusion[];
}
