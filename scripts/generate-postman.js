import { mkdir, writeFile } from 'node:fs/promises';
import { DIMENSIONS, MODEL } from '../src/config.js';

const commonTests = [
  'pm.test("HTTP 200 JSON", () => { pm.response.to.have.status(200); pm.response.to.be.json; });',
  'const results = pm.response.json();',
  'pm.test("Ordered array with finite cosine search scores", () => {',
  '  pm.expect(results).to.be.an("array").that.is.not.empty;',
  '  pm.expect(results.length).to.be.at.most(20);',
  '  results.forEach((r, i) => {',
  '    pm.expect(Number.isFinite(r.score)).to.equal(true);',
  '    pm.expect(r.score).to.be.within(0, 1);',
  '    if (i) pm.expect(r.score).to.be.at.most(results[i-1].score);',
  '    pm.expect(r.text).to.be.a("string").that.is.not.empty;',
  '    pm.expect(r.messages.length).to.equal(r.messageCount);',
  '    pm.expect(r).not.to.have.property("embedding");',
  '  });',
  '});',
];

function request(name, path, tests) {
  return {
    name,
    request: { method: 'GET', header: [], url: `{{baseUrl}}${path}` },
    event: [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }],
  };
}

const searches = [
  ['Incident cause and prevention', 'Why did requests pile up during the early June slowdown, and what stopped it?', ['eng-007', 'eng-008']],
  ['Support: company login', 'What should I tell an invited employee whose company login rejects them?', ['support-001']],
  ['Sales: discount approval', 'How much can an account executive discount a deal without escalating?', ['sales-002']],
  ['Operations: audit history', 'When do audit records expire on the paid plans?', ['ops-009']],
  ['CSM: policy change', 'Does the longer free evaluation period extend accounts that already started?', ['csm-009', 'ops-010']],
  ['Billing handoff and resolution', 'Did MapleCloud receive money back for being charged twice?', ['support-011', 'eng-012', 'ops-011']],
];
const collection = {
  info: {
    name: 'RelayAI Semantic Search',
    description: 'Live MongoDB + OpenRouter integration checks. Import into Postman or run npm run test:postman. No mock services are used by this collection.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [{ key: 'baseUrl', value: 'http://127.0.0.1:3019', type: 'string' }],
  item: [
    request('Readiness: every document embedded and index queryable', '/api/health', [
      'pm.test("Ready", () => pm.response.to.have.status(200));',
      'const health = pm.response.json();',
      `pm.test("Correct model and dimensions", () => { pm.expect(health.model).to.equal(${JSON.stringify(MODEL)}); pm.expect(health.dimensions).to.equal(${DIMENSIONS}); });`,
      'pm.test("Complete corpus and cosine index", () => { pm.expect(health.documents).to.equal(72); pm.expect(health.embeddedDocuments).to.equal(72); pm.expect(health.index.queryable).to.equal(true); pm.expect(health.similarity).to.equal("cosine"); });',
    ]),
    ...searches.map(([name, query, expected]) => request(name, `/api/search?q=${encodeURIComponent(query)}`, [
      ...commonTests,
      'pm.test("Global search is capped at 20", () => pm.expect(results.length).to.equal(20));',
      `pm.test("Relevant conversation appears in top 5", () => pm.expect(results.slice(0,5).some(r => ${JSON.stringify(expected)}.includes(r._id))).to.equal(true));`,
    ])),
    request('Department filter: Sales', '/api/search?q=Which+pricing+concessions+need+approval&department=Sales', [
      ...commonTests,
      'pm.test("Only Sales conversations", () => pm.expect(results.every(r => r.department === "Sales")).to.equal(true));',
    ]),
    request('Client cannot override the result limit', '/api/search?q=customer+onboarding&limit=1000', [
      ...commonTests,
      'pm.test("Exactly 20 results despite limit=1000", () => pm.expect(results.length).to.equal(20));',
    ]),
    ...[
      ['Missing query', '/api/search'],
      ['Blank query', '/api/search?q=%20%20'],
      ['Repeated query parameter', '/api/search?q=one&q=two'],
      ['Unknown department', '/api/search?q=onboarding&department=Marketing'],
    ].map(([name, path]) => request(name, path, [
      'pm.test("Invalid input returns 400", () => pm.response.to.have.status(400));',
      'pm.test("JSON error explains the problem", () => pm.expect(pm.response.json().error).to.be.a("string").that.is.not.empty);',
    ])),
  ],
};
await mkdir(new URL('../postman/', import.meta.url), { recursive: true });
await writeFile(new URL('../postman/RelayAI.postman_collection.json', import.meta.url), `${JSON.stringify(collection, null, 2)}\n`);
console.log(`Wrote ${collection.item.length} Postman requests.`);
