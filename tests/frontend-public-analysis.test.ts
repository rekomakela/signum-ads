import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

async function source(path: string): Promise<string> {
  return readFile(resolve(REPO_ROOT, path), 'utf8');
}

test('public analysis hashes uploads and resolves persisted Advertisement identity before inference', async () => {
  const dropZone = await source('frontend/src/lib/components/signum/SignumDropZone.svelte');
  const analysePage = await source('frontend/src/routes/analyse/+page.svelte');

  assert.match(dropZone, /crypto\.subtle\.digest\(['"]SHA-256['"]/);
  assert.match(dropZone, /archiveCases\.find\(\(entry\) => entry\.asset\.sha256 === sha256\)/);
  assert.match(
    dropZone,
    /goto\(resolve\(['"]\/cases\/\[caseId\]['"], \{ caseId: archived\.advertisement_id \}\)\)/,
  );
  assert.match(dropZone, /if \(!canUseLocalAnalyzer\(\)\)/);
  assert.match(dropZone, /not in the public archive yet/);
  assert.match(analysePage, /<SignumDropZone archiveCases=\{data\.dataset\.cases\} \/>/);
});

test('public frontend never falls through to the hard-coded loopback analyzer', async () => {
  const decodeClient = await source('frontend/src/lib/decode.ts');

  assert.match(decodeClient, /assertLocalDecodeServerIsReachableFromPage\(\)/);
  assert.match(decodeClient, /!isLoopbackHostname\(window\.location\.hostname\)/);
  assert.match(decodeClient, /public archive cannot call the local decode server/);
});
