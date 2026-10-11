import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { ingestAdPornPosts, type AdPornPost } from '../ingest/reddit-adporn.js';

const USAGE = `Usage: npm run reddit:ingest -- <posts.json>

Reads a JSON array of r/AdPorn posts (captured via the browser's .json endpoint)
and writes each as a local case. Each post object needs: title, url, image, permalink.

Options:
  --cases-dir <path>   case library root (default "cases")
  --help, -h           show this help
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    process.stdout.write(USAGE);
    process.exit(argv.length === 0 ? 1 : 0);
  }

  let casesDir = 'cases';
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;
    if (argument === '--cases-dir') {
      casesDir = argv[index + 1] ?? 'cases';
      index += 1;
    } else {
      positional.push(argument);
    }
  }

  const postsPath = positional[0];
  if (postsPath === undefined) {
    process.stderr.write(`${USAGE}\nMissing posts.json path.\n`);
    process.exit(1);
  }

  const posts = JSON.parse(await readFile(resolve(postsPath), 'utf8')) as AdPornPost[];

  const summary = await ingestAdPornPosts({
    posts,
    casesDir,
    log: (message) => process.stdout.write(`${message}\n`),
  });

  process.stdout.write(`\nIngested ${summary.ingested} ads (${summary.skipped} skipped).\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
