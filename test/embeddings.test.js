import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIMENSIONS, MODEL, MODEL_RESPONSE_IDS } from '../src/config.js';
import { createEmbedder } from '../src/embeddings.js';

function vector(index = 0, magnitude = 1) {
  const result = Array(DIMENSIONS).fill(0);
  result[index] = magnitude;
  return result;
}
function response(data, model = MODEL) { return Response.json({ model, data }); }

test('batched embeddings remain attached to the right documents even when the provider returns them out of order', async () => {
  const embed = createEmbedder({ apiKey: 'test-only', fetchImpl: async () => response([
    { index: 1, embedding: vector(1, 4) }, { index: 0, embedding: vector(0, 3) },
  ], MODEL_RESPONSE_IDS[1]) });
  const result = await embed(['SSO troubleshooting', 'Invoice correction']);
  assert.equal(result[0][0], 1);
  assert.equal(result[1][1], 1);
  assert.equal(Math.hypot(...result[0]), 1);
});

test('query and document requests use the same model with the documented retrieval prefixes', async () => {
  const requests = [];
  const embed = createEmbedder({ apiKey: 'test-only', fetchImpl: async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return response([{ index: 0, embedding: vector() }]);
  } });
  await embed(['Why was access denied?'], { query: true });
  await embed(['Check source group permissions.']);
  assert.equal(requests[0].model, requests[1].model);
  assert.equal(requests[0].input[0], 'query: Why was access denied?');
  assert.equal(requests[1].input[0], 'passage: Check source group permissions.');
});

test('invalid, zero, truncated, or wrong-model vectors cannot be persisted or searched', async () => {
  const corrupted = [
    { model: MODEL, data: [{ index: 0, embedding: [0.5, 0.4] }] },
    { model: MODEL, data: [{ index: 0, embedding: Array(DIMENSIONS).fill(0) }] },
    { model: MODEL, data: [{ index: 2, embedding: vector() }] },
    { model: 'unrelated-model', data: [{ index: 0, embedding: vector() }] },
    { model: MODEL, data: [] },
  ];
  for (const body of corrupted) {
    const embed = createEmbedder({ apiKey: 'test-only', fetchImpl: async () => Response.json(body) });
    await assert.rejects(embed(['a customer question']));
  }
});

test('a transient rate limit retries and a billing failure does not', async () => {
  let attempts = 0;
  const pauses = [];
  const embed = createEmbedder({ apiKey: 'test-only', sleepImpl: async milliseconds => pauses.push(milliseconds), fetchImpl: async () => {
    if (++attempts === 1) return new Response('', { status: 429, headers: { 'retry-after': '1' } });
    return response([{ index: 0, embedding: vector() }]);
  } });
  assert.equal((await embed(['a customer question'])).length, 1);
  assert.equal(attempts, 2);
  assert.deepEqual(pauses, [1000]);
  attempts = 0;
  const billingFailure = createEmbedder({ apiKey: 'test-only', fetchImpl: async () => { attempts++; return new Response('private provider body', { status: 402 }); } });
  await assert.rejects(billingFailure(['a customer question']), /HTTP 402/);
  assert.equal(attempts, 1);
});
