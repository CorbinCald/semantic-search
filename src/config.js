// The same immutable model and representation are used during ingestion and search.
export const MODEL = 'nvidia/nemotron-3-embed-1b:free';
// OpenRouter can return its internal serving identifier for this same model.
export const MODEL_RESPONSE_IDS = [MODEL, 'private/openrouter/nvidia/nemotron-3-embed-1b', 'nvidia/nemotron-3-embed-1b'];
export const DIMENSIONS = 2048;
export const INDEX_NAME = 'slack_cosine_2048';
export const REPRESENTATION = 'slack-thread-v1';
export const SEARCH_LIMIT = 20;

export function readConfig(env = process.env) {
  const port = Number(env.PORT || 3019);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  return {
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27019/?directConnection=true',
    database: env.MONGODB_DATABASE || 'relayai',
    collection: env.MONGODB_COLLECTION || 'slack_threads',
    openrouterKey: env.OPENROUTER_API_KEY || '',
    port,
    host: env.HOST || '127.0.0.1',
  };
}
