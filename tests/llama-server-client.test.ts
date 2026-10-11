import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  coerceStructuredDecode,
  createLlamaServerClient,
  extractJsonObject,
} from '../src/providers/llama-server-client.js';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('analyzeImage posts the OpenAI-compatible vision request and parses a clean JSON reply', async () => {
  let capturedUrl = '';
  let capturedBody: Record<string, unknown> = {};

  const client = createLlamaServerClient({
    baseUrl: 'http://127.0.0.1:9999',
    model: 'signum-vision',
    fetchFn: (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                summary: 'A product promises status.',
                observations: [
                  {
                    description: 'A luxury watch centered on a dark background.',
                    evidence_type: 'visual',
                    location: 'center',
                    confidence: 'high',
                  },
                ],
                claims: [
                  {
                    kind: 'core_message',
                    text: 'Owning this watch signals status.',
                    evidence_indices: [0],
                    references: [
                      {
                        reference_type: 'emotional_lever',
                        reference_value: 'status',
                        required_for_claim: true,
                      },
                    ],
                  },
                ],
              }),
            },
          },
        ],
      });
    }) as typeof fetch,
  });

  const result = await client.analyzeImage({ mime_type: 'image/jpeg', base64: 'Zm9v' });

  assert.equal(capturedUrl, 'http://127.0.0.1:9999/v1/chat/completions');
  assert.equal(capturedBody.model, 'signum-vision');
  assert.deepEqual(capturedBody.response_format, { type: 'json_object' });
  assert.equal(capturedBody.max_tokens, 1400);

  const messages = capturedBody.messages as Array<{ role: string; content: unknown }>;
  assert.equal(messages[0]?.role, 'system');
  assert.equal(typeof messages[0]?.content, 'string');
  assert.match(messages[0]?.content as string, /semiotic advertisement decoder/);

  const userContent = messages[1]?.content as Array<Record<string, unknown>>;
  assert.equal(userContent[0]?.type, 'image_url');
  assert.equal((userContent[0]?.image_url as { url: string }).url, 'data:image/jpeg;base64,Zm9v');

  assert.equal(result.summary, 'A product promises status.');
  assert.equal(result.observations[0]?.evidence_type, 'visual');
  assert.equal(result.claims[0]?.references[0]?.reference_value, 'status');
});

test('analyzeImage parses a reply wrapped in a ```json fence', async () => {
  const fenced = '```json\n{"summary":"s","observations":[],"claims":[]}\n```';
  const client = createLlamaServerClient({
    fetchFn: (async () =>
      jsonResponse({ choices: [{ message: { content: fenced } }] })) as typeof fetch,
  });

  const result = await client.analyzeImage({ mime_type: 'image/png', base64: 'AA==' });

  assert.equal(result.summary, 's');
  assert.deepEqual(result.observations, []);
});

test('extractJsonObject tolerates surrounding prose', () => {
  const prose = 'Here is the decode: {"summary":"x"} done.';
  assert.deepEqual(extractJsonObject(prose), { summary: 'x' });
});

test('coerceStructuredDecode defaults missing fields to empty shapes', () => {
  const result = coerceStructuredDecode({ summary: 'only' });

  assert.equal(result.summary, 'only');
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.claims, []);
});

test('analyzeImage throws on a non-OK response', async () => {
  const client = createLlamaServerClient({
    fetchFn: (async () => new Response('boom', { status: 500 })) as typeof fetch,
  });

  await assert.rejects(
    () => client.analyzeImage({ mime_type: 'image/jpeg', base64: 'x' }),
    /responded 500/,
  );
});

test('analyzeImage throws when the reply contains no JSON object', async () => {
  const client = createLlamaServerClient({
    fetchFn: (async () =>
      jsonResponse({ choices: [{ message: { content: 'no json anywhere' } }] })) as typeof fetch,
  });

  await assert.rejects(
    () => client.analyzeImage({ mime_type: 'image/jpeg', base64: 'x' }),
    /no JSON object/,
  );
});

test('analyzeImage times out when the server never responds', async () => {
  const client = createLlamaServerClient({
    timeoutMs: 20,
    fetchFn: (async () => new Promise<Response>(() => {})) as typeof fetch,
  });

  await assert.rejects(
    () => client.analyzeImage({ mime_type: 'image/jpeg', base64: 'x' }),
    /did not respond within 20 ms/,
  );
});

test('analyzeImage wraps a network failure in a helpful message', async () => {
  const client = createLlamaServerClient({
    fetchFn: (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch,
  });

  await assert.rejects(
    () => client.analyzeImage({ mime_type: 'image/jpeg', base64: 'x' }),
    /Could not reach the local model server/,
  );
});
