import { migrateLegacyCasesToCorpus } from '../corpus/legacy-migration.js';

function parseArgs(argv: readonly string[]): { cases_dir: string; corpus_dir: string } {
  let casesDir = 'cases';
  let corpusDir = '.state/corpus-v0.1';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--cases-dir') {
      casesDir = argv[index + 1] ?? casesDir;
      index += 1;
    } else if (arg === '--output') {
      corpusDir = argv[index + 1] ?? corpusDir;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npm run corpus:migrate -- [--cases-dir cases] [--output .state/corpus-v0.1]',
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return { cases_dir: casesDir, corpus_dir: corpusDir };
}

const result = await migrateLegacyCasesToCorpus(parseArgs(process.argv.slice(2)));
console.log(JSON.stringify(result, null, 2));
