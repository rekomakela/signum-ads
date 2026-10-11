import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import {
  CORPUS_RECORD_VERSION,
  type AdvertisementRecord,
  type DecodeRevisionRecord,
} from '../src/corpus/corpus-records.js';
import {
  buildCorpusQueryIndex,
  queryBrandByMeaningMechanism,
  queryBrandByTime,
  queryConceptByTime,
  queryProductCategoryByCulturalCode,
  resolveBrandByName,
} from '../src/corpus/corpus-query.js';
import { createCorpusStore } from '../src/corpus/corpus-store.js';

const temporal1987 = {
  start_year: 1987,
  end_year: 1987,
  precision: 'year' as const,
  start_date: null,
  end_date: null,
};

test('corpus queries use structured Brand, time, category, mechanism, and concept fields', async () => {
  const store = createCorpusStore(await mkdtemp(join(tmpdir(), 'signum-corpus-query-')));
  await store.putBrand({
    schema_version: CORPUS_RECORD_VERSION,
    brand_id: 'brand_example',
    canonical_name: 'Example Brand',
    aliases: ['Example'],
    parent_organization_id: null,
    country_of_origin: null,
    status: 'active',
  });
  await store.putProduct({
    schema_version: CORPUS_RECORD_VERSION,
    product_id: 'product_example',
    canonical_name: 'Example Product',
    category_ids: ['category_fashion'],
  });
  const advertisement: AdvertisementRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    advertisement_id: 'ad_example',
    asset_ids: [],
    brand_ids: ['brand_example'],
    product_ids: ['product_example'],
    campaign_ids: [],
    placement_ids: [],
    market_ids: [],
    temporal: temporal1987,
    acquisition_source_ids: [],
    metadata_assertion_ids: [],
    decode_revision_ids: ['decode_example'],
    legacy_case_ids: [],
  };
  await store.putAdvertisement(advertisement);
  const revision: DecodeRevisionRecord = {
    schema_version: CORPUS_RECORD_VERSION,
    revision_id: 'decode_example',
    advertisement_id: 'ad_example',
    asset_id: 'asset_missing_for_query_only',
    source_case_id: 'case_example',
    model: 'Test',
    model_version: '1',
    analysis_schema_version: 'test.v1',
    ontology_version: 'signum_corpus_model.v0.1',
    generated_at: '1987-01-01T00:00:00.000Z',
    pipeline_version: 'test',
    legacy_decode_id: 'legacy',
    observations: [],
    advertiser_claims: [],
    evidence_links: [],
    interpretations: [
      {
        interpretation_id: 'interp_example',
        kind: 'semiotic',
        stance: 'primary',
        text: 'Structured query fixture.',
        evidence_link_ids: [],
        supporting_interpretation_ids: [],
        legacy_claim_id: null,
        concept_refs: [
          {
            concept_id: 'mechanism_metonymy',
            family: 'MeaningMechanism',
            legacy_reference_type: 'meaning_mechanism',
            required_for_interpretation: true,
          },
          {
            concept_id: 'code_status',
            family: 'CulturalCode',
            legacy_reference_type: 'cultural_code',
            required_for_interpretation: true,
          },
        ],
      },
    ],
    legacy_payload: {},
  };
  await store.putDecodeRevision(revision);

  const index = await buildCorpusQueryIndex(store);
  assert.equal(resolveBrandByName(index, 'Example')?.brand_id, 'brand_example');
  assert.deepEqual(
    queryBrandByTime(index, 'brand_example', 1987).map((item) => item.advertisement_id),
    ['ad_example'],
  );
  assert.deepEqual(
    queryBrandByMeaningMechanism(index, 'brand_example', 'mechanism_metonymy').map(
      (item) => item.advertisement_id,
    ),
    ['ad_example'],
  );
  assert.deepEqual(
    queryProductCategoryByCulturalCode(index, 'category_fashion', 'code_status').map(
      (item) => item.advertisement_id,
    ),
    ['ad_example'],
  );
  assert.deepEqual(
    queryConceptByTime(index, 'code_status', 1987).map((item) => item.advertisement_id),
    ['ad_example'],
  );
});
