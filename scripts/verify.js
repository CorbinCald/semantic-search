import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DIMENSIONS, INDEX_NAME, MODEL, REPRESENTATION, readConfig } from '../src/config.js';
import { INDEX_DEFINITION, openDatabase } from '../src/database.js';
import { validateVector } from '../src/embeddings.js';

const config = readConfig();
const corpus = JSON.parse(await readFile(new URL('../data/threads.json', import.meta.url), 'utf8'));
const { client, collection } = await openDatabase(config);
try {
  const documents = await collection.find().toArray();
  assert.equal(documents.length, corpus.length, 'Every corpus thread must be stored exactly once.');
  const expected = new Map(corpus.map(t => [t._id, t]));
  for (const document of documents) {
    assert.equal(document.embeddingModel, MODEL);
    assert.equal(document.representation, REPRESENTATION);
    assert.equal(document.embeddingDimensions, DIMENSIONS);
    assert.equal(document.contentHash, expected.get(document._id)?.contentHash);
    assert.equal(createHash('sha256').update(document.text).digest('hex'), document.contentHash);
    assert.equal(document.embeddingInputHash, createHash('sha256').update(`passage: ${document.text}`).digest('hex'));
    validateVector(document.embedding);
    assert.ok(Math.abs(Math.hypot(...document.embedding) - 1) < 1e-5, 'Stored embedding is normalized.');
  }
  const [index] = await collection.listSearchIndexes(INDEX_NAME).toArray();
  assert.equal(index?.status, 'READY');
  assert.equal(index.queryable, true);
  for (const field of INDEX_DEFINITION.fields) {
    assert.ok(index.latestDefinition.fields.some(actual => Object.entries(field).every(([k, v]) => actual[k] === v)));
  }
  // An actual MongoDB vector query, independent of any API fixture.
  const probe = documents.find(t => t._id === 'eng-007');
  const neighbors = await collection.aggregate([
    { $vectorSearch: { index: INDEX_NAME, path: 'embedding', queryVector: probe.embedding, exact: true, limit: 20 } },
    { $project: { _id: 1, score: { $meta: 'vectorSearchScore' } } },
  ]).toArray();
  assert.equal(neighbors.length, 20);
  assert.equal(neighbors[0]._id, probe._id, 'The incident document must be its own nearest neighbor.');
  assert.ok(neighbors[0].score > 0.9999);
  const report = {
    verifiedAt: new Date().toISOString(), database: config.database, collection: config.collection,
    documents: documents.length, model: MODEL, dimensions: DIMENSIONS,
    allDocumentsEmbedded: true, allContentHashesMatch: true, allVectorsNormalized: true,
    index: { name: INDEX_NAME, status: index.status, queryable: index.queryable, definition: index.latestDefinition },
    mongoSelfSearch: { firstResult: neighbors[0], results: neighbors.length },
  };
  await mkdir(new URL('../docs/validation/', import.meta.url), { recursive: true });
  await writeFile(new URL('../docs/validation/database.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally { await client.close(); }
