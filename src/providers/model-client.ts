/**
 * Model-facing contract for image decoding.
 *
 * A `ModelClient` turns raw image bytes into a *structured decode* — the
 * trimmed, model-friendly shape a VLM emits. The `image-decode-provider` then
 * maps that into a full `decode-draft.v1` envelope. Keeping the two shapes
 * separate means the model is never asked to produce the envelope directly,
 * and the mapping (normalization, ID assignment, reference shaping) stays
 * deterministic and testable.
 */

/**
 * A single evidence observation the model noticed in the image.
 * `evidence_type` is a plain string from the model; the mapper normalizes it
 * against the draft contract's `EVIDENCE_TYPES`.
 */
export interface StructuredDecodeObservation {
  description: string;
  evidence_type: string;
  location: string | null;
  confidence: string;
}

/**
 * A reference the model attached to a claim. `reference_type` is a plain
 * string from the model; the mapper normalizes it against the draft contract's
 * catalog reference types.
 */
export interface StructuredDecodeReference {
  reference_type: string;
  reference_value: string;
  required_for_claim: boolean;
}

/**
 * A single interpretive claim. `evidence_indices` points into
 * `StructuredDecode.observations` (0-based) rather than at evidence IDs, so the
 * model only needs to count, not to invent stable IDs.
 */
export interface StructuredDecodeClaim {
  kind: string;
  text: string;
  evidence_indices: number[];
  references: StructuredDecodeReference[];
}

/**
 * The full structured decode a model returns for one image.
 */
export interface StructuredDecode {
  summary: string;
  observations: StructuredDecodeObservation[];
  claims: StructuredDecodeClaim[];
}

/**
 * An image payload for analysis. Bytes are carried as base64 so the client is
 * transport-agnostic: local `llama-server`, a cloud API, or a mock all consume
 * the same shape.
 */
export interface ModelImageInput {
  mime_type: string;
  base64: string;
}

/**
 * A model client turns image bytes into a structured decode. Async because
 * inference is a socket/network call even when the model runs locally.
 */
export interface ModelClient {
  analyzeImage(input: ModelImageInput): Promise<StructuredDecode>;
}
