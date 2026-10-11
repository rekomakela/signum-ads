import type { DraftAsset } from './decode-draft-v1.js';

/**
 * Minimal source metadata for an ingested case. Unlike the old
 * `DecodeManifestInput` (a full human-authored decode), this carries only
 * provenance: the asset, a display summary/title, and an optional source URL.
 * The machine decode itself lives in `draft.json`.
 */
export interface CaseMetadata {
  manifest_id: string;
  asset: DraftAsset;
  summary: string;
  source_url?: string;
}
