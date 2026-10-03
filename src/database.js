import { MongoClient } from 'mongodb';
import { COLLECTION, DIMENSIONS, INDEX_NAME } from './config.js';

export async function connectDatabase(settings) {
  const client = new MongoClient(settings.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    return { client, collection: client.db(settings.database).collection(COLLECTION) };
  } catch (error) { await client.close(); throw error; }
}

export function searchPipeline(vector) {
  return [
    { $vectorSearch: { index: INDEX_NAME, path: 'embedding', queryVector: vector, exact: true, limit: 20 } },
    { $project: { _id: 0, id: '$_id', workspace: 1, channel: 1, department: 1,
      title: 1, startedAt: 1, messages: 1, text: 1, score: { $meta: 'vectorSearchScore' } } },
    { $sort: { score: -1, id: 1 } },
  ];
}

export async function readiness(collection, model) {
  const [total, embedded, indexes] = await Promise.all([
    collection.countDocuments(),
    collection.countDocuments({ 'embedding.4095': { $exists: true }, 'embedding.4096': { $exists: false }, 'embeddingMetadata.model': model }),
    collection.listSearchIndexes(INDEX_NAME).toArray(),
  ]);
  const index = indexes[0];
  const field = index?.latestDefinition?.fields?.find(f => f.path === 'embedding');
  const ready = total > 0 && embedded === total && index?.queryable === true &&
    index?.status === 'READY' && field?.numDimensions === DIMENSIONS && field?.similarity === 'cosine';
  return { ready, documents: total, embeddedDocuments: embedded, model, dimensions: DIMENSIONS,
    index: { name: INDEX_NAME, status: index?.status || 'MISSING', queryable: index?.queryable || false,
      similarity: field?.similarity || null } };
}
