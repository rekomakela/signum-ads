import { dirname, resolve } from 'node:path';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';

import { buildSignumFrontendArtifacts } from '../frontend/signum-workbench-data.js';
import { createCorpusStore } from '../corpus/corpus-store.js';
import { migrateLegacyCasesToCorpus } from '../corpus/legacy-migration.js';
import { applyCorpusPublicationOverlay } from '../corpus/corpus-publication-overlay.js';

const USAGE = `Usage: npm run frontend:data -- [options]

Options:
  --cases-dir <path>
  --corpus-dir <path>
  --out <path>
  --static-dir <path>
  --help, -h`;

interface CliArguments {
  casesDir: string;
  corpusDir: string;
  outPath: string;
  staticDir: string;
}

function readValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function parseArguments(argv: readonly string[]): CliArguments | { help: true } {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  let casesDir = 'cases';
  let corpusDir = '.state/corpus-v0.1';
  let outPath = resolve('frontend/src/lib/generated/signum-workbench-data.json');
  let staticDir = resolve('frontend/static');

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;

    if (argument === '--cases-dir') {
      casesDir = readValue(argv, index, '--cases-dir');
      index += 1;
      continue;
    }
    if (argument === '--out') {
      outPath = resolve(readValue(argv, index, '--out'));
      index += 1;
      continue;
    }
    if (argument === '--corpus-dir') {
      corpusDir = readValue(argv, index, '--corpus-dir');
      index += 1;
      continue;
    }
    if (argument === '--static-dir') {
      staticDir = resolve(readValue(argv, index, '--static-dir'));
      index += 1;
      continue;
    }
    if (argument.startsWith('-')) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    throw new Error(`Unexpected positional argument: ${argument}`);
  }

  return { casesDir, corpusDir, outPath, staticDir };
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if ('help' in parsed) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const corpus = createCorpusStore(parsed.corpusDir);
  const corpusWasEmpty = (await corpus.listAdvertisements()).length === 0;
  if (corpusWasEmpty) {
    await migrateLegacyCasesToCorpus({ cases_dir: parsed.casesDir, corpus_dir: parsed.corpusDir });
    const publicationOverlay = resolve(
      process.env.SIGNUM_PUBLICATION_OVERLAY ?? 'publication/corpus-overlay-v0.1/overlay.json',
    );
    try {
      await access(publicationOverlay);
      await applyCorpusPublicationOverlay(corpus, publicationOverlay);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  const artifacts = await buildSignumFrontendArtifacts(parsed.casesDir, parsed.corpusDir);
  await mkdir(dirname(parsed.outPath), { recursive: true });
  await writeFile(parsed.outPath, `${JSON.stringify(artifacts.dataset, null, 2)}\n`, 'utf8');

  const generatedRoot = resolve(parsed.staticDir, 'generated', 'cases');
  await rm(generatedRoot, { recursive: true, force: true });

  for (const asset of artifacts.assets) {
    const target = resolve(parsed.staticDir, asset.relative_path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, asset.bytes);
  }

  process.stdout.write(`WROTE ${parsed.outPath}\n`);
  process.stdout.write(
    `PUBLISHED ${artifacts.assets.length} compatibility assets under ${generatedRoot}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
