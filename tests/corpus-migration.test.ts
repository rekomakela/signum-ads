import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { createCaseLibrary } from '../src/cases/case-library.js';
import type { DecodeDraftV1, DraftAsset } from '../src/contracts/decode-draft-v1.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';
import { migrateLegacyCasesToCorpus } from '../src/corpus/legacy-migration.js';

function makeDecode(asset: DraftAsset, id: string): DecodeDraftV1 {
  return {
    schema_version: 'decode-draft.v1',
    draft_id: id,
    asset,
    provider: {
      provider_id: 'test.provider',
      provider_name: 'Test model',
      provider_version: '1.2.3',
      generated_at: '2026-08-29T00:00:00.000Z',
      deterministic: true,
    },
    raw_provider_output: {},
    evidence_records: [
      {
        evidence_id: 'e1',
        evidence_type: 'visual',
        description: 'Passport stamps form a vehicle silhouette.',
        location: 'center',
        confidence: 'high',
      },
    ],
    proposed_decode: {
      summary: 'Travel becomes a symbolic property of the vehicle.',
      interpretive_claims: [
        {
          claim_id: 'c1',
          kind: 'core_message',
          text: 'The vehicle enables adventurous travel.',
          evidence_references: [{ evidence_id: 'e1', support: 'supported' }],
          references: [],
        },
        {
          claim_id: 'c2',
          kind: 'semiotic',
          text: 'Passport stamps transfer meanings of mobility and exploration to the vehicle.',
          evidence_references: [{ evidence_id: 'e1', support: 'supported' }],
          references: [
            {
              reference_type: 'cultural_code',
              reference_value: 'adventure',
              required_for_claim: true,
            },
          ],
        },
      ],
    },
  };
}

test('legacy migration deduplicates identical Assets only through a reviewed Advertisement identity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-corpus-migrate-'));
  const casesDir = join(root, 'cases');
  const corpusDir = join(root, 'corpus');
  const library = createCaseLibrary(casesDir);
  const bytes = Buffer.from('same Stabilo advertisement bytes');
  const sourceId = 'real-ad-for-stabilo-highlighter-pens-ed451c17';
  const directId = 'decoded-ad-1b62e7bd';

  const pending = await library.admitPendingCase({
    case_id: sourceId,
    image_buffer: bytes,
    extension: '.jpg',
    summary: 'Ad for Stabilo highlighter pens',
    source_url: 'https://reddit.com/r/AdPorn/example',
  });
  await library.saveDecode(sourceId, makeDecode(pending.metadata!.asset, 'decode_source'));

  const directAsset = library.describeAsset(directId, bytes, '.jpg');
  await library.admitDecodedCase({
    case_id: directId,
    image_buffer: bytes,
    extension: '.jpg',
    decode: makeDecode(directAsset, 'decode_direct'),
  });

  const result = await migrateLegacyCasesToCorpus({ cases_dir: casesDir, corpus_dir: corpusDir });
  const store = createCorpusStore(corpusDir);
  const [advertisement] = await store.listAdvertisements();
  const [asset] = await store.listAssets();
  const acquisitions = await store.listAcquisitionSources();
  const revisions = await store.listDecodeRevisions();

  assert.equal(result.legacy_case_count, 2);
  assert.equal(result.migrated_legacy_case_count, 2);
  assert.equal(result.excluded_legacy_case_count, 0);
  assert.equal(result.advertisement_count, 1);
  assert.equal(result.asset_count, 1);
  assert.equal(result.reviewed_identity_groups, 1);
  assert.equal(result.decode_revision_count, 2);
  assert.deepEqual(advertisement?.legacy_case_ids, [directId, sourceId]);
  assert.deepEqual(advertisement?.asset_ids, [asset?.asset_id]);
  assert.equal(advertisement?.placement_ids.length, 0);
  assert.deepEqual(
    new Set(acquisitions.map((source) => source.kind)),
    new Set(['direct_upload', 'reddit']),
  );
  assert.equal(revisions.length, 2);
  assert.ok(revisions.every((revision) => revision.advertiser_claims.length === 1));
  assert.ok(
    revisions.every((revision) => revision.interpretations.some((item) => item.kind === 'thesis')),
  );
});

test('legacy migration consolidates reviewed same-Advertisement Cases across distinct Asset binaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-corpus-migrate-nonexact-'));
  const casesDir = join(root, 'cases');
  const corpusDir = join(root, 'corpus');
  const library = createCaseLibrary(casesDir);
  const caseIds = [
    'real-ikea-sleep',
    'real-ikea-reminding-us-the-importance-of-sleep-900x23-7b279bc4',
  ];

  for (const [index, caseId] of caseIds.entries()) {
    const bytes = Buffer.from(`same reviewed creative, distinct reproduction ${index}`);
    const asset = library.describeAsset(caseId, bytes, '.jpg');
    await library.admitDecodedCase({
      case_id: caseId,
      image_buffer: bytes,
      extension: '.jpg',
      decode: makeDecode(asset, `decode_nonexact_${index}`),
    });
  }

  const result = await migrateLegacyCasesToCorpus({ cases_dir: casesDir, corpus_dir: corpusDir });
  const store = createCorpusStore(corpusDir);
  const advertisements = await store.listAdvertisements();
  const assets = await store.listAssets();
  const revisions = await store.listDecodeRevisions();

  assert.equal(result.advertisement_count, 1);
  assert.equal(result.asset_count, 2);
  assert.equal(result.reviewed_identity_groups, 1);
  assert.equal(advertisements.length, 1);
  assert.deepEqual(advertisements[0]?.legacy_case_ids, [...caseIds].sort());
  assert.equal(advertisements[0]?.asset_ids.length, 2);
  assert.equal(assets.length, 2);
  assert.equal(revisions.length, 2);
});

test('legacy migration refuses an unreviewed duplicate Asset identity collision', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-corpus-migrate-unreviewed-'));
  const casesDir = join(root, 'cases');
  const corpusDir = join(root, 'corpus');
  const library = createCaseLibrary(casesDir);
  const bytes = Buffer.from('same but unreviewed advertisement bytes');

  for (const caseId of ['case-one', 'case-two']) {
    const asset = library.describeAsset(caseId, bytes, '.jpg');
    await library.admitDecodedCase({
      case_id: caseId,
      image_buffer: bytes,
      extension: '.jpg',
      decode: makeDecode(asset, `decode_${caseId}`),
    });
  }

  await assert.rejects(
    () => migrateLegacyCasesToCorpus({ cases_dir: casesDir, corpus_dir: corpusDir }),
    /requires an explicit reviewed Advertisement identity disposition/,
  );
});

test('legacy migration quarantines reviewed non-ad placeholder acquisitions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-corpus-migrate-placeholder-'));
  const casesDir = join(root, 'cases');
  const corpusDir = join(root, 'corpus');
  const library = createCaseLibrary(casesDir);
  const bytes = Buffer.from('shared unavailable placeholder');
  const placeholderCases = [
    'real-double-page-hp-laptop-ad-disguised-to-look-like--c32c24f7',
    'real-such-a-great-print-ad-gold-s-gym-7fdfa12e',
    'real-this-is-how-mercedes-benz-advertised-their-stron-8e612d68',
  ];
  for (const caseId of placeholderCases) {
    const asset = library.describeAsset(caseId, bytes, '.jpg');
    await library.admitDecodedCase({
      case_id: caseId,
      image_buffer: bytes,
      extension: '.jpg',
      decode: makeDecode(asset, `decode_${caseId}`),
    });
  }

  const result = await migrateLegacyCasesToCorpus({ cases_dir: casesDir, corpus_dir: corpusDir });
  const store = createCorpusStore(corpusDir);
  const manifest = await store.readMigrationManifest();
  assert.equal(result.advertisement_count, 0);
  assert.equal(result.migrated_legacy_case_count, 0);
  assert.equal(result.excluded_legacy_case_count, 3);
  assert.equal((await store.listDecodeRevisions()).length, 0);
  assert.deepEqual(
    manifest?.exclusions.map((item) => item.legacy_case_id).sort(),
    [...placeholderCases].sort(),
  );
});

test('legacy migration refuses to mix a changed source snapshot into an existing projection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-corpus-migrate-fingerprint-'));
  const casesDir = join(root, 'cases');
  const corpusDir = join(root, 'corpus');
  const library = createCaseLibrary(casesDir);

  const firstBytes = Buffer.from('first source snapshot');
  const firstAsset = library.describeAsset('case-first', firstBytes, '.jpg');
  await library.admitDecodedCase({
    case_id: 'case-first',
    image_buffer: firstBytes,
    extension: '.jpg',
    decode: makeDecode(firstAsset, 'decode_first'),
  });
  await migrateLegacyCasesToCorpus({ cases_dir: casesDir, corpus_dir: corpusDir });

  const secondBytes = Buffer.from('second source snapshot');
  const secondAsset = library.describeAsset('case-second', secondBytes, '.jpg');
  await library.admitDecodedCase({
    case_id: 'case-second',
    image_buffer: secondBytes,
    extension: '.jpg',
    decode: makeDecode(secondAsset, 'decode_second'),
  });

  await assert.rejects(
    () => migrateLegacyCasesToCorpus({ cases_dir: casesDir, corpus_dir: corpusDir }),
    /contains a different projection/,
  );
});

test('legacy migration promotes governed Brand and time facts with provenance without guessing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-corpus-migrate-curated-'));
  const casesDir = join(root, 'cases');
  const corpusDir = join(root, 'corpus');
  const library = createCaseLibrary(casesDir);
  const bytes = Buffer.from('land rover advertisement bytes');
  const caseId = 'real-a-simple-brilliant-ad-by-land-rover-7ecb02ed';
  const pending = await library.admitPendingCase({
    case_id: caseId,
    image_buffer: bytes,
    extension: '.jpg',
    summary: 'A simple, brilliant ad by Land Rover',
    source_url: 'https://reddit.com/r/AdPorn/example',
  });
  await library.saveDecode(caseId, makeDecode(pending.metadata!.asset, 'decode_land_rover'));

  await migrateLegacyCasesToCorpus({ cases_dir: casesDir, corpus_dir: corpusDir });
  const store = createCorpusStore(corpusDir);
  const [advertisement] = await store.listAdvertisements();
  const assertions = await store.listMetadataAssertions();

  assert.deepEqual(advertisement?.brand_ids, ['brand_land_rover']);
  assert.equal(advertisement?.temporal.start_year, 2011);
  assert.equal(advertisement?.temporal.precision, 'year');
  assert.ok(
    assertions.some(
      (item) => item.field === 'temporal' && item.source_refs[0]?.startsWith('https://'),
    ),
  );
});

test('legacy migration fails closed when a Decode EvidenceLink points to missing evidence', async () => {
  const root = await mkdtemp(join(tmpdir(), 'signum-corpus-migrate-bad-evidence-'));
  const casesDir = join(root, 'cases');
  const corpusDir = join(root, 'corpus');
  const library = createCaseLibrary(casesDir);
  const bytes = Buffer.from('broken evidence image');
  const asset = library.describeAsset('case-broken', bytes, '.jpg');
  const decode = makeDecode(asset, 'decode_broken');
  await library.admitDecodedCase({
    case_id: 'case-broken',
    image_buffer: bytes,
    extension: '.jpg',
    decode,
  });
  const draftPath = join(casesDir, 'case-broken', 'draft.json');
  const persisted = JSON.parse(await readFile(draftPath, 'utf8')) as DecodeDraftV1;
  persisted.proposed_decode.interpretive_claims[0]!.evidence_references[0]!.evidence_id = 'missing';
  await writeFile(draftPath, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');

  await assert.rejects(
    () => migrateLegacyCasesToCorpus({ cases_dir: casesDir, corpus_dir: corpusDir }),
    /references missing evidence missing/,
  );

  assert.equal((await createCorpusStore(corpusDir).listAdvertisements()).length, 0);
});
