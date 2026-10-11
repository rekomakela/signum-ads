import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  buildAcquisitionReviewManifest,
  stageAcquisitionBatch,
  writeAcquisitionReviewManifest,
  type AcquisitionCandidate,
} from '../acquisition/acquisition-staging.js';
import { loadOrCreateDiscoverySnapshot } from '../acquisition/discovery-snapshot.js';
import { fetchWikimediaCommonsCandidates } from '../acquisition/wikimedia-commons-source.js';
import { createCorpusStore } from '../corpus/corpus-store.js';

interface Args {
  readonly input: string | null;
  readonly wikimedia_commons: boolean;
  readonly category: string;
  readonly depth: number;
  readonly count: number;
  readonly commons_width: number;
  readonly stage_dir: string;
  readonly corpus_dir: string;
  readonly concurrency: number;
  readonly review_only: boolean;
}

const USAGE = `Usage:
  npm run corpus:acquire -- --wikimedia-commons [--count 500]
  npm run corpus:acquire -- --input candidates.json
  npm run corpus:acquire -- --review-only

Options:
  --wikimedia-commons    traverse a Wikimedia Commons advertisement category
  --category <name>      Commons category (default Advertisements by newspaper)
  --depth <N>            subcategory traversal depth 0-5 (default 1)
  --input <path>          JSON array (or {"items": [...]}) of acquisition candidates
  --count <N>             source discovery target (default 500, max 10000)
  --commons-width <px>     Commons rendition width (default 1600, range 320-2400)
  --stage-dir <path>      staging root (default .state/acquisition-v0.1)
  --corpus-dir <path>     Corpus Store root (default .state/corpus-v0.1)
  --concurrency <N>       concurrent Asset downloads (default 4, max 64)
  --review-only           rebuild review.json from already staged acquisitions
  --help, -h              show help

Candidate shape:
  {"acquisition_key":"source:stable-id","acquisition_kind":"web","asset_url":"https://...","source_url":"https://...","source_title":"..."}
`;

function valueAfter(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

function parseInteger(value: string, flag: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${flag} requires an integer.`);
  return parsed;
}

function parseArgs(argv: readonly string[]): Args {
  let input: string | null = null;
  let wikimediaCommons = false;
  let category = 'Advertisements by newspaper';
  let depth = 1;
  let count = 500;
  let commonsWidth = 1600;
  let stageDir = '.state/acquisition-v0.1';
  let corpusDir = '.state/corpus-v0.1';
  let concurrency = 4;
  let reviewOnly = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--input') {
      input = resolve(valueAfter(argv, index, '--input'));
      index += 1;
    } else if (argument === '--wikimedia-commons') {
      wikimediaCommons = true;
    } else if (argument === '--category') {
      category = valueAfter(argv, index, '--category');
      index += 1;
    } else if (argument === '--depth') {
      depth = parseInteger(valueAfter(argv, index, '--depth'), '--depth');
      index += 1;
    } else if (argument === '--count') {
      count = parseInteger(valueAfter(argv, index, '--count'), '--count');
      index += 1;
    } else if (argument === '--commons-width') {
      commonsWidth = parseInteger(valueAfter(argv, index, '--commons-width'), '--commons-width');
      index += 1;
    } else if (argument === '--stage-dir') {
      stageDir = valueAfter(argv, index, '--stage-dir');
      index += 1;
    } else if (argument === '--corpus-dir') {
      corpusDir = valueAfter(argv, index, '--corpus-dir');
      index += 1;
    } else if (argument === '--concurrency') {
      concurrency = parseInteger(valueAfter(argv, index, '--concurrency'), '--concurrency');
      index += 1;
    } else if (argument === '--review-only') {
      reviewOnly = true;
    } else if (argument === '--help' || argument === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}\n\n${USAGE}`);
    }
  }

  if (!reviewOnly && (input === null) === !wikimediaCommons) {
    throw new Error('Choose exactly one acquisition source: --input or --wikimedia-commons.');
  }
  if (reviewOnly && (input !== null || wikimediaCommons)) {
    throw new Error('--review-only cannot be combined with an acquisition source.');
  }
  return {
    input,
    wikimedia_commons: wikimediaCommons,
    category,
    depth,
    count,
    commons_width: commonsWidth,
    stage_dir: stageDir,
    corpus_dir: corpusDir,
    concurrency,
    review_only: reviewOnly,
  };
}

function parseCandidates(value: unknown): AcquisitionCandidate[] {
  const maybeItems = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && 'items' in value
      ? (value as { items?: unknown }).items
      : null;
  if (!Array.isArray(maybeItems)) {
    throw new Error('Acquisition manifest must be a JSON array or an object with an items array.');
  }
  return maybeItems as AcquisitionCandidate[];
}

const args = parseArgs(process.argv.slice(2));
let stageResult = null;
let discovery = null;
if (!args.review_only) {
  let candidates: AcquisitionCandidate[];
  if (args.wikimedia_commons) {
    discovery = await loadOrCreateDiscoverySnapshot(
      args.stage_dir,
      'wikimedia-commons',
      {
        category: args.category,
        count: args.count,
        depth: args.depth,
        rendition_width: args.commons_width,
      },
      () =>
        fetchWikimediaCommonsCandidates({
          count: args.count,
          category: args.category,
          max_depth: args.depth,
          rendition_width: args.commons_width,
        }),
    );
    candidates = [...discovery.snapshot.candidates];
  } else {
    candidates = parseCandidates(JSON.parse(await readFile(args.input!, 'utf8')));
  }
  stageResult = await stageAcquisitionBatch({
    stage_dir: args.stage_dir,
    candidates,
    concurrency: args.concurrency,
  });
}

const store = createCorpusStore(args.corpus_dir);
const review = await buildAcquisitionReviewManifest(store, args.stage_dir);
const reviewPath = await writeAcquisitionReviewManifest(args.stage_dir, review);
console.log(
  JSON.stringify(
    {
      stage: stageResult,
      discovery: discovery
        ? {
            discovery_id: discovery.snapshot.discovery_id,
            reused: discovery.reused,
            path: discovery.path,
          }
        : null,
      review_path: reviewPath,
      review: review.counts,
    },
    null,
    2,
  ),
);
