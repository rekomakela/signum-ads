import {
  CONFIDENCE_LEVELS,
  DECODE_DRAFT_SCHEMA_VERSION,
  EVIDENCE_TYPES,
  REFERENCE_TYPES,
  type DraftValidationIssue,
  type EvidenceType,
  type ReferenceType,
} from '../contracts/decode-draft-v1.js';
import {
  createReferenceRegistry,
  type ReferenceRegistry,
} from '../references/reference-registry.js';

export interface ValidateDraftOptions {
  reference_registry?: ReferenceRegistry;
}

export interface DraftValidationResult {
  valid: boolean;
  issues: DraftValidationIssue[];
}

const REQUIRED_TOP_LEVEL_FIELDS = [
  'schema_version',
  'draft_id',
  'asset',
  'provider',
  'raw_provider_output',
  'evidence_records',
  'proposed_decode',
] as const;

const REQUIRED_PROVIDER_FIELDS = [
  'provider_id',
  'provider_name',
  'provider_version',
  'generated_at',
  'deterministic',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isReferenceType(value: unknown): value is ReferenceType {
  return (
    typeof value === 'string' && REFERENCE_TYPES.includes(value as (typeof REFERENCE_TYPES)[number])
  );
}

function isEvidenceType(value: unknown): value is EvidenceType {
  return typeof value === 'string' && EVIDENCE_TYPES.includes(value as EvidenceType);
}

function isConfidence(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    CONFIDENCE_LEVELS.includes(value as (typeof CONFIDENCE_LEVELS)[number])
  );
}

function addError(
  issues: DraftValidationIssue[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({
    severity: 'error',
    code,
    path,
    reference_type: null,
    reference_value: null,
    message,
  });
}

function addUnresolvedReference(
  issues: DraftValidationIssue[],
  path: string,
  referenceType: ReferenceType,
  referenceValue: string,
  message: string,
): void {
  issues.push({
    severity: 'warning',
    code: 'unresolved_reference',
    path,
    reference_type: referenceType,
    reference_value: referenceValue,
    message,
  });
}

export function validateDecodeDraftV1(
  input: unknown,
  options: ValidateDraftOptions = {},
): DraftValidationResult {
  const issues: DraftValidationIssue[] = [];
  const referenceRegistry = options.reference_registry ?? createReferenceRegistry();

  if (!isRecord(input)) {
    addError(issues, 'invalid_envelope', '$', 'Draft envelope must be an object.');
    return { valid: false, issues };
  }

  for (const field of REQUIRED_TOP_LEVEL_FIELDS) {
    if (!Object.hasOwn(input, field)) {
      addError(
        issues,
        'missing_required_field',
        `$.${field}`,
        `Required top-level field "${field}" is missing.`,
      );
    }
  }

  if (input.schema_version !== DECODE_DRAFT_SCHEMA_VERSION) {
    addError(
      issues,
      'invalid_schema_version',
      '$.schema_version',
      `schema_version must be "${DECODE_DRAFT_SCHEMA_VERSION}".`,
    );
  }

  if (typeof input.draft_id !== 'string' || input.draft_id.length === 0) {
    addError(issues, 'invalid_draft_id', '$.draft_id', 'draft_id must be a non-empty string.');
  }

  if (!isRecord(input.asset)) {
    addError(issues, 'invalid_asset', '$.asset', 'asset must be an object.');
  } else if (
    typeof input.asset.asset_id !== 'string' ||
    input.asset.asset_id.length === 0 ||
    input.asset.media_type !== 'image' ||
    typeof input.asset.path !== 'string' ||
    input.asset.path.length === 0 ||
    typeof input.asset.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.asset.sha256)
  ) {
    addError(
      issues,
      'invalid_asset',
      '$.asset',
      'asset requires asset_id, image media_type, path, and a lowercase SHA-256 checksum.',
    );
  }

  if (!isRecord(input.provider)) {
    addError(
      issues,
      'missing_provider_provenance',
      '$.provider',
      'Provider provenance must be an object.',
    );
  } else {
    for (const field of REQUIRED_PROVIDER_FIELDS) {
      const value = input.provider[field];
      if (value === undefined || value === null || value === '') {
        addError(
          issues,
          'missing_provider_provenance',
          `$.provider.${field}`,
          `Provider provenance field "${field}" is required.`,
        );
      }
    }

    if (typeof input.provider.deterministic !== 'boolean') {
      addError(
        issues,
        'invalid_provider_provenance',
        '$.provider',
        'Provider provenance requires a boolean deterministic flag.',
      );
    }
  }

  if (input.source_input !== undefined) {
    const sourceInput = input.source_input;
    if (
      !isRecord(sourceInput) ||
      typeof sourceInput.kind !== 'string' ||
      sourceInput.kind.length === 0 ||
      typeof sourceInput.id !== 'string' ||
      sourceInput.id.length === 0 ||
      typeof sourceInput.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(sourceInput.sha256)
    ) {
      addError(
        issues,
        'invalid_source_input',
        '$.source_input',
        'source_input requires non-empty kind and id and a lowercase SHA-256 hash.',
      );
    }
  }

  if (!isRecord(input.proposed_decode)) {
    addError(
      issues,
      'missing_proposed_decode',
      '$.proposed_decode',
      'proposed_decode must be an object.',
    );
  } else if (
    typeof input.proposed_decode.summary !== 'string' ||
    input.proposed_decode.summary.length === 0 ||
    !Array.isArray(input.proposed_decode.interpretive_claims)
  ) {
    addError(
      issues,
      'invalid_proposed_decode',
      '$.proposed_decode',
      'proposed_decode requires a non-empty summary and interpretive_claims array.',
    );
  }

  const evidenceIds = new Set<string>();
  if (Array.isArray(input.evidence_records)) {
    input.evidence_records.forEach((record, index) => {
      const path = `$.evidence_records[${index}]`;
      if (
        !isRecord(record) ||
        typeof record.evidence_id !== 'string' ||
        record.evidence_id === '' ||
        !isEvidenceType(record.evidence_type) ||
        typeof record.description !== 'string' ||
        record.description.length === 0 ||
        !(typeof record.location === 'string' || record.location === null) ||
        !isConfidence(record.confidence)
      ) {
        addError(
          issues,
          'invalid_evidence_record',
          path,
          'Each evidence record requires evidence_id, evidence_type, description, location, and confidence.',
        );
        return;
      }

      if (evidenceIds.has(record.evidence_id)) {
        addError(
          issues,
          'duplicate_evidence_id',
          `$.evidence_records[${index}].evidence_id`,
          `Evidence id "${record.evidence_id}" is not unique.`,
        );
      }
      evidenceIds.add(record.evidence_id);
    });
  } else {
    addError(
      issues,
      'invalid_evidence_records',
      '$.evidence_records',
      'evidence_records must be an array.',
    );
  }

  const claims = isRecord(input.proposed_decode)
    ? input.proposed_decode.interpretive_claims
    : undefined;

  if (Array.isArray(claims)) {
    claims.forEach((claim, claimIndex) => {
      if (
        !isRecord(claim) ||
        typeof claim.claim_id !== 'string' ||
        !Array.isArray(claim.evidence_references) ||
        !Array.isArray(claim.references)
      ) {
        addError(
          issues,
          'invalid_interpretive_claim',
          `$.proposed_decode.interpretive_claims[${claimIndex}]`,
          'Each interpretive claim requires claim_id, evidence_references, and references.',
        );
        return;
      }
      claim.evidence_references.forEach((reference, referenceIndex) => {
        const path =
          `$.proposed_decode.interpretive_claims[${claimIndex}]` +
          `.evidence_references[${referenceIndex}]`;
        if (
          !isRecord(reference) ||
          typeof reference.evidence_id !== 'string' ||
          reference.evidence_id.length === 0
        ) {
          addError(
            issues,
            'invalid_evidence_reference',
            path,
            'Each evidence reference must have a non-empty evidence_id.',
          );
          return;
        }

        if (
          reference.support !== 'supported' &&
          reference.support !== 'unsupported' &&
          reference.support !== 'unknown'
        ) {
          addError(
            issues,
            'invalid_evidence_support',
            `${path}.support`,
            'Evidence support must be supported, unsupported, or unknown.',
          );
          return;
        }

        if (reference.support === 'supported' && !evidenceIds.has(reference.evidence_id)) {
          addUnresolvedReference(
            issues,
            path,
            'evidence_record',
            reference.evidence_id,
            `Evidence record reference "${reference.evidence_id}" is unresolved.`,
          );
        }
      });

      claim.references.forEach((reference, referenceIndex) => {
        const path =
          `$.proposed_decode.interpretive_claims[${claimIndex}]` + `.references[${referenceIndex}]`;
        if (
          !isRecord(reference) ||
          !isReferenceType(reference.reference_type) ||
          reference.reference_type === 'evidence_record' ||
          typeof reference.reference_value !== 'string' ||
          reference.reference_value.length === 0 ||
          typeof reference.required_for_claim !== 'boolean'
        ) {
          addError(
            issues,
            'invalid_proposed_reference',
            path,
            'Proposed references require type, value, and required_for_claim fields.',
          );
          return;
        }

        if (
          referenceRegistry.canonicalize(reference.reference_type, reference.reference_value) ===
          null
        ) {
          addUnresolvedReference(
            issues,
            path,
            reference.reference_type,
            reference.reference_value,
            `Reference "${reference.reference_value}" is unresolved.`,
          );
        }
      });
    });
  }

  const hasErrors = issues.some((issue) => issue.severity === 'error');
  return { valid: !hasErrors, issues };
}
