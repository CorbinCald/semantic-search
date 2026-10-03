# Semantic Search submission

- [Source repository](https://github.com/CorbinCald/semantic-search)
- [Screen recording on Google Drive](https://drive.google.com/file/d/1ccxupfQo6PO-Ffm6d6XxPUZpqo1rnv0B/view)
- [Canvas assignment](https://utahtech.instructure.com/courses/1247788/assignments/18950237)

Recorded October 2, 2026 (America/Denver). Duration: 2 minutes 25 seconds. The silent screen recording shows the running solution, with readable on-screen explanations and actual Postman responses.

| Time | Demonstration |
| --- | --- |
| 0:00 | Dataset, architecture, and hosted-model choice |
| 0:13 | Original Slack conversation and cross-team context |
| 0:32 | Live MongoDB audit: 50 embedded documents, 4096 dimensions, cosine index |
| 0:50 | MongoDB `$vectorSearch` pipeline with the 20-result limit and scores |
| 1:01 | Postman health check |
| 1:11 | Search for scanned invoices, with actual ordered JSON results |
| 1:21 | Five passing Postman desktop assertions |
| 1:30 | Search for a customer account that lost its champion |
| 1:44 | Missing-query validation returns HTTP 400 |
| 1:53 | Full Postman collection report: 13 requests, 55 assertions, zero failures |
| 2:12 | README and reproducible setup |

The implemented model is `qwen/qwen3-embedding-8b` through OpenRouter, pinned to Nebius. The hosted model was selected for this rebuild in place of `Qwen3-Embedding-8B-4bit-DWQ`. It is not represented as the assignment's original DWQ variant. All document and query embeddings use the same hosted model and 4096-dimensional vectors.

Automated evidence is in [`../evidence/`](../evidence/); [`postman-desktop.png`](../evidence/postman-desktop.png) also captures the running Postman desktop application.
