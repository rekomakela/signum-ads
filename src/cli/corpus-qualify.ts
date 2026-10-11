import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';

import { qualifyCorpusStore } from '../corpus/corpus-qualification.js';
import { createCorpusStore } from '../corpus/corpus-store.js';
import { migrateLegacyCasesToCorpus } from '../corpus/legacy-migration.js';

function parseArgs(argv: readonly string[]): {
  cases_dir: string;
  corpus_dir: string | null;
  count: number;
} {
  let casesDir = 'cases';
  let corpusDir: string | null = null;
  let count = 50;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cases-dir') {
      casesDir = argv[index + 1] ?? casesDir;
      index += 1;
    } else if (arg === '--corpus-dir') {
      corpusDir = argv[index + 1] ?? corpusDir;
      index += 1;
    } else if (arg === '--count') {
      count = Number(argv[index + 1] ?? count);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npm run corpus:qualify -- [--cases-dir cases] [--corpus-dir path] [--count 50]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isInteger(count) || count < 1) throw new Error('--count must be a positive integer.');
  return { cases_dir: casesDir, corpus_dir: corpusDir, count };
}

const options = parseArgs(process.argv.slice(2));
if (options.corpus_dir === null) await mkdir('.state', { recursive: true });
const corpusDir = options.corpus_dir ?? (await mkdtemp(resolve('.state', 'corpus-qualification-')));
if (options.corpus_dir === null) {
  await migrateLegacyCasesToCorpus({ cases_dir: options.cases_dir, corpus_dir: corpusDir });
}
const report = await qualifyCorpusStore(createCorpusStore(corpusDir), options.count);
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'pass') process.exitCode = 1;
