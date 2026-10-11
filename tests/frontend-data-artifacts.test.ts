import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { createCaseLibrary } from '../src/cases/case-library.js';
import { curatedCorpusMetadata } from '../src/corpus/curated-corpus-metadata.js';
import { archiveEditorialMetadata } from '../src/frontend/archive-metadata.js';
import { buildSignumFrontendArtifacts } from '../src/frontend/signum-workbench-data.js';
import { createDecodeModule } from '../src/decode/decode-module.js';
import { mockModelClient } from '../src/providers/mock-model-client.js';

test('frontend artifacts publish Case images outside the generated dataset', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-frontend-artifacts-'));
  const casesDir = join(root, 'cases');
  const corpusDir = join(root, 'corpus');
  const library = createCaseLibrary(casesDir);
  const image = Buffer.from('frontend image bytes');

  await library.admitPendingCase({
    case_id: 'case-static-asset',
    image_buffer: image,
    extension: '.png',
    summary: 'Static asset advertisement',
  });
  const decoded = await createDecodeModule(mockModelClient, {
    library,
    corpusDir,
    provider: {
      provider_id: 'signum.test',
      provider_name: 'Signum test',
      provider_version: '1',
      generated_at: '2026-08-29T00:00:00.000Z',
    },
  }).decodePending('case-static-asset');

  const artifacts = await buildSignumFrontendArtifacts(casesDir, corpusDir);
  const caseData = artifacts.dataset.cases[0];
  const publishedAsset = artifacts.assets[0];

  assert.equal(caseData?.advertisement_id, decoded.advertisement_id);
  assert.equal(caseData?.case_id, decoded.advertisement_id);
  assert.equal(caseData?.compatibility_case_id, 'case-static-asset');
  assert.equal(caseData?.asset.sha256, decoded.decode.asset.sha256);
  assert.equal(caseData?.asset.src, `/generated/cases/${decoded.advertisement_id}/asset.png`);
  assert.equal(caseData?.asset.src?.startsWith('data:'), false);
  assert.equal(
    publishedAsset?.relative_path,
    `generated/cases/${decoded.advertisement_id}/asset.png`,
  );
  assert.deepEqual(publishedAsset?.bytes, image);
});

test('archive editorial metadata is curated and leaves unknown dates empty', () => {
  assert.deepEqual(archiveEditorialMetadata('real-a-simple-brilliant-ad-by-land-rover-7ecb02ed'), {
    brand: 'Land Rover',
    year_label: '2011',
    analytical_title: 'Adventure encoded in a passport',
    analytical_deck:
      'Passport stamps turn travel itself into the shape of the Defender, making the vehicle a symbol of mobility, independence, and global exploration.',
  });
  assert.deepEqual(
    archiveEditorialMetadata('real-mcdonalds-confidently-advertises-with-no-brandin-1110eb18'),
    {
      brand: 'McDonald’s',
      year_label: null,
      analytical_title: 'Branding without showing the brand',
      analytical_deck:
        'Product recognition, colour, and appetite appeal make explicit branding unnecessary—the fries are expected to identify McDonald’s on their own.',
    },
  );
  const landRoverCorpus = curatedCorpusMetadata(
    'real-a-simple-brilliant-ad-by-land-rover-7ecb02ed',
  );
  assert.equal(landRoverCorpus.brand?.brand_id, 'brand_land_rover');
  assert.equal(landRoverCorpus.temporal?.temporal.start_year, 2011);
  assert.match(landRoverCorpus.temporal?.source_refs[0] ?? '', /^https:\/\//);
});
