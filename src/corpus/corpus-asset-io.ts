import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { AssetRecord } from './corpus-records.js';
import type { CorpusStore } from './corpus-store.js';

export interface CorpusAssetImage {
  readonly bytes: Buffer;
  readonly mime_type: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  readonly extension: '.jpg' | '.png' | '.webp' | '.gif';
  readonly pathname: string;
}

function imageFormat(bytes: Buffer): Pick<CorpusAssetImage, 'mime_type' | 'extension'> {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime_type: 'image/jpeg', extension: '.jpg' };
  }
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime_type: 'image/png', extension: '.png' };
  }
  if (bytes.length >= 6) {
    const header = bytes.subarray(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') {
      return { mime_type: 'image/gif', extension: '.gif' };
    }
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime_type: 'image/webp', extension: '.webp' };
  }
  throw new Error('Corpus Asset bytes are not a supported JPEG, PNG, WebP, or GIF image.');
}

export async function readCorpusAssetImage(
  store: CorpusStore,
  asset: AssetRecord,
): Promise<CorpusAssetImage> {
  if (asset.storage_path === undefined) {
    throw new Error(
      `Corpus Asset ${asset.asset_id} has no corpus-owned storage_path; corpus-native reads are unavailable.`,
    );
  }
  const pathname = resolve(store.root, asset.storage_path);
  const bytes = await readFile(pathname);
  const actualSha256 = createHash('sha256').update(bytes).digest('hex');
  if (actualSha256 !== asset.sha256) {
    throw new Error(
      `Corpus Asset ${asset.asset_id} blob SHA-256 drift: expected ${asset.sha256}, got ${actualSha256}.`,
    );
  }
  const format = imageFormat(bytes);
  return { bytes, pathname, ...format };
}
