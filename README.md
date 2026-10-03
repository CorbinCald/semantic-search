# RelayAI Semantic Search

Semantic search over a fictional AI SaaS company's Slack workspace. A natural-language question is embedded, searched in MongoDB, and returned as an ordered JSON array of up to **20 conversations with scores**. This assignment implements retrieval only; there is no chat model or agent.

The workspace contains **25 employees, 20 channels, 288 messages, and 72 threads** across **Engineering, Sales, Support, CSM, and Operations**, covering June 1–26, 2026. Conversations include incidents and postmortems, sales approvals, support diagnostics, onboarding, renewals, security, billing, policy changes, and ordinary office chatter. Customers, people, policies, and events are invented. Addresses and source links use reserved `.example` domains.

## Embedding model

The updated requirement was to use a model released in the second half of 2026. This project uses **NVIDIA Nemotron 3 Embed 1B**, released **July 16, 2026**, through OpenRouter as `nvidia/nemotron-3-embed-1b:free`.

The model's native vector dimension is **2048**. Both document and query embeddings, and the MongoDB cosine index, use that dimension. This is an explicit adaptation from the original rubric's Qwen model and 4096 dimensions. Vectors are never padded to manufacture a different size. See the [NVIDIA model card](https://huggingface.co/nvidia/Nemotron-3-Embed-1B-BF16) and [OpenRouter endpoint](https://openrouter.ai/nvidia/nemotron-3-embed-1b:free).

Both paths use the same fixed model in `src/config.js`. As documented by NVIDIA, document inputs start with `passage: ` and queries with `query: `. Outputs are checked for the correct model, result indices, 2048 finite coordinates, and a nonzero norm, then normalized. OpenRouter sometimes identifies this model with its internal serving name; the small explicit allowlist accepts that identifier for the same model. There is no fallback to a different model.

## Run

Requirements: **Node.js 22 or later**, Docker with Compose, and an OpenRouter API key. The included local MongoDB deployment contains both `mongod` and the `mongot` search engine; a plain `mongo` image does not provide this setup.

```sh
npm ci
cp .env.example .env
# Put your OPENROUTER_API_KEY in .env, or export it in your shell.
docker compose up -d --wait
npm run setup
npm run verify
npm start
```

The API listens at `http://127.0.0.1:3019`. The database persists in Docker volumes, and the ports bind to loopback. Stop the API with Ctrl+C and the database with `docker compose stop`; restart with `docker compose up -d --wait`. On a Linux host where Docker requires administrator access, prefix the Docker commands with `sudo`.

`npm run setup` generates the deterministic dataset, imports embedded threads, creates the vector index, and waits for it to become queryable. Import can be rerun: unchanged documents with valid embeddings are skipped. Each completed batch is saved, so an interrupted import can resume. No raw document is inserted without an embedding.

To use MongoDB Atlas instead, set `MONGODB_URI` to your connection string and choose `MONGODB_DATABASE` and `MONGODB_COLLECTION` in `.env`. Use a deployment supporting vector search and a database user allowed to write documents and create search indexes. Keep credentials out of Git. Local MongoDB needs no Atlas account.

## API

| Endpoint | Parameters | Response |
| --- | --- | --- |
| `GET /api/search` | Required `q`: a natural-language question, 1–2000 characters. Optional `department`: `Engineering`, `Sales`, `Support`, `CSM`, or `Operations`. | JSON array, best match first, at most 20 results. |
| `GET /api/health` | None | Database readiness, document/embedding counts, model, dimensions, and index status. |

```sh
curl --get http://127.0.0.1:3019/api/search \
  --data-urlencode 'q=What caused the June 9 slowdown and what fixed it?'

curl --get http://127.0.0.1:3019/api/search \
  --data-urlencode 'q=Which pricing concessions need approval?' \
  --data-urlencode 'department=Sales'

curl http://127.0.0.1:3019/api/health
```

Each result includes `_id`, `title`, `channel`, `department`, `text`, the original `messages`, participants, timestamps, a simulated permalink, and `score`. The 2048-number embedding is excluded from API responses. A shortened illustration of the response shape:

```json
[
  {
    "_id": "eng-007",
    "title": "INC-2641 elevated 429 errors and a stuck queue",
    "department": "Engineering",
    "channel": "incidents",
    "messageCount": 4,
    "score": 0.678
  }
]
```

MongoDB's `vectorSearchScore` for cosine is normalized into `[0, 1]`: `(1 + cosineSimilarity) / 2`. Higher is more similar. These scores are similarity measurements, not probabilities. The response contains nearest neighbors even for a question the workspace does not answer. Historical and superseded policies remain searchable; use dates and follow-up messages to interpret them.

The pipeline uses `$vectorSearch` with `numCandidates: 200` and a fixed `limit: 20`, then projects scores and sorts descending. Department selection is a vector-index prefilter. The model and document-representation version are also prefiltered to prevent incompatible embeddings from being mixed. Passing a `limit` parameter cannot increase the fixed cap.

| Status | Meaning |
| --- | --- |
| `200` | Search results, or a ready health report. |
| `400` | Missing, blank, repeated, or oversized `q`, or an invalid department. |
| `502` | Embedding provider failed or returned invalid embeddings. |
| `503` | MongoDB/search unavailable, or health is not ready. |
| `404` | Unknown endpoint. |

OpenRouter calls have a 45-second timeout and bounded retries for transient HTTP failures. Provider failures are reported as errors, rather than successful empty search results.

## Dataset and storage

`data/scenarios.js` contains the authored conversations. `npm run dataset` deterministically produces:

| File | Purpose |
| --- | --- |
| `data/workspace.json` | Slack-style users, channel metadata, chronological messages, thread links, and reactions. |
| `data/threads.json` | One retrieval document per complete thread, including every reply and author. |
| `data/manifest.json` | Counts by department and a SHA-256 fingerprint of the corpus. |

Thread-level documents retain the context of short replies and connect symptoms with resolutions. For example, INC-2641 appears in Engineering, Support, Sales, CSM, and Finance conversations. The trial-duration change preserves the earlier 14-day policy and the June 17 switch to 21 days; MapleCloud's billing story progresses from an uncertain report to a confirmed $186.40 credit memo.

MongoDB stores all 72 documents in **`relayai.slack_threads`**. Every document has a normalized embedding, model ID, dimensions, representation version, embedding timestamp, and hashes of its source text and exact embedding input. The simulated Slack export remains available for the next RAG assignment.

The index, `slack_cosine_2048`, is created through the MongoDB driver's `createSearchIndex` API:

```json
{
  "fields": [
    { "type": "vector", "path": "embedding", "numDimensions": 2048, "similarity": "cosine" },
    { "type": "filter", "path": "department" },
    { "type": "filter", "path": "embeddingModel" },
    { "type": "filter", "path": "representation" }
  ]
}
```

## Postman and verification

Import **`postman/RelayAI.postman_collection.json`** into Postman, set `baseUrl` to the running API, and run the collection. It checks real responses for readiness, all five departments' use cases, descending scores, relevant results in the top five, the 20-result cap, department filtering, and input errors. No API key belongs in Postman; the server holds it.

The same collection runs with Postman's Newman runner:

```sh
npm run test:postman
# For a different running API:
API_BASE_URL=http://localhost:3019 npm run test:postman
```

Additional checks:

```sh
npm test            # API behavior, provider contracts, and corpus integrity; no credentials needed
npm run verify      # Real MongoDB: every vector, source hash, index definition, and exact self-search
npm run eval        # Real model + MongoDB: 16 hand-labeled, paraphrased retrieval questions
npm run import      # Rerun to confirm unchanged documents are skipped
```

Validated against the live MongoDB and OpenRouter services:

| Check | Observed result |
| --- | --- |
| Automated behavior and dataset checks | **14/14 passed**. |
| MongoDB verification | **72/72 embedded**, normalized, matching source hashes; cosine index READY; document self-search score 1. |
| Live Postman collection | **13 requests, 41/41 assertions passed**. |
| Hand-labeled retrieval evaluation | **16/16** relevant threads in the top five; mean reciprocal rank **0.9375**. |
| Repeated import | **72 unchanged, 0 new embeddings**. |
| Production dependency audit | **0 vulnerabilities** at validation time. |

Machine-readable evidence is committed in `docs/validation/database.json`, `postman.json`, and `retrieval.json`. Retrieval cases are limited to this authored corpus; the score does not claim general-world accuracy. GitHub Actions reruns the behavior tests and confirms the generated dataset is reproducible, without external credentials.

For a quick review, run the Postman collection, open its incident result, and confirm the thread includes both the retry-storm cause and the 14:58 resolution. Then search for the trial extension policy and check the dated distinction between new and existing trials.

References: [NVIDIA model and retrieval prefixes](https://huggingface.co/nvidia/Nemotron-3-Embed-1B-BF16), [OpenRouter embeddings API](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request), [MongoDB local Docker deployment](https://www.mongodb.com/docs/atlas/cli/current/atlas-cli-deploy-docker/), [MongoDB vector search stage](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-stage/), and [Postman Newman](https://learning.postman.com/docs/collections/using-newman-cli/command-line-integration-with-newman/).
