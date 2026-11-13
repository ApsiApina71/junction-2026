---
status: draft
tags: [infra, hosting]
last-updated: 2026-11-10
---

# Infra

**Hosting and CD are undecided.** We will not use AWS.

They will be chosen through a decision ticket (JUN-<n>) and recorded as an ADR in `docs/architecture/`. Until then, nothing is deployed from this repo and this folder holds no config.

What the decision must cover: where web and api apps run, how secrets are injected, preview deploys per PR, and CD from `main`.

## What a host has to run (input for the decision)

Checked locally on 2026-11-13; nothing is deployed. One process serves everything: the API, the marketing site at `/`, the coach at `/app/` and the deck at `/deck/`.

```sh
# build once, on a machine that has the dataset
(cd apps/coach-api && sh scripts/setup_data.sh && uv run python -m scripts.make_demo_db)   # writes data/demo.db (about 1 MB) and data/peers.json
(cd apps/coach-web && npm ci && npm run build)

# run
cd apps/coach-api
SBANK_DB=data/demo.db uv run --no-dev uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- **Ship:** `apps/coach-api` (with `data/demo.db` and `data/peers.json`, which are not in git) and `apps/coach-web/dist`.
- **Secrets:** `ANTHROPIC_API_KEY`, or `LLM_PROVIDER=openai` with `LLM_BASE_URL`, `LLM_API_KEY` and `MODEL_ID` for an OpenAI-compatible endpoint. Without a key the shortcut questions still work and typed questions say the model is not connected.
- **Needs:** Python 3.13+, about 200 MB of memory, no GPU, no database server. Responses stream (server-sent events), so a proxy in front must not buffer.
- **Demo database:** only the six demo customers are served; any other customer id returns 404.
- **Candidates:** a small VM or container host. Running it on Verda, with the model on Verda's inference API, would also make the project eligible for "Best use of Verda".
