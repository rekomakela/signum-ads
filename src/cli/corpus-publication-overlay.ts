import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { createCorpusStore } from '../corpus/corpus-store.js';
import { migrateLegacyCasesToCorpus } from '../corpus/legacy-migration.js';
import { writeCorpusPublicationOverlay } from '../corpus/corpus-publication-overlay.js';

const USAGE = `Usage: npm run corpus:publication-overlay -- [options]\n\nOptions:\n  --cases-dir <path>    Legacy Case root (default cases)\n  --corpus-dir <path>   Canonical local Corpus root (default .state/corpus-v0.1)\n  --output <path>       Tracked publication overlay (default publication/corpus-overlay-v0.1/overlay.json)\n  --help, -h`;

function value(argv: readonly string[], index: number, flag: string): string {
  const next = argv[index + 1];
  if (next === undefined || next.startsWith('-')) throw new Error(`Missing value for ${flag}.`);
  return next;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  let casesDir = 'cases';
  let corpusDir = '.state/corpus-v0.1';
  let output = 'publication/corpus-overlay-v0.1/overlay.json';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cases-dir') {
      casesDir = value(argv, index, arg);
      index += 1;
    } else if (arg === '--corpus-dir') {
      corpusDir = value(argv, index, arg);
      index += 1;
    } else if (arg === '--output') {
      output = value(argv, index, arg);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }

  const stateDir = resolve('.state');
  await mkdir(stateDir, { recursive: true });
  const lockPath = join(stateDir, 'corpus-publication-overlay.lock');
  try {
    await writeFile(lockPath, `${process.pid}\n`, { flag: 'wx' });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('Another Corpus publication overlay generation is already active.', {
        cause: error,
      });
    }
    throw error;
  }

  const baselineDir = await mkdtemp(join(stateDir, 'publication-baseline-v0.1-'));
  try {
    await migrateLegacyCasesToCorpus({ cases_dir: casesDir, corpus_dir: baselineDir });
    const overlay = await writeCorpusPublicationOverlay({
      current_store: createCorpusStore(corpusDir),
      baseline_store: createCorpusStore(baselineDir),
      output_path: output,
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          output: resolve(output),
          overlay_fingerprint: overlay.overlay_fingerprint,
          advertisements: overlay.advertisements.length,
          assets: overlay.assets.length,
          acquisitions: overlay.acquisition_sources.length,
          metadata_assertions: overlay.metadata_assertions.length,
          decode_revisions: overlay.decode_revisions.length,
          relationships: overlay.relationships.length,
          published_blobs: overlay.published_blobs.length,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await rm(baselineDir, { recursive: true, force: true });
    await unlink(lockPath).catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
