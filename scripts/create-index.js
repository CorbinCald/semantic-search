import { setTimeout as sleep } from 'node:timers/promises';
import { INDEX_NAME, readConfig } from '../src/config.js';
import { INDEX_DEFINITION, openDatabase } from '../src/database.js';

const { client, collection } = await openDatabase(readConfig());
try {
  const [existing] = await collection.listSearchIndexes(INDEX_NAME).toArray();
  if (!existing) {
    await collection.createSearchIndex({ name: INDEX_NAME, type: 'vectorSearch', definition: INDEX_DEFINITION });
    console.log(`Created ${INDEX_NAME}. Waiting for MongoDB to finish indexing.`);
  } else {
    const fields = existing.latestDefinition?.fields || [];
    const same = fields.length === INDEX_DEFINITION.fields.length && INDEX_DEFINITION.fields.every(field =>
      fields.some(actual => Object.entries(field).every(([key, value]) => actual[key] === value)));
    if (!same) throw new Error(`Existing index ${INDEX_NAME} has a different definition. Use a new collection or reconcile the index before continuing.`);
    console.log(`Index ${INDEX_NAME} already has the expected definition.`);
  }
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const [index] = await collection.listSearchIndexes(INDEX_NAME).toArray();
    if (index?.status === 'FAILED') throw new Error('MongoDB reported a failed search index. Check the deployment logs.');
    if (index?.queryable && index.status === 'READY') {
      console.log(`Index is READY and queryable: ${JSON.stringify(INDEX_DEFINITION)}`);
      process.exitCode = 0;
      break;
    }
    await sleep(2000);
  }
  const [index] = await collection.listSearchIndexes(INDEX_NAME).toArray();
  if (!index?.queryable || index.status !== 'READY') throw new Error('Vector index did not become ready within three minutes. Rerun npm run index after checking MongoDB.');
} finally { await client.close(); }
