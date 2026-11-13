---
status: active
tags: [app, api, coach]
last-updated: 2026-11-13
---

# coach-api

The backend of the S-Bank money coach (Junction 2026, S-Pankki challenge). Linear project: [Software](https://linear.app/junction-2026-bossit/project/software-e68385965606).

It turns a customer's transactions into guidance and lets them talk with their own data.

- `app/engine.py`: the finance engine. Pure, tested functions: the three baskets, safe-to-spend, safe-to-save, what-if, spender profile, free exploration, proactive insights. **Every number the coach says comes from here**, never from the language model.
- `app/taxonomy.py`: merchant-code labels (English and Finnish) and the basket rules. Customers can override any label.
- `app/benchmarks.py`: peers of the same age group in the dataset, plus Statistics Finland open data (Household Budget Survey 2022, consumer price index, Paavo postal code area incomes 2024) in `app/data/`.
- `app/mortgage.py`: the mortgage application story for customers who have one.
- `app/coach_tools.py` and `app/agent.py`: a Strands agent whose tools are bound to one customer. `run_sql` works on a private in-memory copy of that customer's rows with a SELECT-only authorizer.
- `app/main.py`: FastAPI. JSON endpoints for the app, and `POST /api/chat` streaming server-sent events (text, tool activity, UI cards).

The model is swappable with env vars (`LLM_PROVIDER`, `LLM_BASE_URL`, `MODEL_ID`): Anthropic by default, or any OpenAI-compatible endpoint such as an open-weight model hosted in Europe.

## Data

The dataset is not in git. `sh scripts/setup_data.sh` downloads it from the challenge repository and builds `data/sbank.db` (about 550 MB) and `data/peers.json`. `scripts/fetch_statfin.py` re-fetches the open data from Statistics Finland's PxWeb API.
