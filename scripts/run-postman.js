import newman from 'newman';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const collection = JSON.parse(await readFile(new URL('../postman/RelayAI.postman_collection.json', import.meta.url), 'utf8'));
const directory = new URL('../docs/validation/', import.meta.url);
await mkdir(directory, { recursive: true });
newman.run({
  collection,
  envVar: [{ key: 'baseUrl', value: process.env.API_BASE_URL || 'http://127.0.0.1:3019' }],
  reporters: ['cli'], timeoutRequest: 60000, delayRequest: 300,
}, async (error, summary) => {
  if (error) { console.error(error.message); process.exitCode = 1; return; }
  const report = {
    testedAt: new Date().toISOString(), collection: collection.info.name,
    target: process.env.API_BASE_URL || 'http://127.0.0.1:3019',
    liveServices: true,
    requests: summary.run.stats.requests, assertions: summary.run.stats.assertions,
    failures: summary.run.failures.map(f => ({ source: f.source?.name, error: f.error?.message })),
    executions: summary.run.executions.map(e => ({
      name: e.item.name, status: e.response?.code, responseTimeMs: e.response?.responseTime,
      assertions: e.assertions.map(a => ({ name: a.assertion, passed: !a.error })),
    })),
  };
  await writeFile(new URL('postman.json', directory), `${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = summary.run.failures.length ? 1 : 0;
});
