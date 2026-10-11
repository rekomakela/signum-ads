import { createHash } from 'node:crypto';

import { DECODE_DRAFT_SCHEMA_VERSION } from '../contracts/decode-draft-v1.js';
import { CORPUS_ONTOLOGY_VERSION } from '../corpus/corpus-records.js';
import { LIVE_DECODE_CORPUS_PIPELINE_VERSION } from '../corpus/decode-persistence-coordinator.js';
import type { ImageDecodeProviderOptions } from '../providers/image-decode-provider.js';

export const IMAGE_DECODE_METHOD_VERSION = 'signum-image-decode-method.v0.1' as const;
export const IMAGE_DECODE_PROMPT_VERSION = 'signum-image-decode-prompt.v0.2' as const;

export interface AnalysisIdentity {
  readonly analysis_key: string;
  readonly asset_sha256: string;
  readonly analysis_schema_version: typeof DECODE_DRAFT_SCHEMA_VERSION;
  readonly ontology_version: typeof CORPUS_ONTOLOGY_VERSION;
  readonly pipeline_version: typeof LIVE_DECODE_CORPUS_PIPELINE_VERSION;
  readonly method_version: typeof IMAGE_DECODE_METHOD_VERSION;
  readonly prompt_version: typeof IMAGE_DECODE_PROMPT_VERSION;
  readonly provider_id: string;
  readonly provider_name: string;
  readonly provider_version: string;
}

export function createAnalysisIdentity(
  assetSha256: string,
  provider: ImageDecodeProviderOptions,
): AnalysisIdentity {
  const identity = {
    asset_sha256: assetSha256,
    analysis_schema_version: DECODE_DRAFT_SCHEMA_VERSION,
    ontology_version: CORPUS_ONTOLOGY_VERSION,
    pipeline_version: LIVE_DECODE_CORPUS_PIPELINE_VERSION,
    method_version: IMAGE_DECODE_METHOD_VERSION,
    prompt_version: IMAGE_DECODE_PROMPT_VERSION,
    provider_id: provider.provider_id,
    provider_name: provider.provider_name,
    provider_version: provider.provider_version,
  } as const;
  const analysisKey = `analysis_${createHash('sha256')
    .update(JSON.stringify(identity))
    .digest('hex')}`;
  return { analysis_key: analysisKey, ...identity };
}
