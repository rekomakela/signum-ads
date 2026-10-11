export interface LegacyAdvertisementIdentityGroup {
  readonly group_id: string;
  readonly case_ids: readonly string[];
  readonly rationale: string;
}

export interface LegacyCaseExclusion {
  readonly case_id: string;
  readonly reason: 'non_ad_placeholder';
  readonly rationale: string;
}

/**
 * Human-reviewed legacy identity decisions required before Case migration may
 * collapse exact-binary duplicates into one Advertisement.
 */
export const LEGACY_ADVERTISEMENT_IDENTITY_GROUPS: readonly LegacyAdvertisementIdentityGroup[] = [
  {
    group_id: 'stabilo-highlight-the-remarkable',
    case_ids: ['decoded-ad-1b62e7bd', 'real-ad-for-stabilo-highlighter-pens-ed451c17'],
    rationale:
      'Direct upload and Reddit acquisition contain the same Stabilo/Katherine Johnson creative and independently generated Decodes describe the same advertisement.',
  },
  {
    group_id: 'dhl-fed-up',
    case_ids: [
      'decoded-dhl-ad-83277dad',
      'real-dhl-has-2-competitors-fedex-and-ups-and-now-look-246b64fb',
    ],
    rationale:
      'Direct upload and Reddit acquisition contain the same DHL/FedEx visual-pun creative and independently generated Decodes describe the same advertisement.',
  },
  {
    group_id: 'bic-pens-and-razors',
    case_ids: [
      'real-advertising-both-their-pens-and-razors-0b2101fa',
      'real-smart-advertising-their-pens-and-razors-simultan-fd170b25',
    ],
    rationale:
      'Both Reddit acquisitions contain the same BIC beard/razor creative; the source titles and Decodes differ only in wording.',
  },
  {
    group_id: 'keloptic-glasses',
    case_ids: [
      'real-awesome-glasses-campaign-c00438f9',
      'real-an-advertisement-for-keloptic-com-a-french-websi-2e2e7c7e',
    ],
    rationale:
      'Reviewed visual evidence shows the same Keloptic glasses creative in two differently encoded Reddit acquisitions; perceptual hash is identical and normalized structural similarity is 0.986.',
  },
  {
    group_id: 'ikea-importance-of-sleep',
    case_ids: ['real-ikea-sleep', 'real-ikea-reminding-us-the-importance-of-sleep-900x23-7b279bc4'],
    rationale:
      'Both Cases cite the same Reddit post and contain the same IKEA sleep creative in different binary reproductions.',
  },
  {
    group_id: 'tabasco-popcorn-corn',
    case_ids: [
      'real-tabasco-ad-fc858453',
      'real-a-picture-is-worth-1000-words-no-tag-line-necess-b461c1b7',
    ],
    rationale:
      'Reviewed pairwise visual evidence identifies the same Tabasco bottle, bitten corn, popcorn, blue background, and table composition; one acquisition is a bordered/higher-resolution reproduction.',
  },
  {
    group_id: 'volkswagen-beetles',
    case_ids: ['real-the-beetles-523b9070', 'real-volkswagen-beetles'],
    rationale:
      'Both Cases cite the same Reddit post and contain the same Volkswagen Beetles creative in different binary reproductions.',
  },
  {
    group_id: 'ford-saudi-women-driving',
    case_ids: [
      'real-ford-s-advertising-after-women-in-saudi-arabia-a-8ab8f689',
      'real-ford-saudi-women-driving',
    ],
    rationale:
      'Reviewed visual evidence shows the same Ford Saudi women-driving creative; normalized structural similarity is 0.9998 despite distinct Asset hashes.',
  },
  {
    group_id: 'mercedes-benz-christmas-star',
    case_ids: ['real-mercedes-benz-christmas-advertisement-b1d5b5b1', 'real-mercedes-benz-star'],
    rationale:
      'Both Cases cite the same Reddit post and contain the same Mercedes-Benz Christmas star creative in different binary reproductions.',
  },
  {
    group_id: 'lemon-ice-alcohol',
    case_ids: ['real-lemon-ice-alcohol-3c0a3545', 'real-an-idea-so-stupid-10fa4472'],
    rationale:
      'Reviewed visual evidence shows the same Lemon, Ice & Alcohol creative in two Reddit acquisitions; normalized structural similarity is effectively identical.',
  },
];

export const LEGACY_CASE_EXCLUSIONS: readonly LegacyCaseExclusion[] = [
  {
    case_id: 'real-double-page-hp-laptop-ad-disguised-to-look-like--c32c24f7',
    reason: 'non_ad_placeholder',
    rationale:
      'Stored Asset is a hosting/media-unavailable placeholder, not the intended HP advertisement; Decode explicitly describes missing content.',
  },
  {
    case_id: 'real-such-a-great-print-ad-gold-s-gym-7fdfa12e',
    reason: 'non_ad_placeholder',
    rationale:
      'Stored Asset is the same hosting/media-unavailable placeholder, not the intended Gold’s Gym advertisement; Decode explicitly describes missing content.',
  },
  {
    case_id: 'real-this-is-how-mercedes-benz-advertised-their-stron-8e612d68',
    reason: 'non_ad_placeholder',
    rationale:
      'Stored Asset is the same hosting/media-unavailable placeholder, not the intended Mercedes-Benz advertisement; Decode explicitly describes missing content.',
  },
];

const GROUP_BY_CASE = new Map<string, LegacyAdvertisementIdentityGroup>();
for (const group of LEGACY_ADVERTISEMENT_IDENTITY_GROUPS) {
  for (const caseId of group.case_ids) {
    const existing = GROUP_BY_CASE.get(caseId);
    if (existing !== undefined) {
      throw new Error(
        `Legacy Case ${caseId} belongs to multiple reviewed Advertisement identity groups: ${existing.group_id}, ${group.group_id}.`,
      );
    }
    GROUP_BY_CASE.set(caseId, group);
  }
}
const EXCLUSION_BY_CASE = new Map(
  LEGACY_CASE_EXCLUSIONS.map((exclusion) => [exclusion.case_id, exclusion] as const),
);

export function legacyIdentityGroupForCase(
  caseId: string,
): LegacyAdvertisementIdentityGroup | null {
  return GROUP_BY_CASE.get(caseId) ?? null;
}

export function legacyExclusionForCase(caseId: string): LegacyCaseExclusion | null {
  return EXCLUSION_BY_CASE.get(caseId) ?? null;
}
