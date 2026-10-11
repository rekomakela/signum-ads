import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import type {
  AcquisitionSourceRecord,
  AdvertisementRecord,
  AssetRecord,
  BrandRecord,
  CorpusMigrationManifest,
  CorpusRelationshipRecord,
  DecodeRevisionRecord,
  MetadataAssertionRecord,
  ProductRecord,
} from './corpus-records.js';

type CorpusRecord =
  | AcquisitionSourceRecord
  | AdvertisementRecord
  | AssetRecord
  | BrandRecord
  | CorpusRelationshipRecord
  | DecodeRevisionRecord
  | MetadataAssertionRecord
  | ProductRecord;

type RecordKind =
  | 'advertisements'
  | 'assets'
  | 'brands'
  | 'products'
  | 'acquisition-sources'
  | 'metadata-assertions'
  | 'decode-revisions'
  | 'relationships';

const RECORD_ID = /^[a-z0-9][a-z0-9._-]*$/i;

export interface CorpusStore {
  readonly root: string;
  putAdvertisement(record: AdvertisementRecord): Promise<void>;
  appendAdvertisementReferences(record: AdvertisementRecord): Promise<void>;
  promoteAdvertisementMetadata(record: AdvertisementRecord): Promise<void>;
  putAsset(record: AssetRecord): Promise<void>;
  appendAssetReferences(record: AssetRecord): Promise<void>;
  putBrand(record: BrandRecord): Promise<void>;
  putProduct(record: ProductRecord): Promise<void>;
  putAcquisitionSource(record: AcquisitionSourceRecord): Promise<void>;
  putMetadataAssertion(record: MetadataAssertionRecord): Promise<void>;
  putDecodeRevision(record: DecodeRevisionRecord): Promise<void>;
  putRelationship(record: CorpusRelationshipRecord): Promise<void>;
  writeMigrationManifest(manifest: CorpusMigrationManifest): Promise<void>;
  readMigrationManifest(): Promise<CorpusMigrationManifest | null>;
  readAdvertisement(id: string): Promise<AdvertisementRecord | null>;
  readAsset(id: string): Promise<AssetRecord | null>;
  readBrand(id: string): Promise<BrandRecord | null>;
  readDecodeRevision(id: string): Promise<DecodeRevisionRecord | null>;
  listAdvertisements(): Promise<AdvertisementRecord[]>;
  listAssets(): Promise<AssetRecord[]>;
  listBrands(): Promise<BrandRecord[]>;
  listProducts(): Promise<ProductRecord[]>;
  listAcquisitionSources(): Promise<AcquisitionSourceRecord[]>;
  listMetadataAssertions(): Promise<MetadataAssertionRecord[]>;
  listDecodeRevisions(): Promise<DecodeRevisionRecord[]>;
  listRelationships(): Promise<CorpusRelationshipRecord[]>;
}

function assertRecordId(id: string): void {
  if (!RECORD_ID.test(id)) throw new Error(`Invalid corpus record id: ${id}`);
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await stat(pathname);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function createCorpusStore(rootDir: string): CorpusStore {
  const root = resolve(rootDir);
  let aggregateWrite = Promise.resolve();
  const recordPath = (kind: RecordKind, id: string): string => {
    assertRecordId(id);
    return resolve(root, kind, `${id}.json`);
  };

  async function putImmutable(kind: RecordKind, id: string, record: CorpusRecord): Promise<void> {
    const pathname = recordPath(kind, id);
    const body = stableJson(record);
    await mkdir(dirname(pathname), { recursive: true });
    if (await pathExists(pathname)) {
      const existing = await readFile(pathname, 'utf8');
      if (existing !== body) {
        throw new Error(
          `Corpus record conflict for ${kind}/${id}; immutable records cannot be replaced.`,
        );
      }
      return;
    }
    const temp = `${pathname}.tmp-${process.pid}-${randomUUID()}`;
    await writeFile(temp, body, { encoding: 'utf8', flag: 'wx' });
    await rename(temp, pathname);
  }

  async function putAppendOnlyAggregate(
    kind: 'advertisements' | 'assets',
    id: string,
    record: AdvertisementRecord | AssetRecord,
  ): Promise<void> {
    const operation = aggregateWrite.then(async () => {
      const existing = await readRecord<AdvertisementRecord | AssetRecord>(kind, id);
      if (existing === null) {
        await putImmutable(kind, id, record);
        return;
      }
      const arrayKeys =
        kind === 'advertisements'
          ? ['asset_ids', 'acquisition_source_ids', 'decode_revision_ids', 'legacy_case_ids']
          : ['legacy_paths', 'acquisition_source_ids'];
      const existingObject = existing as unknown as Record<string, unknown>;
      const nextObject = record as unknown as Record<string, unknown>;
      const permittedNewKeys = kind === 'assets' ? new Set(['storage_path']) : new Set<string>();
      const unexpectedNewKeys = Object.keys(nextObject).filter(
        (key) => !(key in existingObject) && !permittedNewKeys.has(key),
      );
      if (unexpectedNewKeys.length > 0) {
        throw new Error(`Corpus ${kind}/${id} cannot change its archival record shape.`);
      }
      for (const key of Object.keys(existingObject)) {
        if (!(key in nextObject)) {
          if (kind === 'assets' && key === 'storage_path') continue;
          throw new Error(`Corpus ${kind}/${id} cannot remove archival field ${key}.`);
        }
        if (arrayKeys.includes(key)) {
          const oldValues = existingObject[key] as readonly string[];
          const nextValues = nextObject[key] as readonly string[];
          if (oldValues.some((value) => !nextValues.includes(value))) {
            throw new Error(`Corpus ${kind}/${id} cannot remove append-only ${key} references.`);
          }
        } else if (JSON.stringify(existingObject[key]) !== JSON.stringify(nextObject[key])) {
          throw new Error(`Corpus ${kind}/${id} cannot change archival field ${key}.`);
        }
      }
      const persistedRecord =
        kind === 'assets' && 'storage_path' in existingObject && !('storage_path' in nextObject)
          ? ({ ...record, storage_path: existingObject.storage_path } as AssetRecord)
          : record;
      const pathname = recordPath(kind, id);
      const temp = `${pathname}.tmp-${process.pid}-${randomUUID()}`;
      await writeFile(temp, stableJson(persistedRecord), { encoding: 'utf8', flag: 'wx' });
      await rename(temp, pathname);
    });
    aggregateWrite = operation.catch(() => undefined);
    await operation;
  }

  async function promoteAdvertisementMetadata(record: AdvertisementRecord): Promise<void> {
    const operation = aggregateWrite.then(async () => {
      const existing = await readRecord<AdvertisementRecord>(
        'advertisements',
        record.advertisement_id,
      );
      if (existing === null) {
        throw new Error(
          `Corpus Advertisement ${record.advertisement_id} must exist before metadata promotion.`,
        );
      }
      const immutableKeys: readonly (keyof AdvertisementRecord)[] = [
        'schema_version',
        'advertisement_id',
        'asset_ids',
        'brand_ids',
        'product_ids',
        'campaign_ids',
        'placement_ids',
        'market_ids',
        'acquisition_source_ids',
        'decode_revision_ids',
        'legacy_case_ids',
      ];
      for (const key of immutableKeys) {
        if (JSON.stringify(existing[key]) !== JSON.stringify(record[key])) {
          throw new Error(
            `Corpus Advertisement ${record.advertisement_id} metadata promotion cannot change ${String(key)}.`,
          );
        }
      }
      if (
        existing.metadata_assertion_ids.some(
          (assertionId) => !record.metadata_assertion_ids.includes(assertionId),
        )
      ) {
        throw new Error(
          `Corpus Advertisement ${record.advertisement_id} cannot remove metadata assertion references.`,
        );
      }
      const temporalChanged = JSON.stringify(existing.temporal) !== JSON.stringify(record.temporal);
      if (temporalChanged) {
        if (existing.temporal.precision !== 'unknown' || record.temporal.precision === 'unknown') {
          throw new Error(
            `Corpus Advertisement ${record.advertisement_id} temporal metadata can only be promoted from unknown to a known extent.`,
          );
        }
        if (record.metadata_assertion_ids.length <= existing.metadata_assertion_ids.length) {
          throw new Error(
            `Corpus Advertisement ${record.advertisement_id} temporal promotion requires a new metadata assertion reference.`,
          );
        }
      }
      const pathname = recordPath('advertisements', record.advertisement_id);
      const temp = `${pathname}.tmp-${process.pid}-${randomUUID()}`;
      await writeFile(temp, stableJson(record), { encoding: 'utf8', flag: 'wx' });
      await rename(temp, pathname);
    });
    aggregateWrite = operation.catch(() => undefined);
    await operation;
  }

  async function readRecord<T>(kind: RecordKind, id: string): Promise<T | null> {
    const pathname = recordPath(kind, id);
    try {
      return JSON.parse(await readFile(pathname, 'utf8')) as T;
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async function listRecords<T>(kind: RecordKind): Promise<T[]> {
    const directory = resolve(root, kind);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const records = await Promise.all(
      names
        .filter((name) => name.endsWith('.json'))
        .sort()
        .map(async (name) => JSON.parse(await readFile(resolve(directory, name), 'utf8')) as T),
    );
    return records;
  }

  return {
    root,
    putAdvertisement: (record) => putImmutable('advertisements', record.advertisement_id, record),
    appendAdvertisementReferences: (record) =>
      putAppendOnlyAggregate('advertisements', record.advertisement_id, record),
    promoteAdvertisementMetadata,
    putAsset: (record) => putImmutable('assets', record.asset_id, record),
    appendAssetReferences: (record) => putAppendOnlyAggregate('assets', record.asset_id, record),
    putBrand: (record) => putImmutable('brands', record.brand_id, record),
    putProduct: (record) => putImmutable('products', record.product_id, record),
    putAcquisitionSource: (record) =>
      putImmutable('acquisition-sources', record.acquisition_source_id, record),
    putMetadataAssertion: (record) =>
      putImmutable('metadata-assertions', record.assertion_id, record),
    putDecodeRevision: (record) => putImmutable('decode-revisions', record.revision_id, record),
    putRelationship: (record) => putImmutable('relationships', record.relationship_id, record),
    async writeMigrationManifest(manifest) {
      const pathname = resolve(root, 'migration-manifest.json');
      await mkdir(root, { recursive: true });
      await writeFile(pathname, stableJson(manifest), 'utf8');
    },
    async readMigrationManifest() {
      const pathname = resolve(root, 'migration-manifest.json');
      try {
        return JSON.parse(await readFile(pathname, 'utf8')) as CorpusMigrationManifest;
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    readAdvertisement: (id) => readRecord('advertisements', id),
    readAsset: (id) => readRecord('assets', id),
    readBrand: (id) => readRecord('brands', id),
    readDecodeRevision: (id) => readRecord('decode-revisions', id),
    listAdvertisements: () => listRecords('advertisements'),
    listAssets: () => listRecords('assets'),
    listBrands: () => listRecords('brands'),
    listProducts: () => listRecords('products'),
    listAcquisitionSources: () => listRecords('acquisition-sources'),
    listMetadataAssertions: () => listRecords('metadata-assertions'),
    listDecodeRevisions: () => listRecords('decode-revisions'),
    listRelationships: () => listRecords('relationships'),
  };
}
