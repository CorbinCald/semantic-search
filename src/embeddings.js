import { DIMENSIONS, QUERY_INSTRUCTION } from './config.js';

export class EmbeddingError extends Error {}

export function validateVector(vector) {
  if (!Array.isArray(vector) || vector.length !== DIMENSIONS ||
      vector.some(v => typeof v !== 'number' || !Number.isFinite(v)) ||
      !vector.some(v => v !== 0)) {
    throw new EmbeddingError(`Expected ${DIMENSIONS} finite, nonzero embedding dimensions`);
  }
  return vector;
}

// Both document ingestion and live search call this same client with the same model.
export function createEmbedder(settings, fetchImpl = fetch) {
  if (!settings.apiKey) throw new Error('Set OPENROUTER_API_KEY in your environment or .env file.');
  return async function embed(text, { query = false } = {}) {
    const input = query ? `Instruct: ${QUERY_INSTRUCTION}\nQuery: ${text}` : text;
    try {
      const response = await fetchImpl(`${settings.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
        },
        body: JSON.stringify({ model: settings.model, input, dimensions: DIMENSIONS, encoding_format: 'float',
          provider: { only: ['nebius'], allow_fallbacks: false } }),
        signal: AbortSignal.timeout(settings.timeout),
      });
      if (!response.ok) throw new EmbeddingError(`Embedding service returned HTTP ${response.status}`);
      const body = await response.json();
      // OpenRouter uses a lowercase slug; the provider returns the same HF name
      // with capitals (Qwen/Qwen3-Embedding-8B).
      if (body.model?.toLowerCase() !== settings.model) throw new EmbeddingError('Embedding service returned a different model');
      if (body.data?.length !== 1 || body.data[0].index !== 0) throw new EmbeddingError('Unexpected embedding response');
      return validateVector(body.data[0].embedding);
    } catch (error) {
      if (error instanceof EmbeddingError) throw error;
      throw new EmbeddingError('Embedding service is unavailable', { cause: error });
    }
  };
}
