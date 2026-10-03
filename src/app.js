import express from 'express';
import { EmbeddingError } from './embeddings.js';

export function createApp({ embed, search, health, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.get('/health', async (_req, res) => {
    const state = await health();
    res.status(state.ready ? 200 : 503).json(state);
  });
  app.get('/api/search', async (req, res) => {
    const q = req.query.q;
    if (typeof q !== 'string' || !q.trim() || q.trim().length > 1500) {
      return res.status(400).json({ error: 'Provide one nonempty q query parameter (maximum 1500 characters).' });
    }
    const vector = await embed(q.trim(), { query: true });
    const results = await search(vector);
    // Keep identity and relevance visible before the longer source conversation.
    res.json(results.map(({ id, score, ...source }) => ({ id, score, ...source })));
  });
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  app.use((error, _req, res, _next) => {
    // Do not echo upstream bodies, credentials, or user queries to the client/logs.
    logger.error(error instanceof EmbeddingError ? 'Embedding dependency failed' : 'Database/request dependency failed');
    res.status(503).json({ error: error instanceof EmbeddingError ? 'Embedding service unavailable.' : 'Search service unavailable.' });
  });
  return app;
}
