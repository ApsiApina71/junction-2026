---
status: active
tags: [runbook, dev]
last-updated: 2026-11-10
---

# Local development

## Tools

| Tool | Version | Why |
|---|---|---|
| Node.js | ≥22.12 (24 LTS recommended) | Vite 8, Vitest 5 |
| uv | latest | Python apps (it installs Python 3.13 itself) |
| gh | latest | PRs, auto-merge |
| Claude Code | latest | Agents, skills, MCP |

## Running an app

Every app's commands are in `apps/<app>/CLAUDE.md` (**Run** and **Verify**). Don't guess them.

## Env vars

Copy `apps/<app>/.env.example` to `apps/<app>/.env` and fill it in. Never commit `.env`.
