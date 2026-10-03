export const DIMENSIONS = 4096;
export const MODEL_NAME = 'qwen/qwen3-embedding-8b';
export const COLLECTION = 'threads';
export const INDEX_NAME = 'slack_cosine_4096';
export const INDEX_DEFINITION = {
  fields: [{ type: 'vector', path: 'embedding', numDimensions: DIMENSIONS, similarity: 'cosine' }],
};
export const QUERY_INSTRUCTION = 'Given a question about an AI SaaS company, retrieve relevant Slack conversations that answer the question.';

export function config(env = process.env) {
  const model = env.EMBEDDING_MODEL || MODEL_NAME;
  if (model !== MODEL_NAME) throw new Error(`EMBEDDING_MODEL must be ${MODEL_NAME}`);
  const baseUrl = (env.EMBEDDING_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  if (!['http:', 'https:'].includes(new URL(baseUrl).protocol)) throw new Error('Invalid embedding URL');
  return {
    model, baseUrl, apiKey: env.OPENROUTER_API_KEY,
    timeout: Number(env.EMBEDDING_TIMEOUT_MS || 30000),
    mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27028/?directConnection=true',
    database: env.MONGODB_DATABASE || 'northstar_slack',
    port: Number(env.PORT || 3210), host: env.HOST || '127.0.0.1',
  };
}
