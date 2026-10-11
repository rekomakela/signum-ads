import { resolve } from 'node:path';

import { createCaseLibrary } from '../cases/case-library.js';
import { createDecodeModule } from '../decode/decode-module.js';
import { createLlamaServerClient } from '../providers/llama-server-client.js';

const USAGE = `Usage: npm run decode:batch [--limit N] [--force]

Decodes every Pending real-* Case by running its Asset through the local vision
model and saving the resulting Decode in the Case Library.

Options:
  --limit N      decode at most N Cases (default: all)
  --force        re-decode Cases that already have a Decode
  --help, -h     show this help
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  let limit = Number.POSITIVE_INFINITY;
  let force = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--limit') {
      limit = Number(argv[index + 1]);
      index += 1;
    } else if (argument === '--force') {
      force = true;
    } else {
      process.stderr.write(`${USAGE}\nUnknown argument: ${argument}\n`);
      process.exit(1);
    }
  }

  const client = createLlamaServerClient();
  const casesRoot = resolve('cases');
  const library = createCaseLibrary(casesRoot);
  const decoder = createDecodeModule(client, {
    provider: {
      provider_id: 'signum.local-vlm',
      provider_name: 'Signum local VLM (Qwen3.8-27B)',
      provider_version: '1.0.0',
    },
    library,
  });
  const entries = await library.listCases();

  let decoded = 0;
  let skipped = 0;
  let failed = 0;

  for (const entry of entries) {
    if (!entry.case_id.startsWith('real-')) continue;
    if (decoded >= limit) break;
    if (entry.status === 'decoded' && !force) continue;
    if (entry.metadata === null && entry.decode === null) {
      skipped += 1;
      continue;
    }

    try {
      await decoder.decodePending(entry.case_id);
      decoded += 1;
      process.stdout.write(`decoded ${entry.case_id}\n`);
    } catch (error: unknown) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`FAILED ${entry.case_id}: ${message.slice(0, 120)}\n`);
    }
  }

  process.stdout.write(`\nDecoded ${decoded}, skipped ${skipped}, failed ${failed}.\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
