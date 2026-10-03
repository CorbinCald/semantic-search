import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DIMENSIONS, MODEL, REPRESENTATION, readConfig } from '../src/config.js';
import { openDatabase } from '../src/database.js';
import { createEmbedder, validateVector } from '../src/embeddings.js';

const config = readConfig();
const embed = createEmbedder({ apiKey: config.openrouterKey });
const threads = JSON.parse(await readFile(new URL('../data/threads.json', import.meta.url), 'utf8'));
const { client, collection } = await openDatabase(config);
try {
  const existing = new Map((await collection.find({ _id: { $in: threads.map(t => t._id) } }).toArray()).map(t => [t._id, t]));
  const pending = threads.filter(thread => {
    const previous = existing.get(thread._id);
    if (!previous || previous.contentHash !== thread.contentHash || previous.embeddingModel !== MODEL || previous.representation !== REPRESENTATION || previous.embeddingDimensions !== DIMENSIONS || previous.embeddingInputHash !== createHash('sha256').update(`passage: ${thread.text}`).digest('hex')) return true;
    try { validateVector(previous.embedding); return false; } catch { return true; }
  });
  console.log(`${threads.length} threads; ${threads.length - pending.length} unchanged; ${pending.length} need embeddings.`);
  // Small batches keep request size and memory bounded. Each completed batch is resumable.
  const batchSize = 8;
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    const vectors = await embed(batch.map(thread => thread.text));
    await collection.bulkWrite(batch.map((thread, j) => ({ replaceOne: {
      filter: { _id: thread._id }, upsert: true,
      replacement: {
        ...thread, embedding: vectors[j], embeddingModel: MODEL,
        embeddingDimensions: DIMENSIONS, representation: REPRESENTATION,
        embeddingInputHash: createHash('sha256').update(`passage: ${thread.text}`).digest('hex'),
        embeddedAt: new Date().toISOString(),
      },
    } })));
    console.log(`Embedded and imported ${Math.min(i + batchSize, pending.length)}/${pending.length}.`);
  }
  await collection.createIndex({ channel: 1, startedAt: 1 });
  console.log(`Import complete: ${await collection.countDocuments()} documents in ${config.database}.${config.collection}.`);
} finally { await client.close(); }
