import { createHash } from 'node:crypto';

import type { AdvertisementRecord } from './corpus-records.js';
import type { CorpusStore } from './corpus-store.js';

export interface AdvertisementIdentityResolution {
  readonly kind: 'existing' | 'new';
  readonly advertisement_id: string;
  readonly advertisement: AdvertisementRecord | null;
}

export interface AdvertisementIdentityInput {
  readonly asset_sha256: string;
  readonly acquisition_key: string;
  readonly quarantined: boolean;
  readonly quarantined_asset_sha256?: ReadonlySet<string>;
}

function stableAdvertisementId(acquisitionKey: string): string {
  return `ad_${createHash('sha256').update(`acquisition:${acquisitionKey}`).digest('hex').slice(0, 24)}`;
}

export async function resolveAdvertisementIdentity(
  store: CorpusStore,
  input: AdvertisementIdentityInput,
): Promise<AdvertisementIdentityResolution> {
  if (input.quarantined || input.quarantined_asset_sha256?.has(input.asset_sha256)) {
    throw new Error('Advertisement identity resolution refused a quarantined acquisition Asset.');
  }

  const matchingAssets = (await store.listAssets()).filter(
    (asset) => asset.sha256 === input.asset_sha256,
  );
  const matchingAssetIds = new Set(matchingAssets.map((asset) => asset.asset_id));
  const owners = (await store.listAdvertisements()).filter((advertisement) =>
    advertisement.asset_ids.some((assetId) => matchingAssetIds.has(assetId)),
  );
  if (owners.length > 1) {
    throw new Error(
      `Advertisement identity is ambiguous: exact Asset is attached to ${owners.length} archival Advertisements.`,
    );
  }
  if (owners.length === 1) {
    return {
      kind: 'existing',
      advertisement_id: owners[0]!.advertisement_id,
      advertisement: owners[0]!,
    };
  }

  const advertisementId = stableAdvertisementId(input.acquisition_key);
  const existing = await store.readAdvertisement(advertisementId);
  if (existing !== null && !existing.asset_ids.some((id) => matchingAssetIds.has(id))) {
    throw new Error(`Advertisement identity ${advertisementId} is already bound to another Asset.`);
  }
  if (existing !== null) {
    return { kind: 'existing', advertisement_id: advertisementId, advertisement: existing };
  }
  return { kind: 'new', advertisement_id: advertisementId, advertisement: null };
}
