import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ARCHIVAL_REVIEW_SYSTEM_PROMPT,
  createLlamaArchivalReviewClient,
} from '../src/providers/llama-archival-review-client.js';

test('archival review client sends deterministic image classification request', async () => {
  const captured: Record<string, unknown>[] = [];
  const client = createLlamaArchivalReviewClient({
    baseUrl: 'http://review.test',
    model: 'fixed-vision-v1',
    fetchFn: (async (_input: string | URL | Request, init?: RequestInit) => {
      captured.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  classification: 'single_advertisement',
                  confidence: 'high',
                  rationale: 'One print advertisement fills the frame.',
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch,
  });

  const result = await client.reviewImage({ mime_type: 'image/jpeg', base64: 'AQID' });
  assert.equal(result.classification, 'single_advertisement');
  const body = captured[0]!;
  assert.equal(body.model, 'fixed-vision-v1');
  assert.equal(body.temperature, 0);
  assert.equal(body.seed, 0);
  assert.equal(body.max_tokens, 48);
  assert.deepEqual(body.response_format, { type: 'json_object' });
  const messages = body.messages as Array<{ role: string; content: unknown }>;
  assert.equal(messages[0]?.role, 'system');
  assert.equal(messages[0]?.content, ARCHIVAL_REVIEW_SYSTEM_PROMPT);
  assert.match(JSON.stringify(messages[1]), /data:image\/jpeg;base64,AQID/);
});

test('archival review client repairs exactly one missing terminal JSON brace', async () => {
  const client = createLlamaArchivalReviewClient({
    fetchFn: (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{\n  "classification": "single_advertisement",\n  "confidence": "high",\n  "rationale": "One dominant poster fills the image."',
              },
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch,
  });

  const result = await client.reviewImage({ mime_type: 'image/jpeg', base64: 'AQID' });
  assert.equal(result.classification, 'single_advertisement');
  assert.equal(result.confidence, 'high');
});

test('archival review client repairs one missing terminal quote and brace', async () => {
  const client = createLlamaArchivalReviewClient({
    fetchFn: (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{\n  "classification": "single_advertisement",\n  "confidence": "high",\n  "rationale": "One dominant poster',
              },
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch,
  });
  assert.deepEqual(await client.reviewImage({ mime_type: 'image/jpeg', base64: 'AQID' }), {
    classification: 'single_advertisement',
    confidence: 'high',
    rationale: 'One dominant poster',
  });
});

test('archival review client does not repair arbitrary malformed JSON', async () => {
  const client = createLlamaArchivalReviewClient({
    fetchFn: (async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: '{"classification":' } }] }), {
        status: 200,
      })) as typeof fetch,
  });
  await assert.rejects(
    () => client.reviewImage({ mime_type: 'image/jpeg', base64: 'AQID' }),
    /no JSON object|Unexpected end|JSON/i,
  );
});

test('archival review client fails closed on an invalid classification', async () => {
  const client = createLlamaArchivalReviewClient({
    fetchFn: (async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  classification: 'probably_an_ad',
                  confidence: 'high',
                  rationale: 'guess',
                }),
              },
            },
          ],
        }),
        { status: 200 },
      )) as typeof fetch,
  });
  await assert.rejects(
    () => client.reviewImage({ mime_type: 'image/jpeg', base64: 'AQID' }),
    /Invalid archival review classification/,
  );
});
