import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { EmbeddingError } from '../src/embeddings.js';

async function serve(t, overrides = {}) {
  const calls = [];
  const results = [
    { _id: 'incident', title: 'Rate limiting', score: 0.93 },
    { _id: 'follow-up', title: 'Retry safeguards', score: 0.87 },
  ];
  const app = createApp({
    search: async params => { calls.push(params); return results; },
    health: async () => ({ ready: true }),
    ...overrides,
  });
  const server = await new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { base: `http://127.0.0.1:${server.address().port}`, calls, results };
}

test('a natural question returns the ordered JSON result array, including scores', async t => {
  const { base, calls, results } = await serve(t);
  const response = await fetch(`${base}/api/search?q=${encodeURIComponent('  Why did requests slow down?  ')}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(await response.json(), results);
  assert.equal(calls[0].query, 'Why did requests slow down?');
});

test('department selection passes a valid business department to search', async t => {
  const { base, calls } = await serve(t);
  await fetch(`${base}/api/search?q=discount%20approval&department=Sales`);
  assert.equal(calls[0].department, 'Sales');
});

test('bad input cannot trigger an embedding request', async t => {
  const { base, calls } = await serve(t);
  for (const query of ['', '?q=', '?q=%20%20', '?q=a&q=b', '?q=hello&department=Marketing', '?q=hello&department=Sales&department=CSM', `?q=${'x'.repeat(2001)}`]) {
    const response = await fetch(`${base}/api/search${query}`);
    assert.equal(response.status, 400, query.slice(0, 80));
    assert.equal(typeof (await response.json()).error, 'string');
  }
  assert.equal(calls.length, 0);
});

test('provider failure is reported honestly instead of as an empty result set', async t => {
  const { base } = await serve(t, { search: async () => { throw new EmbeddingError('The embedding service returned HTTP 429.'); } });
  const response = await fetch(`${base}/api/search?q=outage`);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /429/);
});

test('database errors do not expose connection strings or credentials', async t => {
  const { base } = await serve(t, { search: async () => { throw new Error('mongodb://private-user:private-password@host'); } });
  const response = await fetch(`${base}/api/search?q=outage`);
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private-user|private-password/);
});

test('health returns 503 when the corpus or index is not ready', async t => {
  const { base } = await serve(t, { health: async () => ({ ready: false, index: { status: 'BUILDING' } }) });
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).ready, false);
});

test('unknown routes return a JSON error', async t => {
  const { base } = await serve(t);
  const response = await fetch(`${base}/api/chat`);
  assert.equal(response.status, 404);
  assert.equal(typeof (await response.json()).error, 'string');
});
