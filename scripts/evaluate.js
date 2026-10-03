import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { MODEL, readConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import { createEmbedder } from '../src/embeddings.js';
import { searchPipeline } from '../src/search.js';

// Hand-labeled paraphrases. Expected threads are judgments, not model-generated labels.
const cases = [
  ['Why did requests pile up during the early June slowdown, and what stopped it?', ['eng-007', 'eng-008']],
  ['What should I tell an invited employee whose company login rejects them?', ['support-001']],
  ['Can we promise that all Atlas data stays in Germany?', ['sales-004']],
  ['How much can an account executive discount a deal without escalating?', ['sales-002']],
  ['When do audit records expire on the paid plans?', ['ops-009']],
  ['Does the longer free evaluation period extend accounts that already started?', ['csm-009', 'ops-010']],
  ['Did MapleCloud receive money back for being charged twice?', ['support-011', 'eng-012', 'ops-011']],
  ['Can clinicians upload real patient files into the Helio evaluation?', ['csm-003', 'cross-010']],
  ['Who must sign off before buying a $450 per month vendor contract?', ['ops-001']],
  ['Why are deleted Drive files stopping a sync just before it finishes?', ['eng-006', 'support-006']],
  ['If I have a seat can I find documents only an admin can access?', ['support-008', 'eng-002']],
  ['Does logging into the app without doing any work count as adoption?', ['csm-004']],
  ['Is it safe to keep both service keys active during rotation?', ['eng-001']],
  ['What makes a production problem urgent enough to page on-call?', ['support-004']],
  ['What happened in Northstar’s first review of faster procedure lookups?', ['csm-012']],
  ['Are custom installations inside a customer’s own cloud supported?', ['sales-008']],
];
const config = readConfig();
const embed = createEmbedder({ apiKey: config.openrouterKey });
const { client, collection } = await openDatabase(config);
try {
  const vectors = await embed(cases.map(([query]) => query), { query: true });
  const results = [];
  for (const [i, [query, expected]] of cases.entries()) {
    const neighbors = await collection.aggregate(searchPipeline(vectors[i])).toArray();
    assert.equal(neighbors.length, 20);
    const rank = neighbors.findIndex(result => expected.includes(result._id)) + 1;
    const hitAt5 = rank > 0 && rank <= 5;
    results.push({ query, expected, relevantRank: rank || null, hitAt5,
      top5: neighbors.slice(0, 5).map(result => ({ id: result._id, title: result.title, score: result.score })) });
    console.log(`${hitAt5 ? 'PASS' : 'MISS'} rank ${rank || 'not in top 20'}: ${query}`);
  }
  const hits = results.filter(r => r.hitAt5).length;
  const report = { evaluatedAt: new Date().toISOString(), model: MODEL, cases: cases.length, hitAt5: hits,
    hitRateAt5: hits / cases.length, meanReciprocalRank: results.reduce((sum, r) => sum + (r.relevantRank ? 1 / r.relevantRank : 0), 0) / cases.length, results };
  await mkdir(new URL('../docs/validation/', import.meta.url), { recursive: true });
  await writeFile(new URL('../docs/validation/retrieval.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Live retrieval: ${hits}/${cases.length} relevant threads in the first five results.`);
  // A quality floor, not a claim that these hand-written cases cover every query.
  if (hits < 14) process.exitCode = 1;
} finally { await client.close(); }
