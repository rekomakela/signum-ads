import { createCorpusStore } from '../corpus/corpus-store.js';
import { createDecodeModule } from '../decode/decode-module.js';
import { createLlamaServerClient } from '../providers/llama-server-client.js';

interface Args {
  readonly corpus_dir: string;
  readonly cases_dir: string;
  readonly limit: number;
  readonly concurrency: number;
  readonly advertisement_id: string | null;
  readonly base_url: string | undefined;
  readonly model: string;
  readonly provider_version: string;
}

const DEFAULT_MODEL = process.env.SIGNUM_DECODE_MODEL ?? 'signum-vision';
const DEFAULT_PROVIDER_VERSION =
  process.env.SIGNUM_DECODE_PROVIDER_VERSION ?? 'qwen3.8-27b.signum-vision.decode.v2';

const USAGE = `Usage: npm run corpus:decode -- [options]

Decode canonical Corpus Advertisements directly from corpus-owned Assets.
No synthetic Case is created.

Options:
  --limit <N>               maximum undecoded Advertisements (default 10)
  --concurrency <N>         model requests; only 1 is qualified on the local runtime
  --advertisement-id <id>   decode exactly one Advertisement
  --corpus-dir <path>       Corpus Store root (default .state/corpus-v0.1)
  --cases-dir <path>        legacy compatibility Case root (default cases)
  --base-url <url>          model server base URL
  --model <name>            model alias (default signum-vision)
  --provider-version <id>   pinned provider/model contract identity
  --help, -h                show help
`;

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
  let corpusDir = '.state/corpus-v0.1';
  let casesDir = 'cases';
  let limit = 10;
  let concurrency = 1;
  let advertisementId: string | null = null;
  let baseUrl = process.env.SIGNUM_DECODE_BASE_URL;
  let model = DEFAULT_MODEL;
  let providerVersion = DEFAULT_PROVIDER_VERSION;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--limit') {
      limit = integerAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--concurrency') {
      concurrency = integerAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--advertisement-id') {
      advertisementId = valueAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--corpus-dir') {
      corpusDir = valueAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--cases-dir') {
      casesDir = valueAfter(argv, index, arg);
      index += 1;
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
      process.stdout.write(USAGE);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
    }
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw new Error('--limit must be an integer between 1 and 1000.');
  }
  if (concurrency !== 1) {
    throw new Error(
      '--concurrency must be 1; parallel full Decodes are not qualified on the local Qwen runtime.',
    );
  }
  return {
    corpus_dir: corpusDir,
    cases_dir: casesDir,
    limit,
    concurrency,
    advertisement_id: advertisementId,
    base_url: baseUrl,
    model,
    provider_version: providerVersion,
  };
}

const args = parseArgs(process.argv.slice(2));
const store = createCorpusStore(args.corpus_dir);
const client = createLlamaServerClient({
  ...(args.base_url !== undefined ? { baseUrl: args.base_url } : {}),
  model: args.model,
});
const decoder = createDecodeModule(client, {
  corpusStore: store,
  casesDir: args.cases_dir,
  provider: {
    provider_id: 'signum.local-vlm',
    provider_name: 'Signum local VLM (Qwen3.8-27B)',
    provider_version: args.provider_version,
  },
});
const advertisements = (await store.listAdvertisements()).sort((a, b) =>
  a.advertisement_id.localeCompare(b.advertisement_id),
);
const selected =
  args.advertisement_id === null
    ? advertisements.filter((item) => item.decode_revision_ids.length === 0).slice(0, args.limit)
    : advertisements.filter((item) => item.advertisement_id === args.advertisement_id);
if (args.advertisement_id !== null && selected.length === 0) {
  throw new Error(`No canonical Advertisement named "${args.advertisement_id}".`);
}

let cursor = 0;
const successes: Array<{
  advertisement_id: string;
  revision_id: string;
  cache_hit: boolean;
}> = [];
const failures: Array<{ advertisement_id: string; reason: string }> = [];

async function worker(): Promise<void> {
  while (true) {
    const index = cursor++;
    if (index >= selected.length) return;
    const advertisement = selected[index]!;
    try {
      const result = await decoder.decodeAdvertisement(advertisement.advertisement_id);
      successes.push({
        advertisement_id: result.advertisement_id,
        revision_id: result.decode_revision_id,
        cache_hit: result.cache_hit,
      });
    } catch (error: unknown) {
      failures.push({
        advertisement_id: advertisement.advertisement_id,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
await Promise.all(
  Array.from({ length: Math.min(args.concurrency, Math.max(selected.length, 1)) }, () => worker()),
);

process.stdout.write(
  `${JSON.stringify(
    {
      provider: {
        provider_id: 'signum.local-vlm',
        provider_version: args.provider_version,
        model: args.model,
      },
      selected: selected.length,
      decoded: successes.length,
      failed: failures.length,
      successes: successes.sort((a, b) => a.advertisement_id.localeCompare(b.advertisement_id)),
      failures: failures.sort((a, b) => a.advertisement_id.localeCompare(b.advertisement_id)),
    },
    null,
    2,
  )}\n`,
);
