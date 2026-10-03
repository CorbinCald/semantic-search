import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, DIMENSIONS } from '../src/config.js';
import { createEmbedder, validateVector, EmbeddingError } from '../src/embeddings.js';

const settings = config({ OPENROUTER_API_KEY: 'test-key' });
const vector = Array.from({ length: DIMENSIONS }, (_, i) => i === 0 ? 1 : 0);

test('ingestion and queries request the same exact model, with instruction only for queries', async () => {
  const requests = [];
  const embed = createEmbedder(settings, async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return Response.json({ model: 'Qwen/Qwen3-Embedding-8B', data: [{ index: 0, embedding: vector }] });
  });
  await embed('A policy conversation');
  await embed('Where is the policy?', { query: true });
  assert.equal(requests[0].model, 'qwen/qwen3-embedding-8b');
  assert.equal(requests[1].model, requests[0].model);
  assert.equal(requests[0].input, 'A policy conversation');
  assert.match(requests[1].input, /^Instruct: .+\nQuery: Where is the policy\?$/);
});

test('invalid dimensions, nonnumeric, infinite and zero vectors fail closed', () => {
  for (const bad of [[], vector.slice(1), Array(DIMENSIONS).fill(0),
    Array(DIMENSIONS).fill(NaN), Array(DIMENSIONS).fill(Infinity), Array(DIMENSIONS).fill('1')]) {
    assert.throws(() => validateVector(bad), EmbeddingError);
  }
});

test('unexpected models and failed services cannot silently populate the collection', async () => {
  const responses = [Response.json({ model: 'different-model', data: [{ index: 0, embedding: vector }] }),
    new Response('unavailable', { status: 503 }), new Response('invalid JSON')];
  for (const response of responses) await assert.rejects(createEmbedder(settings, async () => response)('test'), EmbeddingError);
  assert.throws(() => config({ EMBEDDING_MODEL: 'Qwen3-Embedding-4B' }));
});
