---
status: active
tags: [adr, stack]
last-updated: 2026-11-13
---

# ADR-001: Tech stack

- **Decision status:** accepted
- **Ticket:** [JUN-5](https://linear.app/junction-2026-bossit/issue/JUN-5/record-tech-stack-decision-adr-001)
- **Date:** 2026-11-10

## Context

We have two days, AI agents write most of the code, and there is no human code review. The stack must be mainstream (agents know it well), quick to scaffold and easy to verify automatically.

## Decision

| Area | Choice |
|---|---|
| Web | Vite + React + TypeScript, from the official `react-ts` template. Vitest for tests. |
| Lint (web) | **oxlint**, the template's default. We chose it over ESLint because `typescript-eslint` does not yet support the template's TypeScript 7. Revisit when it does. |
| API | Python 3.13 + uv + FastAPI. pytest and ruff. |
| Agents | Strands Agents with the Anthropic provider. The model id comes from the `MODEL_ID` env var. |
| Tickets | Linear (Backlog → Todo → In Progress → In Review → Done) |
| UI/UX | Claude Design, see `design/README.md` |
| CI and review | GitHub Actions: path-filtered `ci.yml` with `ci-ok` as the required check, plus the Claude review |
| Hosting and CD | **TBD**, to be decided through a decision ticket (see `infra/README.md`). Not AWS. |

## Consequences

- Apps are scaffolded with `/new-app` only, so every app has the same shape.
- Node ≥22.12 is required (Vite 8, Vitest 5).
- Choosing hosting will need its own ADR.
- **For now, agents push straight to `main`**: CI runs on every push, and the Claude review runs only on PRs. The repo is public (Junction requires organizers to read the source), so GitHub Free can now enforce branch protection, required checks and auto-merge. Switching to PR mode needs a decision ticket.
