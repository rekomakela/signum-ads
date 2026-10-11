export const DECODE_DRAFT_SCHEMA_VERSION = 'decode-draft.v1' as const;

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface DraftAsset {
  asset_id: string;
  media_type: 'image';
  path: string;
  sha256: string;
}

export interface ProviderProvenance {
  provider_id: string;
  provider_name: string;
  provider_version: string;
  generated_at: string;
  deterministic: boolean;
}

/**
 * Optional structured provenance for the input a provider consumed: what kind of
 * input it was, its identifier, and a content hash. This is draft-only machine
 * provenance attached to the machine-produced decode.
 */
export interface DraftSourceInput {
  kind: string;
  id: string;
  sha256: string;
}

export const EVIDENCE_TYPES = [
  'visual',
  'copy',
  'layout',
  'context',
  'cta',
  'price',
  'brand_mark',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export interface EvidenceRecord {
  evidence_id: string;
  evidence_type: EvidenceType;
  description: string;
  location: string | null;
  confidence: Confidence;
}

export const EVIDENCE_SUPPORT_VALUES = ['supported', 'unsupported', 'unknown'] as const;
export type EvidenceSupport = 'supported' | 'unsupported' | 'unknown';

export interface InterpretiveEvidenceReference {
  evidence_id: string;
  support: EvidenceSupport;
}

export const REFERENCE_TYPES = [
  'glossary_concept',
  'ontology_class',
  'persuasion_technique',
  'emotional_lever',
  'cultural_code',
  'evidence_record',
] as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[number];
export type CatalogReferenceType = Exclude<ReferenceType, 'evidence_record'>;

export interface ProposedReference {
  reference_type: CatalogReferenceType;
  reference_value: string;
  required_for_claim: boolean;
}

export type ReferenceCatalog = Partial<Record<CatalogReferenceType, readonly string[]>>;

export const CLAIM_KINDS = [
  'core_message',
  'persuasion',
  'semiotic',
  'audience',
  'interpretation',
] as const;

export type InterpretiveClaimKind =
  'core_message' | 'persuasion' | 'semiotic' | 'audience' | 'interpretation';

export interface ProposedInterpretiveClaim {
  claim_id: string;
  kind: InterpretiveClaimKind;
  text: string;
  evidence_references: InterpretiveEvidenceReference[];
  references: ProposedReference[];
}

export interface ProposedDecode {
  summary: string;
  interpretive_claims: ProposedInterpretiveClaim[];
}

export type ValidationIssueSeverity = 'warning' | 'error';

export interface DraftValidationIssue {
  severity: ValidationIssueSeverity;
  code: string;
  path: string;
  reference_type: ReferenceType | null;
  reference_value: string | null;
  message: string;
}

/**
 * Machine-authored envelope. This is deliberately incompatible with the
 * stable decode contract used by the earlier learning repository. The learning repo's
 * `ad-decode.v1` shape is reference material only.
 */
export interface DecodeDraftV1 {
  schema_version: typeof DECODE_DRAFT_SCHEMA_VERSION;
  draft_id: string;
  asset: DraftAsset;
  provider: ProviderProvenance;
  source_input?: DraftSourceInput;
  raw_provider_output: JsonValue;
  evidence_records: EvidenceRecord[];
  proposed_decode: ProposedDecode;
}

/**
 * JSON Schema representation of the TypeScript contract. Cross-record rules
 * (uniqueness and reference resolution) live in the
 * validator because JSON Schema cannot express them clearly.
 */
export const DECODE_DRAFT_V1_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://signum.local/schemas/decode-draft.v1.schema.json',
  title: 'Signum Decoder draft envelope v1',
  type: 'object',
  additionalProperties: false,
  required: [
    'schema_version',
    'draft_id',
    'asset',
    'provider',
    'raw_provider_output',
    'evidence_records',
    'proposed_decode',
  ],
  properties: {
    schema_version: { const: DECODE_DRAFT_SCHEMA_VERSION },
    draft_id: { type: 'string', minLength: 1 },
    asset: {
      type: 'object',
      additionalProperties: false,
      required: ['asset_id', 'media_type', 'path', 'sha256'],
      properties: {
        asset_id: { type: 'string', minLength: 1 },
        media_type: { const: 'image' },
        path: { type: 'string', minLength: 1 },
        sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
    },
    provider: {
      type: 'object',
      additionalProperties: false,
      required: [
        'provider_id',
        'provider_name',
        'provider_version',
        'generated_at',
        'deterministic',
      ],
      properties: {
        provider_id: { type: 'string', minLength: 1 },
        provider_name: { type: 'string', minLength: 1 },
        provider_version: { type: 'string', minLength: 1 },
        generated_at: { type: 'string', format: 'date-time' },
        deterministic: { type: 'boolean' },
      },
    },
    source_input: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'id', 'sha256'],
      properties: {
        kind: { type: 'string', minLength: 1 },
        id: { type: 'string', minLength: 1 },
        sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
    },
    raw_provider_output: {},
    evidence_records: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['evidence_id', 'evidence_type', 'description', 'location', 'confidence'],
        properties: {
          evidence_id: { type: 'string', minLength: 1 },
          evidence_type: { enum: EVIDENCE_TYPES },
          description: { type: 'string', minLength: 1 },
          location: { type: ['string', 'null'] },
          confidence: { enum: CONFIDENCE_LEVELS },
        },
      },
    },
    proposed_decode: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'interpretive_claims'],
      properties: {
        summary: { type: 'string', minLength: 1 },
        interpretive_claims: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['claim_id', 'kind', 'text', 'evidence_references', 'references'],
            properties: {
              claim_id: { type: 'string', minLength: 1 },
              kind: {
                enum: ['core_message', 'persuasion', 'semiotic', 'audience', 'interpretation'],
              },
              text: { type: 'string', minLength: 1 },
              evidence_references: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['evidence_id', 'support'],
                  properties: {
                    evidence_id: { type: 'string', minLength: 1 },
                    support: { enum: ['supported', 'unsupported', 'unknown'] },
                  },
                },
              },
              references: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['reference_type', 'reference_value', 'required_for_claim'],
                  properties: {
                    reference_type: {
                      enum: [
                        'glossary_concept',
                        'ontology_class',
                        'persuasion_technique',
                        'emotional_lever',
                        'cultural_code',
                      ],
                    },
                    reference_value: { type: 'string', minLength: 1 },
                    required_for_claim: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
