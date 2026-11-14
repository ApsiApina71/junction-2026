# AGENTS.md

Instructions for any AI agent working in this repo.
**Start every session by reading [`docs/MAP.md`](docs/MAP.md).**

## Repo layout

| Path | Purpose |
|---|---|
| `apps/<app>/` | One deployable app per folder, created with `/new-app` |
| `shared/` | Code used by two or more apps |
| `docs/` | ADRs, specs, context, security, runbooks (indexed in `docs/MAP.md`) |
| `design/JUN-<n>/` | Claude Design prototypes, linked from tickets |
| `infra/` | Hosting and CD (undecided) |
| `.claude/` | Agent settings and skills (`/new-app`, `/verify-app`, `/linear-pr`) |
| `.github/` | CI, Claude review, Dependabot, PR template |

## Working principles

1. **Think before coding.** Read the ticket and linked docs. State your assumptions, then plan.
2. **Simplicity first.** Make the smallest change that meets the goal. No speculative abstractions.
3. **Surgical changes.** Touch only what the task needs. No drive-by refactors.
4. **Goal-driven.** Turn each task into a check (test, command, observable result) and loop until it passes.

## Rules

- Docs are Markdown with frontmatter: `status` (draft | active | deprecated), `tags`, `last-updated` (YYYY-MM-DD).
- Every doc is listed in `docs/MAP.md`.
- Docs and tickets link both ways: the doc links its ticket, the ticket links its doc.
- Nothing new outside this structure without a decision ticket. Decisions become ADRs in `docs/architecture/`.
- Names are kebab-case. Exceptions: conventional files (`README.md`, `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, `LICENSE`), `_`-prefixed templates, ticket ids (`JUN-<n>`).
- Follow [`docs/security/security-rules.md`](docs/security/security-rules.md).
- Agent tooling lives in `.claude/`. Skills go in `.claude/skills/<kebab-name>/SKILL.md`, and each one is listed in `docs/MAP.md` and `CLAUDE.md`. Shared permissions go in `.claude/settings.json`, MCP servers in `.mcp.json`. Personal overrides go in `.claude/settings.local.json`, which is gitignored.

## Where to find context

| Need | Look in |
|---|---|
| What exists and where | `docs/MAP.md` |
| Challenge brief and judging criteria | `docs/context/challenge.md` |
| Why things are the way they are | `docs/architecture/` |
| What to build | The Linear ticket, then `docs/specs/` |
| How to run and verify an app | `apps/<app>/CLAUDE.md` |
| UI and design | `design/JUN-<n>/` linked from the ticket |

## Linear workflow

Team key `JUN`. States: **Backlog → Todo → In Progress → In Review → Done**.

1. Take a Todo ticket, assign yourself, move it to In Progress.
2. Pull the latest `main` and keep each change small.
3. Verify with `/verify-app <app>`.
4. Ship with `/linear-pr`. **For now, it commits straight to `main`** with `Fixes JUN-<n>` in the message, then moves the ticket to Done once CI is green. PR mode (auto-merge on green `ci-ok` and the Claude review) comes back when we have a merge gate.
5. Unclear? Don't wait. Write `Assumption: ...` on the ticket and continue.
6. Ask humans only about product direction, money or credentials.

## Project → app map

| Linear project | App | Path |
|---|---|---|
| [Research](https://linear.app/junction-2026-bossit/project/research-02b541f065e9) | none (docs only) | `docs/context/`, `docs/specs/` |
| [Software](https://linear.app/junction-2026-bossit/project/software-e68385965606) | owl-glasses and owl-api (Owl Boarding) | `apps/owl-glasses/`, `apps/owl-api/` |
| [Launch Page](https://linear.app/junction-2026-bossit/project/launch-page-5e64dd64e4ff) | owl-site | `apps/owl-site/` |
| [Software](https://linear.app/junction-2026-bossit/project/software-e68385965606) | owl-studio (Owl Boarding, the company's web app) | `apps/owl-studio/` |
| [Prototyping](https://linear.app/junction-2026-bossit/project/prototyping-8076b0344cc5) | none (Claude Design) | `design/` |
| [Pitch Deck](https://linear.app/junction-2026-bossit/project/pitch-deck-a6caa29caa5c) | none | |
| [Demo Video](https://linear.app/junction-2026-bossit/project/demo-video-32ee7efc2fe7) | none | |
| [Submission](https://linear.app/junction-2026-bossit/project/submission-bafb47e71313) | none | `docs/runbooks/demo-day.md` |
