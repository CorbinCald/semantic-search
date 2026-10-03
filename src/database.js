import { MongoClient } from 'mongodb';
import { DIMENSIONS, INDEX_NAME, MODEL, REPRESENTATION } from './config.js';

export const INDEX_DEFINITION = {
  fields: [
    { type: 'vector', path: 'embedding', numDimensions: DIMENSIONS, similarity: 'cosine' },
    { type: 'filter', path: 'department' },
    { type: 'filter', path: 'embeddingModel' },
    { type: 'filter', path: 'representation' },
  ],
};

export async function openDatabase(config) {
  const client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db(config.database);
    return { client, db, collection: db.collection(config.collection) };
  } catch (error) {
    await client.close();
    throw error;
  }
}

export async function indexStatus(collection) {
  const indexes = await collection.listSearchIndexes(INDEX_NAME).toArray();
  const index = indexes[0];
  return { name: INDEX_NAME, status: index?.status || 'MISSING', queryable: index?.queryable === true };
}

export function embeddingFilter() {
  return { embeddingModel: MODEL, representation: REPRESENTATION };
}
