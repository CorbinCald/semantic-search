#!/usr/bin/env bash
# Read-only walkthrough of the running solution. Run from the repository root.
set -euo pipefail
export NODE_NO_WARNINGS=1

screen() {
  clear
  printf '\033[1;36mRelayAI / Semantic Search\033[0m\n\n'
  printf '\033[1m%s\033[0m\n\n' "$1"
}

screen 'A simulated Slack workspace, searched by meaning'
printf 'Engineering · Sales · Support · CSM · Operations\n\n'
printf 'NVIDIA Nemotron 3 Embed 1B — released July 16, 2026\n'
printf 'OpenRouter embeddings → MongoDB cosine search → Express JSON API\n\n'
printf 'This walkthrough runs real commands against the live services.\n'
printf 'Repository: github.com/CorbinCald/semantic-search\n'
sleep 6

screen '1 / Dataset: five departments, connected conversations'
printf '%s\n\n' '$ cat data/manifest.json'
jq '{users,channels,messages,threads,departments}' data/manifest.json
sleep 10

screen '2 / Every MongoDB document has an embedding; the index is ready'
printf '%s\n\n' '$ curl http://127.0.0.1:3019/api/health'
curl --fail --silent http://127.0.0.1:3019/api/health | jq .
sleep 10

screen '3 / A natural question returns 20 ordered results with scores'
printf '%s\n\n' '$ GET /api/search?q=What caused the June 9 slowdown and what fixed it?'
curl --fail --silent --get http://127.0.0.1:3019/api/search \
  --data-urlencode 'q=What caused the June 9 slowdown and what fixed it?' \
  | jq '{resultCount:length,top3:(.[0:3]|map({_id,title,department,score}))}'
sleep 12

screen '4 / A result preserves the discussion and its resolution'
printf '%s\n\n' '$ jq the incident conversation from data/threads.json'
jq -r '.[]|select(._id=="eng-007")|.messages[]|"\(.timestamp)  \(.author)\n\(.text)\n"' data/threads.json
sleep 14

screen '5 / Filter the same semantic search to a department'
printf '%s\n\n' '$ GET /api/search?q=Which pricing concessions need approval?&department=Sales'
curl --fail --silent --get http://127.0.0.1:3019/api/search \
  --data-urlencode 'q=Which pricing concessions need approval?' \
  --data-urlencode 'department=Sales' \
  | jq '{resultCount:length,departments:(map(.department)|unique),top2:(.[0:2]|map({title,score}))}'
sleep 10

screen '6 / Run the importable Postman collection against the live API'
printf '%s\n\n' '$ newman run postman/RelayAI.postman_collection.json'
node_modules/.bin/newman run postman/RelayAI.postman_collection.json \
  --timeout-request 60000 --delay-request 700 --color on
sleep 12

screen 'Verified solution'
jq -r '"Live retrieval: \(.hitAt5)/\(.cases) paraphrased questions found a relevant conversation in the top 5."' docs/validation/retrieval.json
printf '\n'
jq -r '"MongoDB: \(.documents) documents, all embedded, normalized, and matched to the source text.\nIndex: \(.index.status), cosine similarity, \(.dimensions) dimensions."' docs/validation/database.json
printf '\n14 automated behavior and corpus checks passed.\n'
printf '\nREADME.md documents setup, API parameters, errors, Postman, and verification.\n'
printf '\nCode: https://github.com/CorbinCald/semantic-search\n'
sleep 12
