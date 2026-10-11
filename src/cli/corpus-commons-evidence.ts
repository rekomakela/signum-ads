import { captureWikimediaCommonsSourceEvidence } from '../acquisition/wikimedia-commons-evidence.js';

interface Args {
  readonly stage_dir: string;
  readonly batch_size: number;
  readonly request_delay_ms: number;
}

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
  let batchSize = 25;
  let requestDelayMs = 750;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--stage-dir') {
      stageDir = valueAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--batch-size') {
      batchSize = integerAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--request-delay-ms') {
      requestDelayMs = integerAfter(argv, index, arg);
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npm run corpus:commons-evidence -- [--stage-dir .state/acquisition-v0.1] [--batch-size 25] [--request-delay-ms 750]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { stage_dir: stageDir, batch_size: batchSize, request_delay_ms: requestDelayMs };
}

const args = parseArgs(process.argv.slice(2));
const result = await captureWikimediaCommonsSourceEvidence(args.stage_dir, {
  batch_size: args.batch_size,
  request_delay_ms: args.request_delay_ms,
});
console.log(JSON.stringify(result, null, 2));
