import { resolve } from 'node:path';

import {
  buildAcquisitionReviewManifest,
  writeAcquisitionReviewManifest,
} from '../acquisition/acquisition-staging.js';
import {
  createAcquisitionDecisionTemplate,
  writeAcquisitionDecisionTemplate,
} from '../acquisition/review-promotion.js';
import { createCorpusStore } from '../corpus/corpus-store.js';

interface Args {
  readonly stage_dir: string;
  readonly corpus_dir: string;
  readonly output: string;
  readonly limit: number | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  let stageDir = '.state/acquisition-v0.1';
  let corpusDir = '.state/corpus-v0.1';
  let output = '.state/acquisition-v0.1/decisions.json';
  let limit: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--stage-dir') {
      stageDir = argv[index + 1] ?? stageDir;
      index += 1;
    } else if (arg === '--corpus-dir') {
      corpusDir = argv[index + 1] ?? corpusDir;
      index += 1;
    } else if (arg === '--output') {
      output = argv[index + 1] ?? output;
      index += 1;
    } else if (arg === '--limit') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1)
        throw new Error('--limit requires a positive integer.');
      limit = value;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npm run corpus:review -- [--stage-dir .state/acquisition-v0.1] [--corpus-dir .state/corpus-v0.1] [--output decisions.json] [--limit 50]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { stage_dir: stageDir, corpus_dir: corpusDir, output: resolve(output), limit };
}

const args = parseArgs(process.argv.slice(2));
const store = createCorpusStore(args.corpus_dir);
const review = await buildAcquisitionReviewManifest(store, args.stage_dir);
await writeAcquisitionReviewManifest(args.stage_dir, review);
const template = createAcquisitionDecisionTemplate(review, args.limit);
await writeAcquisitionDecisionTemplate(args.output, template);
console.log(
  JSON.stringify(
    {
      output: args.output,
      items: template.items.length,
      requires_identity_review: review.counts.requires_identity_review,
      existing_owner: review.counts.existing_owner,
      blocked_ambiguous_owner: review.counts.blocked_ambiguous_owner,
    },
    null,
    2,
  ),
);
