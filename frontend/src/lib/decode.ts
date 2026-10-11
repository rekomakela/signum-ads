/**
 * Client for the local Signum decode server (`npm run decode:server`).
 * The server is a root-side Node process (NodeNext ESM) that owns the engine;
 * the static frontend calls it over HTTP on localhost.
 */
export const DECODE_SERVER_URL = 'http://127.0.0.1:5174';

function isLoopbackHostname(hostname: string): boolean {
  return ['127.0.0.1', 'localhost', '::1', '0.0.0.0'].includes(hostname);
}

function assertLocalDecodeServerIsReachableFromPage(): void {
  if (typeof window === 'undefined') return;
  const serverHostname = new URL(DECODE_SERVER_URL).hostname;
  if (isLoopbackHostname(serverHostname) && !isLoopbackHostname(window.location.hostname)) {
    throw new Error('The public archive cannot call the local decode server.');
  }
}

export interface DecodeClaim {
  kind: string;
  text: string;
}

export interface DecodeSummary {
  summary: string;
  interpretive_claims: DecodeClaim[];
}

export interface DecodeResponse {
  slug: string;
  decode: {
    proposed_decode: DecodeSummary;
    evidence_records: DecodedObservation[];
  };
}

export async function requestDecode(payload: {
  base64: string;
  mime_type: string;
  filename: string;
}): Promise<DecodeResponse> {
  assertLocalDecodeServerIsReachableFromPage();
  let response: Response;
  try {
    response = await fetch(`${DECODE_SERVER_URL}/api/decode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Could not reach the decode server. Start it with: npm run decode:server');
  }
  const data = (await response.json()) as DecodeResponse & { error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Decode failed (HTTP ${response.status}).`);
  }
  return data;
}

export interface DecodedCaseSummary {
  slug: string;
  summary: string;
  claim_count: number;
  evidence_count: number;
}

export interface DecodedObservation {
  evidence_id: string;
  evidence_type: string;
  description: string;
  location: string | null;
  confidence: string;
}

export interface DecodedClaim {
  claim_id: string;
  kind: string;
  text: string;
  evidence_references: Array<{
    evidence_id: string;
    support: string;
  }>;
  references: Array<{
    reference_type: string;
    reference_value: string;
    required_for_claim: boolean;
  }>;
}

export interface DecodedCaseDetail {
  slug: string;
  asset_base64: string;
  asset_mime: string;
  decode: {
    proposed_decode: {
      summary: string;
      interpretive_claims: DecodedClaim[];
    };
    evidence_records: DecodedObservation[];
  };
}

export async function fetchDecodedCases(): Promise<DecodedCaseSummary[]> {
  try {
    const response = await fetch(`${DECODE_SERVER_URL}/api/cases`);
    if (!response.ok) return [];
    const data = (await response.json()) as { cases: DecodedCaseSummary[] };
    return data.cases;
  } catch {
    // Decode server not running — surface no decoded cases.
    return [];
  }
}

export async function fetchDecodedCase(slug: string): Promise<DecodedCaseDetail> {
  const response = await fetch(`${DECODE_SERVER_URL}/api/cases/${encodeURIComponent(slug)}`);
  if (!response.ok) {
    throw new Error(`Could not load decoded case "${slug}" (HTTP ${response.status}).`);
  }
  return (await response.json()) as DecodedCaseDetail;
}
