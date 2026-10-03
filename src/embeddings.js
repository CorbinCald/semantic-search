import { setTimeout as sleep } from 'node:timers/promises';
import { DIMENSIONS, MODEL, MODEL_RESPONSE_IDS } from './config.js';

export class EmbeddingError extends Error {}

export function validateVector(vector) {
  if (!Array.isArray(vector) || vector.length !== DIMENSIONS || !vector.every(Number.isFinite)) {
    throw new EmbeddingError(`Embedding must contain ${DIMENSIONS} finite numbers.`);
  }
  const norm = Math.hypot(...vector);
  if (norm === 0 || !Number.isFinite(norm)) throw new EmbeddingError('Embedding has an invalid norm.');
  // Normalization is consistent even when providers return different magnitudes.
  return vector.map(value => value / norm);
}

export function createEmbedder({ apiKey, fetchImpl = fetch, sleepImpl = sleep }) {
  if (!apiKey) throw new Error('Set OPENROUTER_API_KEY before importing documents or starting the API.');
  return async function embed(texts, { query = false, signal } = {}) {
    if (!Array.isArray(texts) || !texts.length || !texts.every(t => typeof t === 'string' && t.trim())) {
      throw new EmbeddingError('Embedding input must be a non-empty array of non-empty strings.');
    }
    // NVIDIA's OpenAI-compatible interface expects explicit retrieval prefixes.
    const input = texts.map(text => `${query ? 'query' : 'passage'}: ${text}`);
    for (let attempt = 0; attempt < 3; attempt++) {
      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(45000)])
        : AbortSignal.timeout(45000);
      let response;
      try {
        response = await fetchImpl('https://openrouter.ai/api/v1/embeddings', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'RelayAI Semantic Search' },
          body: JSON.stringify({ model: MODEL, input, encoding_format: 'float' }),
          signal: requestSignal,
        });
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new EmbeddingError('The embedding service could not be reached.');
      }
      if (!response.ok) {
        // Never forward provider bodies: they may contain private request data.
        await response.body?.cancel();
        if ([429, 502, 503, 504].includes(response.status) && attempt < 2) {
          const retryAfter = Number(response.headers.get('retry-after'));
          await sleepImpl(Math.min(5000, retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt), undefined, { signal });
          continue;
        }
        throw new EmbeddingError(`The embedding service returned HTTP ${response.status}.`);
      }
      let body;
      try { body = await response.json(); }
      catch { throw new EmbeddingError('The embedding service returned invalid JSON.'); }
      if (!MODEL_RESPONSE_IDS.includes(body.model) || !Array.isArray(body.data) || body.data.length !== input.length) {
        throw new EmbeddingError('The embedding service returned an unexpected model or result count.');
      }
      const ordered = new Array(input.length);
      for (const result of body.data) {
        if (!Number.isInteger(result.index) || result.index < 0 || result.index >= input.length || ordered[result.index]) {
          throw new EmbeddingError('The embedding service returned invalid or duplicate input indices.');
        }
        ordered[result.index] = validateVector(result.embedding);
      }
      return ordered;
    }
  };
}
