import { ingestMetaAds } from '../ingest/ingest-meta-ads.js';

const USAGE = `Usage: npm run meta:ingest [--count N] [--terms a,b,c]

Environment:
  FB_ACCESS_TOKEN   Meta user access token (required)

Options:
  --count N         number of ads to ingest (default 50)
  --terms a,b,c     comma-separated search terms (default: broad categories)
  --help, -h        show this help
`;

const DEFAULT_TERMS = [
  'automotive',
  'fashion',
  'beauty',
  'technology',
  'food',
  'beverage',
  'travel',
  'retail',
  'fitness',
  'home',
];

function readValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function parseArguments(argv: readonly string[]): {
  count: number;
  terms: string[];
} {
  let count = 50;
  let terms = DEFAULT_TERMS;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      process.stdout.write(USAGE);
      process.exit(0);
    } else if (argument === '--count') {
      count = Number(readValue(argv, index, '--count'));
      index += 1;
    } else if (argument === '--terms') {
      terms = readValue(argv, index, '--terms')
        .split(',')
        .map((term) => term.trim())
        .filter((term) => term.length > 0);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}\n\n${USAGE}`);
    }
  }

  return { count, terms };
}

async function main(): Promise<void> {
  const { count, terms } = parseArguments(process.argv.slice(2));
  const token = process.env.FB_ACCESS_TOKEN;
  if (token === undefined || token.trim() === '') {
    process.stderr.write('Missing FB_ACCESS_TOKEN. Set it to your Meta user access token.\n');
    process.exit(1);
  }

  const summary = await ingestMetaAds({
    accessToken: token,
    searchTerms: terms,
    targetCount: count,
    log: (message) => process.stdout.write(`${message}\n`),
  });

  process.stdout.write(`\nIngested ${summary.ingested} ads (${summary.skipped} skipped).\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
