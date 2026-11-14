---
status: draft
tags: [infra, hosting]
last-updated: 2026-11-14
---

# Infra

**Hosting and CD are undecided.** We will not use AWS.

They will be chosen through a decision ticket (JUN-<n>) and recorded as an ADR in `docs/architecture/`. Until then, nothing is deployed from this repo and this folder holds no config.

What the decision must cover: where web and api apps run, how secrets are injected, preview deploys per PR, and CD from `main`.

## What runs where for the demo

Nothing is deployed yet. For the demo everything runs on one Mac, and the glasses app reaches owl-api through a Cloudflare quick tunnel. The steps are in [owl-demo.md](../docs/runbooks/owl-demo.md).

| Part | Where it runs | Notes |
|---|---|---|
| `apps/owl-api` | the Mac, `uvicorn` on port 8000, behind `cloudflared tunnel` | Python 3.13+, no database server: state in `data/state.json`. Secrets: `ANTHROPIC_API_KEY`, the Jev key, `API_TOKEN` when the tunnel is public |
| `apps/owl-studio` | the Mac, `npm run dev`, or any static host | Talks to owl-api at `VITE_API_URL` |
| `apps/owl-glasses` | the iPhone paired with the glasses | Built with Xcode; the server address is set in the app |
| `apps/owl-site` | any static host | Static files with relative paths; hosting is [JUN-87](https://linear.app/junction-2026-bossit/issue/JUN-87) |
