import { extname } from 'node:path';

import {
  createCaseLibrary,
  type CaseLibrary,
  type CaseLibraryEntry,
} from '../cases/case-library.js';
import type { DecodeDraftV1 } from '../contracts/decode-draft-v1.js';
import { readCorpusAssetImage } from '../corpus/corpus-asset-io.js';
import { createCorpusStore, type CorpusStore } from '../corpus/corpus-store.js';
import type { AdvertisementRecord, DecodeRevisionRecord } from '../corpus/corpus-records.js';
import {
  archiveEditorialCopy,
  formatTemporalLabel,
  type ArchiveEditorialMetadata,
} from './archive-metadata.js';

export interface SignumWorkbenchAssetData {
  readonly alt: string;
  readonly src: string | null;
  readonly sha256: string;
}

export interface SignumWorkbenchObservationData {
  readonly ref: string;
  readonly evidence_type: string;
  readonly description: string;
  readonly location: string | null;
  readonly confidence: string;
}

export interface SignumWorkbenchClaimEvidenceData {
  readonly ref: string;
  readonly support: string;
}

export interface SignumWorkbenchClaimReferenceData {
  readonly reference_type: string;
  readonly reference_value: string;
  readonly required_for_claim: boolean;
}

export interface SignumWorkbenchClaimData {
  readonly ref: string;
  readonly kind: string;
  readonly text: string;
  readonly evidence_refs: readonly SignumWorkbenchClaimEvidenceData[];
  readonly references: readonly SignumWorkbenchClaimReferenceData[];
}

export interface SignumWorkbenchCaseData {
  readonly advertisement_id: string;
  readonly case_id: string;
  readonly compatibility_case_id: string | null;
  readonly title: string;
  readonly summary: string | null;
  readonly source_url: string | null;
  readonly archive: ArchiveEditorialMetadata;
  readonly status: CaseLibraryEntry['status'];
  readonly evidence_types: readonly string[];
  readonly unresolved_reference_count: number | null;
  readonly asset: SignumWorkbenchAssetData;
  readonly observations: readonly SignumWorkbenchObservationData[];
  readonly claims: readonly SignumWorkbenchClaimData[];
}

export interface SignumWorkbenchData {
  readonly generated_at: string;
  readonly cases: readonly SignumWorkbenchCaseData[];
}

export interface PublishedFrontendAsset {
  readonly relative_path: string;
  readonly bytes: Buffer;
}

export interface SignumFrontendArtifacts {
  readonly dataset: SignumWorkbenchData;
  readonly assets: readonly PublishedFrontendAsset[];
}

interface SummarizedCase {
  readonly data: SignumWorkbenchCaseData;
  readonly asset: PublishedFrontendAsset | null;
}

function toObservationFromDecode(
  data: DecodeDraftV1['evidence_records'][number],
): SignumWorkbenchObservationData {
  return {
    ref: data.evidence_id,
    evidence_type: data.evidence_type,
    description: data.description,
    location: data.location,
    confidence: data.confidence,
  };
}

function toClaimFromDecode(
  data: DecodeDraftV1['proposed_decode']['interpretive_claims'][number],
): SignumWorkbenchClaimData {
  return {
    ref: data.claim_id,
    kind: data.kind,
    text: data.text,
    evidence_refs: data.evidence_references.map((reference) => ({
      ref: reference.evidence_id,
      support: reference.support,
    })),
    references: data.references.map((reference) => ({
      reference_type: reference.reference_type,
      reference_value: reference.reference_value,
      required_for_claim: reference.required_for_claim,
    })),
  };
}

function assetRelativePath(caseId: string, pathname: string): string {
  const extension = extname(pathname).toLowerCase() || '.img';
  return `generated/cases/${caseId}/asset${extension}`;
}

async function summarizeAdvertisement(
  advertisement: AdvertisementRecord,
  revision: DecodeRevisionRecord,
  library: CaseLibrary,
  corpus: CorpusStore,
  brandName: string | null,
  sourceUrl: string | null,
  sourceTitle: string | null,
): Promise<SummarizedCase> {
  const decode = revision.legacy_payload as DecodeDraftV1;
  const observations = (decode.evidence_records ?? []).map(toObservationFromDecode);
  const claims = (decode.proposed_decode.interpretive_claims ?? []).map(toClaimFromDecode);

  if (revision.source_case_id !== null) {
    const item = await library.getCase(revision.source_case_id);
    if (item === null) {
      throw new Error(
        `Legacy DecodeRevision ${revision.revision_id} references missing Case ${revision.source_case_id}.`,
      );
    }
    const metadata = item.metadata;
    const sourceAsset = metadata?.asset ?? decode.asset;
    const storedAsset = await library.readAsset(item.case_id);
    const publishedAsset = {
      relative_path: assetRelativePath(advertisement.advertisement_id, storedAsset.path),
      bytes: storedAsset.bytes,
    };
    const summary = decode.proposed_decode.summary ?? metadata?.summary ?? null;
    return {
      data: {
        advertisement_id: advertisement.advertisement_id,
        case_id: advertisement.advertisement_id,
        compatibility_case_id: item.case_id,
        title: metadata?.summary ?? decode.proposed_decode.summary ?? item.case_id,
        summary,
        source_url: sourceUrl,
        archive: {
          brand: brandName,
          year_label: formatTemporalLabel(advertisement.temporal),
          analytical_title: archiveEditorialCopy(item.case_id)?.analytical_title ?? null,
          analytical_deck: archiveEditorialCopy(item.case_id)?.analytical_deck ?? null,
        },
        status: 'decoded',
        evidence_types: item.evidence_types,
        unresolved_reference_count:
          item.status === 'decoded'
            ? item.validation_issues.filter((issue) => issue.code === 'unresolved_reference').length
            : null,
        asset: {
          alt: metadata?.summary ?? `${item.case_id} asset`,
          src: `/${publishedAsset.relative_path}`,
          sha256: sourceAsset.sha256,
        },
        observations,
        claims,
      },
      asset: publishedAsset,
    };
  }

  const assetRecord = await corpus.readAsset(revision.asset_id);
  if (assetRecord === null) {
    throw new Error(
      `Corpus-native DecodeRevision ${revision.revision_id} references missing Asset ${revision.asset_id}.`,
    );
  }
  const storedImage = await readCorpusAssetImage(corpus, assetRecord);
  const publishedAsset = {
    relative_path: `generated/cases/${advertisement.advertisement_id}/asset${storedImage.extension}`,
    bytes: storedImage.bytes,
  };
  const summary = decode.proposed_decode.summary ?? null;
  const title = sourceTitle ?? summary ?? advertisement.advertisement_id;
  return {
    data: {
      advertisement_id: advertisement.advertisement_id,
      case_id: advertisement.advertisement_id,
      compatibility_case_id: null,
      title,
      summary,
      source_url: sourceUrl,
      archive: {
        brand: brandName,
        year_label: formatTemporalLabel(advertisement.temporal),
        analytical_title: null,
        analytical_deck: null,
      },
      status: 'decoded',
      evidence_types: [
        ...new Set((decode.evidence_records ?? []).map((item) => item.evidence_type)),
      ],
      unresolved_reference_count: null,
      asset: {
        alt: sourceTitle ?? `${advertisement.advertisement_id} advertisement`,
        src: `/${publishedAsset.relative_path}`,
        sha256: assetRecord.sha256,
      },
      observations,
      claims,
    },
    asset: publishedAsset,
  };
}

export async function buildSignumFrontendArtifacts(
  casesDir = 'cases',
  corpusDir = '.state/corpus-v0.1',
): Promise<SignumFrontendArtifacts> {
  const library = createCaseLibrary(casesDir);
  const corpus = createCorpusStore(corpusDir);
  const [advertisements, revisions, brands, acquisitions] = await Promise.all([
    corpus.listAdvertisements(),
    corpus.listDecodeRevisions(),
    corpus.listBrands(),
    corpus.listAcquisitionSources(),
  ]);
  const revisionById = new Map(revisions.map((revision) => [revision.revision_id, revision]));
  const brandById = new Map(brands.map((brand) => [brand.brand_id, brand]));
  const acquisitionById = new Map(
    acquisitions.map((acquisition) => [acquisition.acquisition_source_id, acquisition]),
  );
  const summarized = await Promise.all(
    advertisements.map(async (advertisement) => {
      const revision = advertisement.decode_revision_ids
        .map((id) => revisionById.get(id))
        .filter((value): value is DecodeRevisionRecord => value !== undefined)
        .sort((a, b) =>
          a.generated_at === b.generated_at
            ? a.revision_id.localeCompare(b.revision_id)
            : a.generated_at.localeCompare(b.generated_at),
        )
        .at(-1);
      if (!revision) return null;
      const brandName =
        advertisement.brand_ids
          .map((id) => brandById.get(id)?.canonical_name)
          .find((value): value is string => value !== undefined) ?? null;
      const sourceUrl =
        advertisement.acquisition_source_ids
          .map((id) => acquisitionById.get(id)?.source_url)
          .find((value): value is string => value !== null && value !== undefined) ?? null;
      const sourceTitle =
        advertisement.acquisition_source_ids
          .map((id) => acquisitionById.get(id)?.source_title)
          .find((value): value is string => value !== null && value !== undefined) ?? null;
      return summarizeAdvertisement(
        advertisement,
        revision,
        library,
        corpus,
        brandName,
        sourceUrl,
        sourceTitle,
      );
    }),
  );
  const cases = summarized.filter((value): value is SummarizedCase => value !== null);

  return {
    dataset: {
      generated_at: new Date().toISOString(),
      cases: cases.map((value) => value.data),
    },
    assets: cases.flatMap((value) => (value.asset === null ? [] : [value.asset])),
  };
}
