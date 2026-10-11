import { resolve } from 'node:path';

import {
  promoteReviewedAcquisitions,
  readAcquisitionDecisionManifest,
} from '../acquisition/review-promotion.js';
import { createCorpusStore } from '../corpus/corpus-store.js';

interface Args {
  readonly decisions: string;
  readonly stage_dir: string;
  readonly corpus_dir: string;
}

function parseArgs(argv: readonly string[]): Args {
  let decisions: string | null = null;
  let stageDir = '.state/acquisition-v0.1';
  let corpusDir = '.state/corpus-v0.1';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--decisions') {
      decisions = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--stage-dir') {
      stageDir = argv[index + 1] ?? stageDir;
      index += 1;
    } else if (arg === '--corpus-dir') {
      corpusDir = argv[index + 1] ?? corpusDir;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npm run corpus:promote -- --decisions decisions.json [--stage-dir .state/acquisition-v0.1] [--corpus-dir .state/corpus-v0.1]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (decisions === null) throw new Error('Corpus promotion requires --decisions <manifest.json>.');
  return { decisions: resolve(decisions), stage_dir: stageDir, corpus_dir: corpusDir };
}

const args = parseArgs(process.argv.slice(2));
const manifest = await readAcquisitionDecisionManifest(args.decisions);
const result = await promoteReviewedAcquisitions(
  createCorpusStore(args.corpus_dir),
  args.stage_dir,
  manifest,
);
console.log(JSON.stringify(result, null, 2));
