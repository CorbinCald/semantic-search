import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { EmbeddingError } from '../src/embeddings.js';

async function fixture(t, overrides = {}) {
  const calls = [];
  const app = createApp({ embed: async (...args) => { calls.push(args); return [1]; },
    search: async () => [{ id: 'support-07', score: 0.91 }],
    health: async () => ({ ready: true }), logger: { error() {} }, ...overrides });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return { calls, get: path => fetch(`http://127.0.0.1:${server.address().port}${path}`) };
}

test('blank, missing, duplicated, and excessive queries are rejected before inference', async t => {
  const { calls, get } = await fixture(t);
  for (const query of ['', '?q=%20', '?q=one&q=two', '?q=' + 'x'.repeat(1501)]) {
    const response = await get('/api/search' + query);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /q query parameter/);
  }
  assert.equal(calls.length, 0);
});

test('natural language and Unicode reach the query embedder and return a JSON array', async t => {
  const { calls, get } = await fixture(t);
  const response = await get('/api/search?q=' + encodeURIComponent('  café onboarding — how do I sign in?  '));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: 'support-07', score: 0.91 }]);
  assert.deepEqual(calls, [['café onboarding — how do I sign in?', { query: true }]]);
});

test('embedding outages give a sanitized 503 and never query the database', async t => {
  let searched = false;
  const { get } = await fixture(t, { embed: async () => { throw new EmbeddingError('secret upstream body'); },
    search: async () => { searched = true; } });
  const response = await get('/api/search?q=invoice');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Embedding service unavailable.' });
  assert.equal(searched, false);
});

test('database outages return 503 rather than a misleading successful empty result', async t => {
  const { get } = await fixture(t, { search: async () => { throw new Error('mongodb://private'); } });
  const response = await get('/api/search?q=invoice');
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Search service unavailable.' });
});
