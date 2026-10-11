import {
  CLAIM_KINDS,
  CONFIDENCE_LEVELS,
  DECODE_DRAFT_SCHEMA_VERSION,
  EVIDENCE_TYPES,
  REFERENCE_TYPES,
} from '../contracts/decode-draft-v1.js';
import type {
  CatalogReferenceType,
  Confidence,
  DecodeDraftV1,
  DraftAsset,
  EvidenceRecord,
  EvidenceSupport,
  EvidenceType,
  InterpretiveClaimKind,
  JsonValue,
  ProposedInterpretiveClaim,
  ProposedReference,
} from '../contracts/decode-draft-v1.js';
import { createControlledVocabularyRegistry } from '../references/controlled-vocabulary-registry.js';
import { validateDecodeDraftV1 } from '../validation/decode-draft-validator.js';
import type { ModelClient, StructuredDecode } from './model-client.js';

/**
 * Provenance a real (non-deterministic) image-decode provider stamps onto the
 * decode. A real provider runs a model, so `deterministic` is false.
 */
export interface ImageDecodeProviderOptions {
  provider_id: string;
  provider_name: string;
  provider_version: string;
  /** Override the generation timestamp; defaults to "now". Kept injectable for tests. */
  generated_at?: string;
}

export interface ImageDecodeInput {
  asset: DraftAsset;
  image: Parameters<ModelClient['analyzeImage']>[0];
  provider: ImageDecodeProviderOptions;
}

const CATALOG_REFERENCE_TYPES = REFERENCE_TYPES.filter(
  (referenceType) => referenceType !== 'evidence_record',
);

function normalizeEvidenceType(value: string): EvidenceType {
  return (EVIDENCE_TYPES as readonly string[]).includes(value) ? (value as EvidenceType) : 'visual';
}

function normalizeConfidence(value: string): Confidence {
  return (CONFIDENCE_LEVELS as readonly string[]).includes(value)
    ? (value as Confidence)
    : 'medium';
}

function normalizeClaimKind(value: string): InterpretiveClaimKind {
  return (CLAIM_KINDS as readonly string[]).includes(value)
    ? (value as InterpretiveClaimKind)
    : 'interpretation';
}

function normalizeReferenceType(value: string): CatalogReferenceType {
  return (CATALOG_REFERENCE_TYPES as readonly string[]).includes(value)
    ? (value as CatalogReferenceType)
    : 'glossary_concept';
}

function evidenceId(index: number): string {
  return `evidence_${String(index + 1).padStart(3, '0')}`;
}

function mapEvidence(structured: StructuredDecode): EvidenceRecord[] {
  return structured.observations.map((observation, index) => ({
    evidence_id: evidenceId(index),
    evidence_type: normalizeEvidenceType(observation.evidence_type),
    description: observation.description,
    location: observation.location,
    confidence: normalizeConfidence(observation.confidence),
  }));
}

function mapClaims(structured: StructuredDecode): ProposedInterpretiveClaim[] {
  const evidenceCount = structured.observations.length;

  return structured.claims.map((claim, index) => {
    const evidence_references = claim.evidence_indices
      .filter(
        (evidenceIndex) =>
          Number.isInteger(evidenceIndex) && evidenceIndex >= 0 && evidenceIndex < evidenceCount,
      )
      .map((evidenceIndex) => ({
        evidence_id: evidenceId(evidenceIndex),
        support: 'supported' as EvidenceSupport,
      }));

    const references: ProposedReference[] = claim.references.map((reference) => ({
      reference_type: normalizeReferenceType(reference.reference_type),
      reference_value: reference.reference_value,
      required_for_claim: reference.required_for_claim,
    }));

    return {
      claim_id: `claim_${String(index + 1).padStart(3, '0')}`,
      kind: normalizeClaimKind(claim.kind),
      text: claim.text,
      evidence_references,
      references,
    };
  });
}

/**
 * Pure mapping from a model's `StructuredDecode` into a `decode-draft.v1`
 * envelope. No network, no side effects — unit-testable in isolation.
 */
export function buildImageDecodeDraft(
  structured: StructuredDecode,
  input: ImageDecodeInput,
  generatedAt: string,
): DecodeDraftV1 {
  return {
    schema_version: DECODE_DRAFT_SCHEMA_VERSION,
    draft_id: `draft_vlm_${input.asset.sha256.slice(0, 16)}`,
    asset: { ...input.asset },
    provider: {
      provider_id: input.provider.provider_id,
      provider_name: input.provider.provider_name,
      provider_version: input.provider.provider_version,
      generated_at: generatedAt,
      deterministic: false,
    },
    source_input: {
      kind: 'image',
      id: input.asset.asset_id,
      sha256: input.asset.sha256,
    },
    raw_provider_output: structured as unknown as JsonValue,
    evidence_records: mapEvidence(structured),
    proposed_decode: {
      summary: structured.summary,
      interpretive_claims: mapClaims(structured),
    },
  };
}

/**
 * Run a model over an image and produce a validated `decode-draft.v1` Decode envelope.
 * This is the async seam a real (llama-server) or mock client plugs into.
 */
export async function decodeImage(
  client: ModelClient,
  input: ImageDecodeInput,
): Promise<DecodeDraftV1> {
  const structured = await client.analyzeImage(input.image);
  const generatedAt = input.provider.generated_at ?? new Date().toISOString();
  const draft = buildImageDecodeDraft(structured, input, generatedAt);
  const validation = validateDecodeDraftV1(draft, {
    reference_registry: createControlledVocabularyRegistry(),
  });
  if (!validation.valid) {
    const errors = validation.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ');
    throw new Error(`Model produced an invalid decode: ${errors}`);
  }
  return draft;
}
