import { INDEX_NAME, MODEL, REPRESENTATION, SEARCH_LIMIT } from './config.js';

export const DEPARTMENTS = ['Engineering', 'Sales', 'Support', 'CSM', 'Operations'];

export function parseSearch(params) {
  if (typeof params.q !== 'string' || !params.q.trim() || params.q.trim().length > 2000) {
    return { error: 'q must be a single non-empty natural language query of at most 2000 characters.' };
  }
  if (params.department !== undefined && !DEPARTMENTS.includes(params.department)) {
    return { error: `department must be one of: ${DEPARTMENTS.join(', ')}.` };
  }
  return { query: params.q.trim(), department: params.department };
}

export function searchPipeline(vector, department) {
  return [
    { $vectorSearch: {
      index: INDEX_NAME,
      path: 'embedding',
      queryVector: vector,
      numCandidates: 200,
      limit: SEARCH_LIMIT,
      filter: { embeddingModel: MODEL, representation: REPRESENTATION, ...(department ? { department } : {}) },
    } },
    { $project: {
      embedding: 0,
      contentHash: 0,
      embeddingInputHash: 0,
      embeddedAt: 0,
      score: { $meta: 'vectorSearchScore' },
    } },
    { $sort: { score: -1, _id: 1 } },
  ];
}

export function createSearch({ collection, embed }) {
  return async function search({ query, department, signal }) {
    const [vector] = await embed([query], { query: true, signal });
    return collection.aggregate(searchPipeline(vector, department), { maxTimeMS: 15000 }).toArray();
  };
}
