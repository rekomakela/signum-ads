import { createHash } from 'node:crypto';

import { createCaseLibrary, type CaseLibrary } from '../cases/case-library.js';
import type { DecodeDraftV1 } from '../contracts/decode-draft-v1.js';
import { readCorpusAssetImage } from '../corpus/corpus-asset-io.js';
import type { DecodeRevisionRecord } from '../corpus/corpus-records.js';
import { createCorpusStore, type CorpusStore } from '../corpus/corpus-store.js';
import {
  findCanonicalCorpusDecodeRevision,
  findCanonicalDecodeRevision,
  persistCorpusNativeDecode,
  persistDecodeToCorpus,
  resolveCorpusDecodeTarget,
} from '../corpus/decode-persistence-coordinator.js';
import { LEGACY_CASE_EXCLUSIONS, legacyExclusionForCase } from '../corpus/legacy-identity.js';
import {
  decodeImage,
  type ImageDecodeProviderOptions,
} from '../providers/image-decode-provider.js';
import type { ModelClient } from '../providers/model-client.js';
import { createAnalysisIdentity, type AnalysisIdentity } from './analysis-identity.js';

export interface DecodeUploadInput {
  readonly imageBuffer: Buffer;
  readonly mimeType: string;
  readonly originalFilename: string;
  readonly reanalyze?: boolean;
}

export interface DecodedCaseResult {
  readonly slug: string;
  readonly advertisement_id: string;
  readonly decode_revision_id: string;
  readonly analysis_key: string;
  readonly cache_hit: boolean;
  readonly decode: DecodeDraftV1;
}

export interface DecodeModule {
  decodeUpload(input: DecodeUploadInput): Promise<DecodedCaseResult>;
  decodePending(
    caseId: string,
    options?: { readonly reanalyze?: boolean },
  ): Promise<DecodedCaseResult>;
  decodeAdvertisement(
    advertisementId: string,
    options?: { readonly asset_id?: string; readonly reanalyze?: boolean },
  ): Promise<DecodedCaseResult>;
}

export interface DecodeModuleOptions {
  readonly casesDir?: string;
  readonly provider: ImageDecodeProviderOptions;
  readonly library?: CaseLibrary;
  readonly corpusDir?: string;
  readonly corpusStore?: CorpusStore;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

function fileExtension(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? '.img';
}

function sanitizeFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]*$/, '');
  const slugged = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slugged || 'ad';
}

export function slugForImage(filename: string, sha256: string): string {
  return `decoded-${sanitizeFilename(filename)}-${sha256.slice(0, 8)}`;
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function validateUpload(input: DecodeUploadInput): void {
  if (!input.mimeType.startsWith('image/')) {
    throw new Error(
      `Unsupported image type "${input.mimeType}". Use JPEG, PNG, WebP, GIF, or SVG.`,
    );
  }
  if (input.imageBuffer.length === 0) throw new Error('Image is empty.');
  if (input.imageBuffer.length > MAX_IMAGE_BYTES)
    throw new Error('Image is too large (max 20 MB).');
}

function resultFromRevision(
  revision: DecodeRevisionRecord,
  analysisKey: string,
): DecodedCaseResult {
  return {
    slug: revision.source_case_id ?? revision.advertisement_id,
    advertisement_id: revision.advertisement_id,
    decode_revision_id: revision.revision_id,
    analysis_key: analysisKey,
    cache_hit: true,
    decode: revision.legacy_payload as DecodeDraftV1,
  };
}

function resultFor(
  caseId: string,
  decode: DecodeDraftV1,
  persistence: { advertisement_id: string; revision_id: string },
  analysisKey: string,
): DecodedCaseResult {
  return {
    slug: caseId,
    advertisement_id: persistence.advertisement_id,
    decode_revision_id: persistence.revision_id,
    analysis_key: analysisKey,
    cache_hit: false,
    decode,
  };
}

export function createDecodeModule(
  client: ModelClient,
  options: DecodeModuleOptions,
): DecodeModule {
  const library = options.library ?? createCaseLibrary(options.casesDir ?? 'cases');
  const corpus =
    options.corpusStore ?? createCorpusStore(options.corpusDir ?? '.state/corpus-v0.1');
  const inFlight = new Map<string, Promise<DecodedCaseResult>>();

  async function quarantinedAssetHashes(): Promise<Set<string>> {
    const hashes = new Set<string>();
    for (const exclusion of LEGACY_CASE_EXCLUSIONS) {
      const entry = await library.getCase(exclusion.case_id);
      const asset = entry?.metadata?.asset ?? entry?.decode?.asset;
      if (asset) hashes.add(asset.sha256);
    }
    return hashes;
  }

  async function withAnalysisLock(
    key: string,
    operation: () => Promise<DecodedCaseResult>,
  ): Promise<DecodedCaseResult> {
    const active = inFlight.get(key);
    if (active) return active;
    const promise = operation().finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
    inFlight.set(key, promise);
    return promise;
  }

  async function existingCanonical(
    caseId: string,
    assetSha256: string,
    identity: AnalysisIdentity,
    quarantinedHashes: ReadonlySet<string>,
  ): Promise<DecodedCaseResult | null> {
    const match = await findCanonicalDecodeRevision(corpus, {
      case_id: caseId,
      asset_sha256: assetSha256,
      analysis_key: identity.analysis_key,
      quarantined: legacyExclusionForCase(caseId) !== null,
      quarantined_asset_sha256: quarantinedHashes,
    });
    return match.revision ? resultFromRevision(match.revision, identity.analysis_key) : null;
  }

  async function nextReanalysisRequestKey(identity: AnalysisIdentity): Promise<string> {
    const count = (await corpus.listDecodeRevisions()).filter(
      (revision) =>
        revision.analysis_key === identity.analysis_key &&
        revision.analysis_request_key?.startsWith('reanalysis:'),
    ).length;
    return `reanalysis:${count + 1}`;
  }

  async function persistDecode(
    caseId: string,
    decode: DecodeDraftV1,
    identity: AnalysisIdentity,
    requestKey: string,
  ): Promise<DecodedCaseResult> {
    const entry = await library.getCase(caseId);
    const persistence = await persistDecodeToCorpus(corpus, {
      case_id: caseId,
      decode,
      source_url: entry?.metadata?.source_url ?? null,
      source_title: entry?.metadata?.summary ?? null,
      acquisition_kind: entry?.metadata?.source_url ? 'web' : 'direct_upload',
      quarantined: legacyExclusionForCase(caseId) !== null,
      quarantined_asset_sha256: await quarantinedAssetHashes(),
      analysis_identity: {
        analysis_key: identity.analysis_key,
        method_version: identity.method_version,
        prompt_version: identity.prompt_version,
        provider_id: identity.provider_id,
        request_key: requestKey,
      },
    });
    return resultFor(caseId, decode, persistence, identity.analysis_key);
  }

  async function decodeUpload(input: DecodeUploadInput): Promise<DecodedCaseResult> {
    validateUpload(input);
    const sha256 = createHash('sha256').update(input.imageBuffer).digest('hex');
    const slug = slugForImage(input.originalFilename, sha256);
    const extension = fileExtension(input.mimeType);
    const asset = library.describeAsset(slug, input.imageBuffer, extension);
    const identity = createAnalysisIdentity(sha256, options.provider);
    const lockKey = `${identity.analysis_key}:${input.reanalyze ? 'reanalysis' : 'canonical'}`;

    return withAnalysisLock(lockKey, async () => {
      const quarantinedHashes = await quarantinedAssetHashes();
      if (!input.reanalyze) {
        const cached = await existingCanonical(slug, sha256, identity, quarantinedHashes);
        if (cached) return cached;
      } else {
        // Re-use the resolver as a fail-closed identity preflight before inference.
        await findCanonicalDecodeRevision(corpus, {
          case_id: slug,
          asset_sha256: sha256,
          analysis_key: identity.analysis_key,
          quarantined: legacyExclusionForCase(slug) !== null,
          quarantined_asset_sha256: quarantinedHashes,
        });
      }

      const decode = await decodeImage(client, {
        asset,
        image: {
          mime_type: input.mimeType,
          base64: input.imageBuffer.toString('base64'),
        },
        provider: options.provider,
      });

      const existingCase = await library.getCase(slug);
      if (existingCase === null) {
        await library.admitDecodedCase({
          case_id: slug,
          image_buffer: input.imageBuffer,
          extension,
          decode,
        });
      }
      const requestKey = input.reanalyze ? await nextReanalysisRequestKey(identity) : 'canonical';
      return persistDecode(slug, decode, identity, requestKey);
    });
  }

  async function decodePending(
    caseId: string,
    decodeOptions: { readonly reanalyze?: boolean } = {},
  ): Promise<DecodedCaseResult> {
    const entry = await library.getCase(caseId);
    if (entry === null) throw new Error(`No case named "${caseId}".`);
    const sourceAsset = entry.metadata?.asset ?? entry.decode?.asset;
    if (sourceAsset === undefined) throw new Error(`Case "${caseId}" has no Asset.`);
    const identity = createAnalysisIdentity(sourceAsset.sha256, options.provider);
    const lockKey = `${identity.analysis_key}:${decodeOptions.reanalyze ? 'reanalysis' : 'canonical'}`;

    return withAnalysisLock(lockKey, async () => {
      const quarantinedHashes = await quarantinedAssetHashes();
      if (!decodeOptions.reanalyze) {
        const cached = await existingCanonical(
          caseId,
          sourceAsset.sha256,
          identity,
          quarantinedHashes,
        );
        if (cached) return cached;
      } else {
        await findCanonicalDecodeRevision(corpus, {
          case_id: caseId,
          asset_sha256: sourceAsset.sha256,
          analysis_key: identity.analysis_key,
          quarantined: legacyExclusionForCase(caseId) !== null,
          quarantined_asset_sha256: quarantinedHashes,
        });
      }

      const asset = await library.readAsset(caseId);
      const decode = await decodeImage(client, {
        asset: sourceAsset,
        image: {
          mime_type: asset.mime_type,
          base64: asset.bytes.toString('base64'),
        },
        provider: options.provider,
      });
      if (entry.decode === null) await library.saveDecode(caseId, decode);
      const requestKey = decodeOptions.reanalyze
        ? await nextReanalysisRequestKey(identity)
        : 'canonical';
      return persistDecode(caseId, decode, identity, requestKey);
    });
  }

  async function decodeAdvertisement(
    advertisementId: string,
    decodeOptions: { readonly asset_id?: string; readonly reanalyze?: boolean } = {},
  ): Promise<DecodedCaseResult> {
    const initialTarget = await resolveCorpusDecodeTarget(corpus, {
      advertisement_id: advertisementId,
      ...(decodeOptions.asset_id !== undefined ? { asset_id: decodeOptions.asset_id } : {}),
    });
    const identity = createAnalysisIdentity(initialTarget.asset.sha256, options.provider);
    const lockKey = `corpus:${advertisementId}:${initialTarget.asset.asset_id}:${identity.analysis_key}:${decodeOptions.reanalyze ? 'reanalysis' : 'canonical'}`;

    return withAnalysisLock(lockKey, async () => {
      if (!decodeOptions.reanalyze) {
        const cached = await findCanonicalCorpusDecodeRevision(corpus, {
          advertisement_id: advertisementId,
          asset_id: initialTarget.asset.asset_id,
          analysis_key: identity.analysis_key,
        });
        if (cached.revision !== null) {
          return resultFromRevision(cached.revision, identity.analysis_key);
        }
      } else {
        await resolveCorpusDecodeTarget(corpus, {
          advertisement_id: advertisementId,
          asset_id: initialTarget.asset.asset_id,
        });
      }

      const storedImage = await readCorpusAssetImage(corpus, initialTarget.asset);
      const decode = await decodeImage(client, {
        asset: {
          asset_id: initialTarget.asset.asset_id,
          media_type: 'image',
          path: initialTarget.asset.storage_path!,
          sha256: initialTarget.asset.sha256,
        },
        image: { mime_type: storedImage.mime_type, base64: storedImage.bytes.toString('base64') },
        provider: options.provider,
      });
      const requestKey = decodeOptions.reanalyze
        ? await nextReanalysisRequestKey(identity)
        : 'canonical';
      const persistence = await persistCorpusNativeDecode(corpus, {
        advertisement_id: advertisementId,
        asset_id: initialTarget.asset.asset_id,
        decode,
        analysis_identity: {
          analysis_key: identity.analysis_key,
          method_version: identity.method_version,
          prompt_version: identity.prompt_version,
          provider_id: identity.provider_id,
          request_key: requestKey,
        },
      });
      return resultFor(advertisementId, decode, persistence, identity.analysis_key);
    });
  }

  return { decodeUpload, decodePending, decodeAdvertisement };
}
