import {
  ARCHIVAL_REVIEW_CLASSIFICATIONS,
  validateArchivalReviewOutput,
  type ArchivalReviewClient,
} from '../acquisition/archival-review.js';
import { extractJsonObject } from './llama-server-client.js';
import type { ModelImageInput } from './model-client.js';

export interface LlamaArchivalReviewClientOptions {
  readonly baseUrl?: string;
  readonly model?: string;
  readonly fetchFn?: typeof fetch;
  readonly timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:8082';
const DEFAULT_MODEL = 'signum-vision';
const DEFAULT_TIMEOUT_MS = 180_000;

export const ARCHIVAL_REVIEW_SYSTEM_PROMPT = `You are an archival intake classifier for an advertisement archive. This is NOT semiotic analysis and NOT brand/date identification.

Decide only whether the supplied image is primarily one advertisement creative suitable to become one archival Advertisement object.

Return ONLY a JSON object with exactly:
{
  "classification": "one of: ${ARCHIVAL_REVIEW_CLASSIFICATIONS.join(', ')}",
  "confidence": "one of: high, medium, low",
  "rationale": "brief factual reason grounded only in the visible image"
}

Definitions:
- single_advertisement: one dominant commercial or public-service advertisement creative, poster, print ad, or billboard creative is the archival object.
- multiple_advertisements: two or more distinct advertisement creatives are visible as separate archival objects.
- not_an_advertisement: the image is primarily a normal photograph, product/package image, editorial page, artwork, building, street scene, person, document, or other non-ad object.
- uncertain: evidence is insufficient or the boundary is genuinely ambiguous.

Rules:
- Do not infer advertiser intent, ideology, audience, date, campaign, placement, or historical context.
- Do not treat a product/package photo alone as an advertisement.
- Do not treat an ordinary street/building photograph as an advertisement merely because signage is visible.
- A photographed billboard/poster can count as single_advertisement only when that one ad is clearly the dominant object and readable as a discrete creative.
- A newspaper/magazine page containing several distinct ads is multiple_advertisements.
- Use high confidence only when the classification is visually clear. When in doubt, return uncertain.
- Keep rationale to at most 12 words.`;

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Archival review model did not respond within ${timeoutMs} ms.`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function requestBody(model: string, input: ModelImageInput): string {
  return JSON.stringify({
    model,
    temperature: 0,
    seed: 0,
    max_tokens: 48,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: ARCHIVAL_REVIEW_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${input.mime_type};base64,${input.base64}` },
          },
          { type: 'text', text: 'Classify this archival acquisition.' },
        ],
      },
    ],
  });
}

export function createLlamaArchivalReviewClient(
  options: LlamaArchivalReviewClientOptions = {},
): ArchivalReviewClient {
  const baseUrl =
    options.baseUrl ??
    process.env.SIGNUM_REVIEW_BASE_URL ??
    process.env.SIGNUM_DECODE_BASE_URL ??
    DEFAULT_BASE_URL;
  const model =
    options.model ??
    process.env.SIGNUM_REVIEW_MODEL ??
    process.env.SIGNUM_DECODE_MODEL ??
    DEFAULT_MODEL;
  const fetchImpl = options.fetchFn ?? globalThis.fetch;
  const timeoutMs =
    options.timeoutMs ??
    Number(
      process.env.SIGNUM_REVIEW_TIMEOUT_MS ??
        process.env.SIGNUM_DECODE_TIMEOUT_MS ??
        DEFAULT_TIMEOUT_MS,
    );

  return {
    async reviewImage(input) {
      let response: Response;
      try {
        response = await withTimeout(
          fetchImpl(`${baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: requestBody(model, input),
          }),
          timeoutMs,
        );
      } catch (error: unknown) {
        if (error instanceof TypeError) {
          throw new Error(
            'Could not reach the local archival review model. Is the signum-vision runtime available?',
            { cause: error },
          );
        }
        throw error;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `Archival review model responded ${response.status}: ${body.slice(0, 500)}`,
        );
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('Archival review model returned no message content.');
      }
      let parsed: unknown;
      try {
        parsed = extractJsonObject(content);
      } catch (error: unknown) {
        const trimmed = content.trim();
        if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
          const repairs = [`${trimmed}}`, `${trimmed}"}`];
          let repaired = false;
          for (const candidate of repairs) {
            try {
              parsed = JSON.parse(candidate);
              repaired = true;
              break;
            } catch {
              // Only the two bounded terminal truncation repairs above are allowed.
            }
          }
          if (!repaired) throw error;
        } else {
          throw error;
        }
      }
      return validateArchivalReviewOutput(parsed);
    },
  };
}
