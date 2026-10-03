# Northstar AI · Slack semantic search

An Express API that retrieves conversations from a realistically simulated AI SaaS company. Natural-language questions become embeddings, and MongoDB ranks the matching Slack threads. There is no answer-generating LLM or agent in this application.

**Model choice:** this submission uses **`qwen/qwen3-embedding-8b` hosted through OpenRouter**, as requested for this rebuild. This is a deliberate change from the assignment's named `Qwen3-Embedding-8B-4bit-DWQ` checkpoint; it does **not** claim to use that quantized variant. All stored vectors and live query vectors use the same hosted model, pinned to the Nebius provider, with **4096 dimensions**. The MongoDB index uses **cosine similarity**.

## Dataset

[`data/workspace.json`](data/workspace.json) contains **150 original messages in 50 threads**, from **15 employees in five departments**, spanning September 14–October 1, 2026. Northstar sells Beacon, a workplace knowledge search product. The company, people, customers, incidents, policies, and metrics are all fictional. No real Slack data was exported.

| Department | Channel | Threads | Typical conversations |
| --- | --- | ---: | --- |
| Engineering | `eng-platform` | 10 | Connector backlogs, access revocation, reliability, API key rotation |
| Sales | `sales-deals` | 10 | Pilots, pricing, residency requirements, qualification, handoffs |
| Support | `support-triage` | 10 | Login loops, missing results, billing disputes, scanned PDFs |
| CSM | `csm-accounts` | 10 | Onboarding, adoption, champions, success measurement, renewals |
| Operations | `ops-business` | 10 | Invoice corrections, vendor reviews, access, staffing, everyday coordination |

The conversations are individually authored, not created by substituting names into a template. Shared events develop across teams: Harbor's delayed Drive sync, Birch's duplicated invoice, Cedar's pilot, and Morrow's renewal risk. Threads include questions, corrections, decisions, follow-up, Slack timestamps, author identities, and occasional reactions.

**Retrieval unit:** one complete thread becomes one MongoDB document. Each stores its original messages, author names, channel, department, title, readable text, SHA-256 content hash, embedding, and embedding metadata. Keeping replies together retains the resolution alongside the initial question. Every message is included in an embedded thread; no message text is discarded. These short threads fit comfortably within the model context window.

## Run locally

Requires Node.js 24+, Docker with Compose, an OpenRouter API key with embedding access, and an internet connection. The included MongoDB Atlas Local image provides both `mongod` and `mongot`; a plain `mongo` container does not provide this vector-search setup. No GPU, Python installation, or local model download is required.

```bash
npm ci
cp .env.example .env
# Set OPENROUTER_API_KEY in .env, or export it in the shell.
# Do not commit the key. An exported value takes precedence over .env.
docker compose up -d --wait
npm run seed
npm run verify
npm start
```

Default addresses:

| Setting | Default |
| --- | --- |
| Express API | `http://127.0.0.1:3210` |
| MongoDB | `mongodb://127.0.0.1:27028/?directConnection=true` |
| Database / collection | `northstar_slack.threads` |
| Vector index | `slack_cosine_4096` |
| Embedding API | `https://openrouter.ai/api/v1/embeddings` |
| Model | `qwen/qwen3-embedding-8b` |

The seed script calls the embedding API, validates each returned vector, and upserts each complete document. On reruns, unchanged text reuses its verified vector; changed text is embedded again. It refuses unrelated documents in the target collection. Index creation is automated, and the script waits until all 50 documents are searchable. A failed run can be resumed with `npm run seed`.

For an Atlas deployment, set `MONGODB_URI` and `MONGODB_DATABASE` in `.env` instead of starting the local container. The database account must be allowed to write documents and create search indexes. Use a dedicated empty collection for the first import.

Stop the local database with `docker compose stop`. Its named volumes preserve the imported data. Restart with `docker compose up -d --wait`.

## API

### `GET /api/search?q=<natural-language question>`

`q` is required: one nonblank string, at most 1,500 characters after trimming. Repeated `q` parameters are rejected. The endpoint embeds the query, performs MongoDB `$vectorSearch`, and returns a **JSON array ordered by descending score, limited to 20 results**. With the included 50-thread corpus it returns 20. There is no keyword-search or in-memory similarity fallback.

```bash
curl --get 'http://127.0.0.1:3210/api/search' \
  --data-urlencode 'q=Why do scanned invoices upload but never appear when I search for a vendor?'
```

Each result contains `id`, `workspace`, `channel`, `department`, `title`, `startedAt`, `messages`, `text`, and `score`. The original conversation remains available so the client can inspect its source. Raw embedding arrays are excluded from API responses. See [`evidence/postman-verification.json`](evidence/postman-verification.json) for actual scores and top-five results from the live checks.

For this small dataset, exact nearest-neighbor search (`exact: true`) gives reproducible ranking without tuning an approximate candidate count. MongoDB's cosine score is normalized to `[0, 1]`: `(1 + cosine similarity) / 2`. A score expresses semantic similarity, not factual correctness or a probability. Ties are ordered by document ID.

Queries receive Qwen's retrieval instruction format (`Instruct: …\nQuery: …`); document text is embedded without that prefix. Both paths call the same client and the same model. The client checks the returned model identity, vector length, finite values, and nonzero magnitude before any database operation.

### `GET /health`

Returns document and embedding counts, configured model, dimension count, and live index readiness. It returns `200` only when all documents have vectors from the configured model and the correct cosine index is ready. It checks MongoDB readiness; it does not make a paid embedding request. A successful search additionally verifies the upstream service.

| Status | Meaning |
| --- | --- |
| `200` | Search array or healthy database/index |
| `400` | Missing, blank, repeated, or excessive `q` |
| `404` | Unknown endpoint |
| `503` | Embedding dependency unavailable, invalid embedding response, or database failure |

Errors are JSON objects with an `error` string. Upstream response bodies, credentials, and stack traces are not returned. The app binds to localhost by default; authentication and internet-facing deployment are outside this assignment.

## MongoDB index

The seed script creates this `vectorSearch` index:

```json
{
  "name": "slack_cosine_4096",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
        "numDimensions": 4096,
        "similarity": "cosine"
      }
    ]
  }
}
```

The pipeline in [`src/database.js`](src/database.js) uses `$vectorSearch` with `limit: 20` and projects `score: { $meta: "vectorSearchScore" }`.

## Verify with Postman

Import [`postman/Northstar.postman_collection.json`](postman/Northstar.postman_collection.json) and [`postman/local.postman_environment.json`](postman/local.postman_environment.json), select **Northstar local**, and run the collection. The environment contains only the API base URL; clients never need the OpenRouter key.

The collection verifies real searches across all five departments, cross-team incident retrieval, a semantic paraphrase, score ordering, the 20-result bound, source context, and invalid-input behavior. Expected relevant threads must appear in the first five results; it does not assert brittle exact floating-point scores. The Postman desktop Lightweight API Client can also send the example GET requests without an account.

The same collection runs through Postman's Newman runner:

```bash
npm test
npm run verify
npm run test:postman
```

`npm test` covers input handling, dependency failures, model/vector validation, and dataset integrity. The live Postman collection uses the real hosted embeddings and real MongoDB index. `npm run verify` checks every stored vector, content hash, source message, model ID, and vector uniqueness, then tests self-retrieval through MongoDB.

Committed evidence:

- [`evidence/ingestion.json`](evidence/ingestion.json): import and index readiness.
- [`evidence/database-verification.json`](evidence/database-verification.json): full collection audit and actual index definition.
- [`evidence/postman-verification.json`](evidence/postman-verification.json): request outcomes, assertions, timing, and actual ranked results.
- [`docs/submission.md`](docs/submission.md): recording and submission references.

This is a small, curated educational corpus, not a measured production benchmark. New queries always return the nearest 20 available conversations, even for topics outside the dataset; the API does not generate an answer or apply a relevance cutoff. It does not implement real Slack authorization. The account-access discussions in the fictional data describe the fictional product, not security features of this demo.

## References

- [OpenRouter Qwen3 Embedding 8B](https://openrouter.ai/qwen/qwen3-embedding-8b) and [embeddings API](https://openrouter.ai/docs/api/api-reference/embeddings/create-embeddings)
- [Qwen3 embedding model card and retrieval instructions](https://huggingface.co/Qwen/Qwen3-Embedding-8B)
- [MongoDB Atlas Local with Docker](https://www.mongodb.com/docs/atlas/cli/current/atlas-cli-deploy-docker/) and [vector search stage](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-stage/)
- [Postman Newman](https://learning.postman.com/docs/reference/newman-cli/installing-running-newman/)
