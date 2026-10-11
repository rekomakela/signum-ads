import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

import {
  ingestArchiveBatch,
  inspectArchiveBatch,
  type ArchiveIngestionItem,
} from '../corpus/archive-ingestion.js';
import { createCorpusStore } from '../corpus/corpus-store.js';

interface Args {
  readonly input: string;
  readonly corpus_dir: string;
  readonly inspect_only: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  let input: string | null = null;
  let corpusDir = '.state/corpus-v0.1';
  let inspectOnly = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') {
      input = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === '--corpus-dir') {
      corpusDir = argv[index + 1] ?? corpusDir;
      index += 1;
    } else if (arg === '--inspect-only') {
      inspectOnly = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npm run corpus:ingest -- --input archive-batch.json [--corpus-dir .state/corpus-v0.1] [--inspect-only]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (input === null) throw new Error('Archive ingestion requires --input <manifest.json>.');
  return { input: resolve(input), corpus_dir: corpusDir, inspect_only: inspectOnly };
}

function parseItems(value: unknown): ArchiveIngestionItem[] {
  const maybeItems = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && 'items' in value
      ? (value as { items?: unknown }).items
      : null;
  if (!Array.isArray(maybeItems)) {
    throw new Error(
      'Archive ingestion manifest must be a JSON array or an object with an items array.',
    );
  }
  return maybeItems as ArchiveIngestionItem[];
}

const args = parseArgs(process.argv.slice(2));
const manifestDir = dirname(args.input);
const items = parseItems(JSON.parse(await readFile(args.input, 'utf8'))).map((item) => ({
  ...item,
  asset_path: isAbsolute(item.asset_path) ? item.asset_path : resolve(manifestDir, item.asset_path),
}));
const store = createCorpusStore(args.corpus_dir);
const result = args.inspect_only
  ? { duplicate_candidates: await inspectArchiveBatch(store, items) }
  : await ingestArchiveBatch(store, items);
console.log(JSON.stringify(result, null, 2));
