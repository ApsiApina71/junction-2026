---
status: draft
tags: [adr, coach, architecture]
last-updated: 2026-11-13
---

# ADR-002: Coach architecture

- **Decision status:** proposed
- **Ticket:** TODO(team): decision ticket
- **Date:** 2026-11-13

## Context

The S-Bank challenge asks for a trusted financial coach people can talk with. Trust breaks the moment a chatbot states a wrong euro amount. The team also wants the option to enter the "Best use of Verda" side challenge, and a Finnish bank has good reasons to keep customer data on European infrastructure.

## Options

1. Give the model the transactions and let it answer. Simple, but it invents and miscalculates numbers, and sends raw data to the model.
2. Fixed dashboards with a thin chat on top. Safe, but it is exactly what the brief says banking should move past.
3. A deterministic finance engine computes everything; the model only chooses tools and words.

## Decision

Option 3.

- `apps/coach-api/app/engine.py` holds pure, unit-tested functions for the three baskets, safe-to-spend, safe-to-save, what-if, spender profile, exploration and insights. The model may state only figures a tool returned.
- Tools are created per request and bound to one customer. Free exploration (`run_sql`) runs on a private in-memory copy of that customer's rows with a SELECT-only authorizer, so a prompt cannot reach other customers or change data.
- After each answer the server checks every euro amount in the model's text against the numbers tools returned in that turn (`app/verify.py`) and streams the result, so the app can say "3 figures checked against your account" or name an amount it could not check.
- Tools also emit UI cards, streamed to the app next to the text, so answers are visual and interactive without the model drawing anything.
- The model is swappable with env vars: Anthropic by default, or any OpenAI-compatible endpoint. Because the model does no maths, a smaller open-weight model hosted in Europe (for example on Verda) can run the same coach. That is our route into the Verda side challenge without a separate build.
- Basket labels are a starting point. The customer can move any category to another basket, and every figure follows.
- Benchmarks use open data fetched from Statistics Finland's PxWeb API, stored with source metadata in `apps/coach-api/app/data/`.

## Consequences

- Answers are reproducible and testable; the model can be changed late without touching the numbers.
- New kinds of questions need either `run_sql` or a new engine function.
- The dataset (360 MB) stays out of git; `scripts/setup_data.sh` rebuilds it. Hosting needs about 600 MB of disk.
- Demo customers are selected by id in the request. In production the customer comes from the authenticated bank session.
- Finnish quality of open-weight models is untested. Verify before switching the demo to one.
