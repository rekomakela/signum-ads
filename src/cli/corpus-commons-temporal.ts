import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  buildCommonsTemporalProposalManifest,
  promoteCommonsTemporalMetadata,
} from '../acquisition/commons-temporal-metadata.js';
import { createCorpusStore } from '../corpus/corpus-store.js';

interface Args {
  readonly stage_dir: string;
  readonly corpus_dir: string;
  readonly output: string;
  readonly apply: boolean;
}

const USAGE = `Usage:
  npm run corpus:commons-temporal -- [--apply]

Options:
  --stage-dir <path>   staging root (default .state/acquisition-v0.1)
  --corpus-dir <path>  Corpus Store root (default .state/corpus-v0.1)
  --output <path>      proposal manifest output (default .state/acquisition-v0.1/commons-temporal-proposals.json)
  --apply              append confirmed temporal assertions and promote unknown Advertisement temporal metadata
  --help, -h           show help
`;

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

function parseArgs(argv: readonly string[]): Args {
  let stageDir = '.state/acquisition-v0.1';
  let corpusDir = '.state/corpus-v0.1';
  let output = '.state/acquisition-v0.1/commons-temporal-proposals.json';
  let apply = false;
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
    } else if (arg === '--apply') {
      apply = true;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }
  return {
    stage_dir: stageDir,
    corpus_dir: corpusDir,
    output: resolve(output),
    apply,
  };
}

const args = parseArgs(process.argv.slice(2));
const store = createCorpusStore(args.corpus_dir);
const manifest = await buildCommonsTemporalProposalManifest(store, args.stage_dir);
await writeFile(args.output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const promotion = args.apply ? await promoteCommonsTemporalMetadata(store, manifest) : null;
console.log(
  JSON.stringify(
    {
      output: args.output,
      counts: manifest.counts,
      promotion,
    },
    null,
    2,
  ),
);
