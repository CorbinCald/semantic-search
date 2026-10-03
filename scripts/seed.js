import { setTimeout as delay } from 'node:timers/promises';
import { writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { config, DIMENSIONS, INDEX_NAME, INDEX_DEFINITION } from '../src/config.js';
import { loadCorpus } from '../src/corpus.js';
import { createEmbedder, validateVector } from '../src/embeddings.js';
import { connectDatabase, readiness, searchPipeline } from '../src/database.js';

const settings = config();
const { documents, datasetSha256 } = await loadCorpus();
const embed = createEmbedder(settings);
const { client, collection } = await connectDatabase(settings);
let generated = 0;
try {
  // This dedicated collection is managed by this dataset. Refuse unrelated data.
  const foreign = await collection.countDocuments({ _id: { $nin: documents.map(d => d._id) } });
  if (foreign) throw new Error('Collection contains unrelated documents; choose a new database.');
  for (const [i, document] of documents.entries()) {
    const existing = await collection.findOne({ _id: document._id });
    let reusable = existing?.contentHash === document.contentHash && existing?.embeddingMetadata?.model === settings.model;
    if (reusable) { try { validateVector(existing.embedding); } catch { reusable = false; } }
    if (!reusable) {
      const embedding = await embed(document.text);
      await collection.replaceOne({ _id: document._id }, {
        ...document, embedding,
        embeddingMetadata: { model: settings.model, provider: 'OpenRouter / Nebius', dimensions: DIMENSIONS,
          inputSha256: document.contentHash, generatedAt: new Date().toISOString() },
      }, { upsert: true });
      generated++;
    } else {
      // Keep author/timestamp metadata in sync even when the embedded text is unchanged.
      const { _id, ...fields } = document;
      await collection.updateOne({ _id }, { $set: fields });
    }
    console.log(`${i + 1}/${documents.length} ${document._id}: ${reusable ? 'verified existing vector' : 'embedded and imported'}`);
  }
  const index = (await collection.listSearchIndexes(INDEX_NAME).toArray())[0];
  if (!index) await collection.createSearchIndex({ name: INDEX_NAME, type: 'vectorSearch', definition: INDEX_DEFINITION });
  else if (!isDeepStrictEqual(index.latestDefinition?.fields, INDEX_DEFINITION.fields)) {
    throw new Error('Existing search index has a different definition. Use a new database or correct the index.');
  }
  const deadline = Date.now() + 180000;
  let state;
  let indexed = 0;
  const probe = (await collection.findOne({ _id: documents[0]._id })).embedding;
  while (Date.now() < deadline) {
    state = await readiness(collection, settings.model);
    if (state.ready) {
      // A READY index may still be catching up. Probe all documents before success.
      const pipeline = searchPipeline(probe);
      pipeline[0].$vectorSearch.limit = documents.length;
      indexed = (await collection.aggregate(pipeline).toArray()).length;
      if (indexed === documents.length) break;
    }
    console.log(`Waiting for vector index (${state.index.status}; ${indexed}/${documents.length} searchable)...`);
    await delay(2000);
  }
  if (!state?.ready || indexed !== documents.length) throw new Error('Vector index did not become fully queryable within three minutes');
  const report = { checkedAt: new Date().toISOString(), datasetSha256, generatedThisRun: generated,
    indexedDocuments: indexed, ...state };
  await writeFile(new URL('../evidence/ingestion.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await client.close(); }
