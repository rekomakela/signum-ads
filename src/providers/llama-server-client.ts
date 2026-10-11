import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CLAIM_KINDS, EVIDENCE_TYPES, REFERENCE_TYPES } from '../contracts/decode-draft-v1.js';
import type { ModelClient, ModelImageInput, StructuredDecode } from './model-client.js';

export interface LlamaServerClientOptions {
  /** OpenAI-compatible base URL, e.g. llama-swap proxy. */
  baseUrl?: string;
  /** Model name/alias to route to, e.g. "signum-vision". */
  model?: string;
  /** Injectable fetch for tests. */
  fetchFn?: typeof fetch;
  /** Maximum time to wait for inference before failing. */
  timeoutMs?: number;
  /** Maximum structured-output tokens for one Decode. */
  maxTokens?: number;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8082';
const DEFAULT_MODEL = 'signum-vision';
const DEFAULT_TIMEOUT_MS = 360_000;
const DEFAULT_MAX_TOKENS = 1400;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Model server did not respond within ${ms} ms.`)),
      ms,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

const CATALOG_REFERENCE_TYPES = REFERENCE_TYPES.filter(
  (referenceType) => referenceType !== 'evidence_record',
);

type Vocabulary = Record<string, string[]>;

let cachedVocabulary: Vocabulary | null = null;

function loadVocabulary(): Vocabulary {
  if (cachedVocabulary === null) {
    cachedVocabulary = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'src/reference-vocabulary/controlled-vocabulary.v1.json'),
        'utf8',
      ),
    ) as Vocabulary;
  }
  return cachedVocabulary;
}

function buildSystemPrompt(vocabulary: Vocabulary): string {
  return `You are a semiotic advertisement decoder. Analyze the provided advertisement image and produce a structured reading of how it makes meaning and persuades.

Respond with ONLY a single JSON object — no markdown fences, no commentary — conforming exactly to this shape:

{
  "summary": "one or two sentences stating the ad's core message",
  "observations": [
    {
      "description": "what is concretely visible in the image or its text",
      "evidence_type": "one of: ${EVIDENCE_TYPES.join(', ')}",
      "location": "where in the ad it appears, or null",
      "confidence": "one of: low, medium, high"
    }
  ],
  "claims": [
    {
      "kind": "one of: ${CLAIM_KINDS.join(', ')}",
      "text": "the interpretive claim",
      "evidence_indices": [0, 1],
      "references": [
        {
          "reference_type": "one of: ${CATALOG_REFERENCE_TYPES.join(', ')}",
          "reference_value": "snake_case concept id, e.g. aspiration, scarcity, cultural_identity",
          "required_for_claim": true
        }
      ]
    }
  ]
}

Rules:
- Keep the output analytically rich but concise: 4-8 observations and 3-6 claims; never exceed 8 observations or 6 claims.
- Summary is one or two concise sentences. Each claim is one sentence and at most 30 words.
- Every claim must cite at least one observation via evidence_indices (0-based indexes into the observations array).
- Use at most 2 catalog references per claim. Do not repeat equivalent claims or observations.
- Be concrete and grounded in what is visibly present; do not invent copy that is not in the ad.
- reference_value MUST be chosen from the exact valid values listed below for the matching reference_type. Never invent new ids.

Valid reference values (use EXACTLY these):
- persuasion_technique: ${vocabulary.persuasion_technique?.join(', ') ?? ''}
- emotional_lever: ${vocabulary.emotional_lever?.join(', ') ?? ''}
- cultural_code: ${vocabulary.cultural_code?.join(', ') ?? ''}
- glossary_concept: ${vocabulary.glossary_concept?.join(', ') ?? ''}
- ontology_class (PascalCase class names): ${vocabulary.ontology_class?.join(', ') ?? ''}`;
}

/**
 * Extract a JSON object from a model reply that may wrap it in prose or a
 * ```json fence. Throws if no JSON object can be found.
 */
export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to fence/substring extraction
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const fencedBody = fenced?.[1];
  if (fencedBody !== undefined) {
    try {
      return JSON.parse(fencedBody.trim());
    } catch {
      // fall through
    }
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const block = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(block);
    } catch {
      return JSON.parse(quoteUnquotedKeys(block));
    }
  }

  throw new Error('Model response contained no JSON object.');
}

function quoteUnquotedKeys(jsonText: string): string {
  return jsonText.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : [];
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

/**
 * Coerce an arbitrary parsed JSON value into a `StructuredDecode`, tolerating
 * missing or mistyped fields. Deep normalization of enum values is the
 * mapper's job in `image-decode-provider.ts`; here we only guarantee shape.
 */
export function coerceStructuredDecode(value: unknown): StructuredDecode {
  const root = asRecord(value);
  const observations = Array.isArray(root.observations) ? root.observations : [];
  const claims = Array.isArray(root.claims) ? root.claims : [];

  return {
    summary: asString(root.summary),
    observations: observations.map((item) => {
      const record = asRecord(item);
      return {
        description: asString(record.description),
        evidence_type: asString(record.evidence_type),
        location: record.location === null ? null : asString(record.location),
        confidence: asString(record.confidence),
      };
    }),
    claims: claims.map((item) => {
      const record = asRecord(item);
      const references = Array.isArray(record.references) ? record.references : [];
      return {
        kind: asString(record.kind),
        text: asString(record.text),
        evidence_indices: asNumberArray(record.evidence_indices),
        references: references.map((reference) => {
          const ref = asRecord(reference);
          return {
            reference_type: asString(ref.reference_type),
            reference_value: asString(ref.reference_value),
            required_for_claim: asBoolean(ref.required_for_claim),
          };
        }),
      };
    }),
  };
}

/**
 * A `ModelClient` that talks to an OpenAI-compatible llama-server (typically
 * through a llama-swap proxy) using the standard multimodal chat format.
 */
export function createLlamaServerClient(options: LlamaServerClientOptions = {}): ModelClient {
  const baseUrl = options.baseUrl ?? process.env.SIGNUM_DECODE_BASE_URL ?? DEFAULT_BASE_URL;
  const model = options.model ?? process.env.SIGNUM_DECODE_MODEL ?? DEFAULT_MODEL;
  const fetchImpl = options.fetchFn ?? globalThis.fetch;
  const timeoutMs =
    options.timeoutMs ?? Number(process.env.SIGNUM_DECODE_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const maxTokens =
    options.maxTokens ?? Number(process.env.SIGNUM_DECODE_MAX_TOKENS ?? DEFAULT_MAX_TOKENS);

  return {
    async analyzeImage(input: ModelImageInput): Promise<StructuredDecode> {
      let response: Response;
      try {
        response = await withTimeout(
          fetchImpl(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              temperature: 0,
              seed: 0,
              max_tokens: maxTokens,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: buildSystemPrompt(loadVocabulary()) },
                {
                  role: 'user',
                  content: [
                    {
                      type: 'image_url',
                      image_url: {
                        url: `data:${input.mime_type};base64,${input.base64}`,
                      },
                    },
                    { type: 'text', text: 'Decode this advertisement.' },
                  ],
                },
              ],
            }),
          }),
          timeoutMs,
        );
      } catch (error) {
        if (error instanceof TypeError) {
          throw new Error(
            'Could not reach the local model server (llama-swap). Is the signum-vision profile loaded?',
            { cause: error },
          );
        }
        throw error;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Model server responded ${response.status}: ${body.slice(0, 500)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('Model server returned no message content.');
      }

      return coerceStructuredDecode(extractJsonObject(content));
    },
  };
}
