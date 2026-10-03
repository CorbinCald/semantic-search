import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { config, INDEX_NAME } from '../src/config.js';
import { loadCorpus, sha256 } from '../src/corpus.js';
import { validateVector } from '../src/embeddings.js';
import { connectDatabase, readiness, searchPipeline } from '../src/database.js';

const settings = config();
const { documents, datasetSha256 } = await loadCorpus();
const { client, collection } = await connectDatabase(settings);
try {
  const state = await readiness(collection, settings.model);
  assert.equal(state.ready, true, 'Database and index must be ready');
  const stored = await collection.find().sort({ _id: 1 }).toArray();
  assert.equal(stored.length, documents.length);
  const hashes = new Set();
  let maxNormError = 0;
  for (const document of documents) {
    const actual = stored.find(d => d._id === document._id);
    assert.ok(actual, `Missing ${document._id}`);
    assert.equal(actual.contentHash, document.contentHash);
    assert.equal(actual.embeddingMetadata.inputSha256, sha256(actual.text));
    assert.equal(actual.embeddingMetadata.model, settings.model);
    assert.deepEqual(actual.messages, document.messages);
    validateVector(actual.embedding);
    hashes.add(sha256(JSON.stringify(actual.embedding)));
    maxNormError = Math.max(maxNormError, Math.abs(Math.hypot(...actual.embedding) - 1));
  }
  assert.equal(hashes.size, stored.length, 'Different threads must not have duplicated vectors');
  const pipeline = searchPipeline(stored[0].embedding);
  const selfResults = await collection.aggregate(pipeline).toArray();
  assert.equal(selfResults[0].id, stored[0]._id, 'Stored vector must retrieve its own thread first');
  assert.ok(selfResults[0].score > 0.999);
  assert.equal(selfResults.length, 20);
  const index = (await collection.listSearchIndexes(INDEX_NAME).toArray())[0];
  const report = { checkedAt: new Date().toISOString(), datasetSha256, ...state,
    messages: documents.reduce((n, d) => n + d.messages.length, 0),
    departments: Object.fromEntries(['Engineering', 'Sales', 'Support', 'CSM', 'Operations'].map(d => [d, documents.filter(x => x.department === d).length])),
    uniqueVectors: hashes.size, maxNormError, selfMatch: { id: selfResults[0].id, score: selfResults[0].score, resultCount: selfResults.length },
    indexDefinition: index.latestDefinition };
  await writeFile(new URL('../evidence/database-verification.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await client.close(); }
