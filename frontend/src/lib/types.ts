export interface SignumWorkbenchData {
  generated_at: string;
  cases: readonly SignumWorkbenchCase[];
}

export interface SignumWorkbenchCase {
  advertisement_id: string;
  case_id: string;
  compatibility_case_id: string;
  title: string;
  summary: string | null;
  source_url: string | null;
  archive: SignumArchiveMetadata;
  status: 'pending' | 'decoded';
  evidence_types: readonly string[];
  unresolved_reference_count: number | null;
  asset: SignumWorkbenchAsset;
  observations: readonly SignumObservation[];
  claims: readonly SignumClaim[];
}

export interface SignumArchiveMetadata {
  brand: string | null;
  year_label: string | null;
  analytical_title: string | null;
  analytical_deck: string | null;
}

export interface SignumWorkbenchAsset {
  alt: string;
  src: string | null;
  sha256: string;
}

export interface SignumObservation {
  ref: string;
  evidence_type: string;
  description: string;
  location: string | null;
  confidence: string;
}

export interface SignumClaimEvidenceRef {
  ref: string;
  support: string;
}

export interface SignumClaimReference {
  reference_type: string;
  reference_value: string;
  required_for_claim: boolean;
}

export interface SignumClaim {
  ref: string;
  kind: string;
  text: string;
  evidence_refs: readonly SignumClaimEvidenceRef[];
  references: readonly SignumClaimReference[];
}
