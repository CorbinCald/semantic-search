import { config } from './config.js';
import { createEmbedder } from './embeddings.js';
import { connectDatabase, readiness, searchPipeline } from './database.js';
import { createApp } from './app.js';

const settings = config();
const embed = createEmbedder(settings);
const { client, collection } = await connectDatabase(settings);
const state = await readiness(collection, settings.model);
if (!state.ready) {
  await client.close();
  throw new Error('Dataset/index is not ready. Run npm run seed, then npm run verify.');
}
const app = createApp({
  embed,
  search: vector => collection.aggregate(searchPipeline(vector), { maxTimeMS: 15000 }).toArray(),
  health: () => readiness(collection, settings.model),
});
const server = app.listen(settings.port, settings.host, () => console.log(`Northstar semantic search: http://${settings.host}:${settings.port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  server.close(async () => { await client.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
});
