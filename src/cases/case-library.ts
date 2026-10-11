import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, relative, resolve, sep } from 'node:path';

import type { CaseMetadata } from '../contracts/case-metadata.js';
import type { DecodeDraftV1, DraftAsset, DraftValidationIssue } from '../contracts/decode-draft-v1.js';
import { createControlledVocabularyRegistry } from '../references/controlled-vocabulary-registry.js';
import { validateDecodeDraftV1 } from '../validation/decode-draft-validator.js';

export type CaseStatus = 'pending' | 'decoded';

export interface CaseLibraryEntry {
  readonly case_id: string;
  readonly status: CaseStatus;
  readonly metadata: CaseMetadata | null;
  readonly decode: DecodeDraftV1 | null;
  readonly evidence_types: readonly string[];
  readonly validation_issues: readonly DraftValidationIssue[];
}

export interface CaseAsset {
  readonly path: string;
  readonly mime_type: string;
  readonly bytes: Buffer;
}

export interface AdmitPendingCaseInput {
  readonly case_id: string;
  readonly image_buffer: Buffer;
  readonly extension: string;
  readonly summary: string;
  readonly source_url?: string;
}

export interface AdmitDecodedCaseInput {
  readonly case_id: string;
  readonly image_buffer: Buffer;
  readonly extension: string;
  readonly decode: DecodeDraftV1;
}

export interface CaseLibrary {
  readonly cases_dir: string;
  describeAsset(caseId: string, bytes: Buffer, extension: string): DraftAsset;
  listCases(): Promise<CaseLibraryEntry[]>;
  getCase(caseId: string): Promise<CaseLibraryEntry | null>;
  readAsset(caseId: string): Promise<CaseAsset>;
  admitPendingCase(input: AdmitPendingCaseInput): Promise<CaseLibraryEntry>;
  admitDecodedCase(input: AdmitDecodedCaseInput): Promise<CaseLibraryEntry>;
  saveDecode(caseId: string, decode: DecodeDraftV1): Promise<CaseLibraryEntry>;
}

function normalizeExtension(extension: string): string {
  if (!extension) return '.img';
  return extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
}

function mimeTypeForPath(pathname: string): string {
  switch (extname(pathname).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function assertCaseId(caseId: string): void {
  if (
    caseId.length === 0 ||
    caseId === '.' ||
    caseId === '..' ||
    caseId.includes('/') ||
    caseId.includes('\\')
  ) {
    throw new Error(`Invalid Case id "${caseId}".`);
  }
}

function assertPathInsideCase(caseRoot: string, pathname: string): void {
  const pathFromCase = relative(caseRoot, pathname);
  if (pathFromCase === '..' || pathFromCase.startsWith(`..${sep}`)) {
    throw new Error(`Asset path escapes its Case directory: "${pathname}".`);
  }
}

async function readJsonIfPresent<T>(pathname: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(pathname, 'utf8')) as T;
  } catch (error: unknown) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') return null;
    throw error;
  }
}

async function writeJson(pathname: string, data: unknown): Promise<void> {
  await writeFile(pathname, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function inspectDecode(decode: DecodeDraftV1): readonly DraftValidationIssue[] {
  return validateDecodeDraftV1(decode, {
    reference_registry: createControlledVocabularyRegistry(),
  }).issues;
}

function validateDecode(decode: DecodeDraftV1): readonly DraftValidationIssue[] {
  const validation = validateDecodeDraftV1(decode, {
    reference_registry: createControlledVocabularyRegistry(),
  });
  if (!validation.valid) {
    const details = validation.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join('; ');
    throw new Error(`Decode failed validation${details ? `: ${details}` : '.'}`);
  }
  return validation.issues;
}

export function createCaseLibrary(casesDir = 'cases'): CaseLibrary {
  const root = resolve(casesDir);

  const casePath = (caseId: string): string => {
    assertCaseId(caseId);
    return resolve(root, caseId);
  };
  const manifestPath = (caseId: string): string => resolve(casePath(caseId), 'manifest.json');
  const decodePath = (caseId: string): string => resolve(casePath(caseId), 'draft.json');

  function describeAsset(caseId: string, bytes: Buffer, extension: string): DraftAsset {
    const normalizedExtension = normalizeExtension(extension);
    return {
      asset_id: `asset_${caseId}`,
      media_type: 'image',
      path: `${casesDir}/${caseId}/asset${normalizedExtension}`,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }

  async function getCase(caseId: string): Promise<CaseLibraryEntry | null> {
    const resolvedCasePath = casePath(caseId);
    let directoryStat;
    try {
      directoryStat = await stat(resolvedCasePath);
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') return null;
      throw error;
    }
    if (!directoryStat.isDirectory()) return null;

    const [metadata, decode] = await Promise.all([
      readJsonIfPresent<CaseMetadata>(manifestPath(caseId)),
      readJsonIfPresent<DecodeDraftV1>(decodePath(caseId)),
    ]);
    if (metadata === null && decode === null) return null;

    if (decode !== null) {
      const validationIssues = inspectDecode(decode);
      return {
        case_id: caseId,
        status: 'decoded',
        metadata,
        decode,
        evidence_types: uniqueStrings(decode.evidence_records.map((record) => record.evidence_type)),
        validation_issues: validationIssues,
      };
    }

    return {
      case_id: caseId,
      status: 'pending',
      metadata,
      decode: null,
      evidence_types: [],
      validation_issues: [],
    };
  }

  async function listCases(): Promise<CaseLibraryEntry[]> {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error: unknown) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') return [];
      throw error;
    }

    const cases = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => getCase(entry.name)),
    );
    return cases
      .filter((entry): entry is CaseLibraryEntry => entry !== null)
      .sort((first, second) => first.case_id.localeCompare(second.case_id));
  }

  async function readAsset(caseId: string): Promise<CaseAsset> {
    const entry = await getCase(caseId);
    if (entry === null) throw new Error(`No case named "${caseId}".`);
    const asset = entry.metadata?.asset ?? entry.decode?.asset;
    if (asset === undefined) throw new Error(`Case "${caseId}" has no asset.`);
    const pathname = resolve(asset.path);
    assertPathInsideCase(casePath(caseId), pathname);
    return {
      path: pathname,
      mime_type: mimeTypeForPath(pathname),
      bytes: await readFile(pathname),
    };
  }

  async function admitPendingCase(input: AdmitPendingCaseInput): Promise<CaseLibraryEntry> {
    const targetPath = casePath(input.case_id);
    const asset = describeAsset(input.case_id, input.image_buffer, input.extension);
    const existing = await getCase(input.case_id);
    if (existing?.decode !== null && existing?.decode !== undefined && existing.decode.asset.sha256 !== asset.sha256) {
      throw new Error(`Cannot replace the Asset of Decoded Case "${input.case_id}".`);
    }
    const metadata: CaseMetadata = {
      manifest_id: input.case_id,
      asset,
      summary: input.summary,
      ...(input.source_url ? { source_url: input.source_url } : {}),
    };
    await mkdir(targetPath, { recursive: true });
    await writeFile(resolve(asset.path), input.image_buffer);
    await writeJson(manifestPath(input.case_id), metadata);
    return (await getCase(input.case_id))!;
  }

  async function admitDecodedCase(input: AdmitDecodedCaseInput): Promise<CaseLibraryEntry> {
    validateDecode(input.decode);
    const expectedAsset = describeAsset(input.case_id, input.image_buffer, input.extension);
    if (
      input.decode.asset.sha256 !== expectedAsset.sha256 ||
      input.decode.asset.path !== expectedAsset.path
    ) {
      throw new Error(`Decode asset does not match Case "${input.case_id}".`);
    }
    await mkdir(casePath(input.case_id), { recursive: true });
    await writeFile(resolve(expectedAsset.path), input.image_buffer);
    await writeJson(decodePath(input.case_id), input.decode);
    return (await getCase(input.case_id))!;
  }

  async function saveDecode(caseId: string, decode: DecodeDraftV1): Promise<CaseLibraryEntry> {
    validateDecode(decode);
    const existing = await getCase(caseId);
    if (existing === null) throw new Error(`No case named "${caseId}".`);
    const expectedAsset = existing.metadata?.asset ?? existing.decode?.asset;
    if (
      expectedAsset !== undefined &&
      (decode.asset.sha256 !== expectedAsset.sha256 || decode.asset.path !== expectedAsset.path)
    ) {
      throw new Error(`Decode asset does not match Case "${caseId}".`);
    }
    await writeJson(decodePath(caseId), decode);
    return (await getCase(caseId))!;
  }

  return {
    cases_dir: casesDir,
    describeAsset,
    listCases,
    getCase,
    readAsset,
    admitPendingCase,
    admitDecodedCase,
    saveDecode,
  };
}
