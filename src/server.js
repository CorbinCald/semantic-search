import { createApp } from './app.js';
import { DIMENSIONS, MODEL, readConfig } from './config.js';
import { embeddingFilter, indexStatus, openDatabase } from './database.js';
import { createEmbedder } from './embeddings.js';
import { createSearch } from './search.js';

const config = readConfig();
const embed = createEmbedder({ apiKey: config.openrouterKey });
const { client, db, collection } = await openDatabase(config);
const app = createApp({
  search: createSearch({ collection, embed }),
  health: async () => {
    await db.command({ ping: 1 });
    const index = await indexStatus(collection);
    const [documents, embeddedDocuments] = await Promise.all([
      collection.countDocuments(),
      collection.countDocuments({ ...embeddingFilter(), embedding: { $size: DIMENSIONS } }),
    ]);
    return { ready: index.queryable && documents > 0 && documents === embeddedDocuments,
      database: config.database, collection: config.collection, documents, embeddedDocuments,
      model: MODEL, dimensions: DIMENSIONS, similarity: 'cosine', index };
  },
});
const server = app.listen(config.port, config.host, () => console.log(`Semantic search: http://${config.host}:${config.port}/api/search?q=What+caused+the+June+9+outage`));
async function shutdown() {
  const drained = new Promise(resolve => server.close(resolve));
  server.closeIdleConnections();
  await drained;
  await client.close();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
