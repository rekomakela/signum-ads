import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  assertAutomatedReviewPromotable,
  runAutomatedArchivalReview,
  type ArchivalReviewProviderIdentity,
} from '../acquisition/archival-review.js';
import { createPerceptualIdentityGuard } from '../acquisition/perceptual-identity.js';
import { createWikimediaCommonsSourceCorroborationGuard } from '../acquisition/wikimedia-commons-evidence.js';
import { promoteReviewedAcquisitions } from '../acquisition/review-promotion.js';
import { createCorpusStore } from '../corpus/corpus-store.js';
import { createLlamaArchivalReviewClient } from '../providers/llama-archival-review-client.js';

interface Args {
  readonly stage_dir: string;
  readonly corpus_dir: string;
  readonly output: string;
  readonly concurrency: number;
  readonly limit: number | undefined;
  readonly promote: boolean;
  readonly base_url: string | undefined;
  readonly model: string;
  readonly provider_version: string;
}

const DEFAULT_MODEL =
  process.env.SIGNUM_REVIEW_MODEL ?? process.env.SIGNUM_DECODE_MODEL ?? 'signum-vision';
const DEFAULT_PROVIDER_VERSION =
  process.env.SIGNUM_REVIEW_PROVIDER_VERSION ?? 'qwen3.8-27b.signum-vision.img1024.short48.v2';

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

function integerAfter(argv: readonly string[], index: number, flag: string): number {
  const value = Number(valueAfter(argv, index, flag));
  if (!Number.isInteger(value)) throw new Error(`${flag} requires an integer.`);
  return value;
}

function parseArgs(argv: readonly string[]): Args {
  let stageDir = '.state/acquisition-v0.1';
  let corpusDir = '.state/corpus-v0.1';
  let output = '.state/acquisition-v0.1/auto-decisions.json';
  let concurrency = 1;
  let limit: number | undefined;
  let promote = false;
  let baseUrl = process.env.SIGNUM_REVIEW_BASE_URL ?? process.env.SIGNUM_DECODE_BASE_URL;
  let model = DEFAULT_MODEL;
  let providerVersion = DEFAULT_PROVIDER_VERSION;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--stage-dir') {
      stageDir = valueAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--corpus-dir') {
      corpusDir = valueAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--output') {
      output = valueAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--concurrency') {
      concurrency = integerAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--limit') {
      limit = integerAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--promote') {
      promote = true;
    } else if (arg === '--base-url') {
      baseUrl = valueAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--model') {
      model = valueAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--provider-version') {
      providerVersion = valueAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npm run corpus:auto-review -- [--limit 50] [--concurrency 1] [--promote] [--model signum-vision] [--provider-version version]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return {
    stage_dir: stageDir,
    corpus_dir: corpusDir,
    output: resolve(output),
    concurrency,
    limit,
    promote,
    base_url: baseUrl,
    model,
    provider_version: providerVersion,
  };
}

const args = parseArgs(process.argv.slice(2));
const provider: ArchivalReviewProviderIdentity = {
  provider_id: 'signum.local-vlm.archival-review',
  provider_name: 'Signum local archival review VLM',
  provider_version: args.provider_version,
  model: args.model,
};
const client = createLlamaArchivalReviewClient({
  ...(args.base_url !== undefined ? { baseUrl: args.base_url } : {}),
  model: args.model,
});
const store = createCorpusStore(args.corpus_dir);
const identityGuard = await createPerceptualIdentityGuard({
  stage_dir: args.stage_dir,
  store,
});
const sourceCorroborationGuard = createWikimediaCommonsSourceCorroborationGuard(args.stage_dir);
const review = await runAutomatedArchivalReview({
  stage_dir: args.stage_dir,
  store,
  client,
  provider,
  identity_guard: identityGuard,
  source_corroboration_guard: sourceCorroborationGuard,
  concurrency: args.concurrency,
  ...(args.limit !== undefined ? { limit: args.limit } : {}),
});
await writeFile(args.output, `${JSON.stringify(review.manifest, null, 2)}\n`, 'utf8');
if (args.promote) assertAutomatedReviewPromotable(review);
const promotion = args.promote
  ? await promoteReviewedAcquisitions(store, args.stage_dir, review.manifest)
  : null;
console.log(
  JSON.stringify(
    {
      output: args.output,
      provider,
      reviewed_assets: review.reviewed_assets,
      cache_hits: review.cache_hits,
      inference_runs: review.inference_runs,
      skipped_existing_owner: review.skipped_existing_owner,
      skipped_ambiguous_owner: review.skipped_ambiguous_owner,
      skipped_decided: review.skipped_decided,
      identity_checks: review.identity_checks,
      source_corroboration_checks: review.source_corroboration_checks,
      decisions: review.counts,
      failures: review.failures,
      promotion,
    },
    null,
    2,
  ),
);
