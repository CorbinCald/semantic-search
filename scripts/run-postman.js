import newman from 'newman';
import { readFile, writeFile } from 'node:fs/promises';
import { MODEL_NAME } from '../src/config.js';

const collection = JSON.parse(await readFile(new URL('../postman/Northstar.postman_collection.json', import.meta.url)));
const environment = JSON.parse(await readFile(new URL('../postman/local.postman_environment.json', import.meta.url)));
newman.run({ collection, environment, reporters: ['cli'], timeoutRequest: 40000 }, async (error, summary) => {
  if (error) { console.error(error.message); process.exitCode = 1; return; }
  const report = {
    checkedAt: new Date().toISOString(), model: MODEL_NAME,
    requests: summary.run.stats.requests, assertions: summary.run.stats.assertions,
    failures: summary.run.failures.map(f => ({ test: f.error.test, message: f.error.message })),
    results: summary.run.executions.map(e => {
      let body;
      try { body = JSON.parse(e.response.stream.toString()); } catch { body = null; }
      return { name: e.item.name, status: e.response?.code, milliseconds: e.response?.responseTime,
        ...(Array.isArray(body) ? { resultCount: body.length, topFive: body.slice(0, 5).map(r => ({ id: r.id, title: r.title, department: r.department, score: r.score })) } : { body }),
        assertions: e.assertions?.map(a => ({ name: a.assertion, passed: !a.error })) || [] };
    }),
  };
  await writeFile(new URL('../evidence/postman-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  process.exitCode = report.failures.length ? 1 : 0;
});
