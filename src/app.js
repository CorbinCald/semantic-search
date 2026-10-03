import express from 'express';
import { EmbeddingError } from './embeddings.js';
import { parseSearch } from './search.js';

export function createApp({ search, health }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.get('/api/health', async (_req, res) => {
    try {
      const report = await health();
      res.status(report.ready ? 200 : 503).json(report);
    } catch { res.status(503).json({ ready: false, error: 'MongoDB is unavailable.' }); }
  });
  app.get('/api/search', async (req, res) => {
    const parsed = parseSearch(req.query);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const controller = new AbortController();
    const cancel = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', cancel);
    try {
      const results = await search({ ...parsed, signal: controller.signal });
      if (!controller.signal.aborted) res.json(results);
    } catch (error) {
      if (controller.signal.aborted) return;
      const status = error instanceof EmbeddingError ? 502 : 503;
      const message = status === 502 ? error.message : 'Semantic search is unavailable. Check MongoDB and the vector index.';
      res.status(status).json({ error: message });
    } finally { res.off('close', cancel); }
  });
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  return app;
}
