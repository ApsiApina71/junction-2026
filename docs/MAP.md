---
status: active
tags: [index]
last-updated: 2026-11-14
---

# Map

The index of every doc and app. Read this first. Add every new doc or app here.

## Apps

| App | Type | Path | Purpose |
|---|---|---|---|
| owl-glasses | ios (DAT) | [../apps/owl-glasses](../apps/owl-glasses/README.md) | Owl Boarding on Meta Ray-Ban Display glasses (display, camera, Neural Band, speech, voice invocations); was bite-ios |
| owl-api | api | [../apps/owl-api](../apps/owl-api/README.md) | Owl Boarding engine: processes, Owl Check, Ask, Record and Help for the glasses app and Owl Studio |
| owl-site | web | [../apps/owl-site](../apps/owl-site/README.md) | Owl Boarding launch page: the glasses and Neural Band in 3D and a fly-into-the-lens POV view |
| owl-studio | web | [../apps/owl-studio](../apps/owl-studio/README.md) | Owl Studio: the company's web app for documents, task review, new workers and the Help console |

## Agent tooling

| Path | What it is |
|---|---|
| [../AGENTS.md](../AGENTS.md) | Rules and workflow for every AI agent |
| [../CLAUDE.md](../CLAUDE.md) | Claude Code entry point (points to AGENTS.md) |
| [../.claude/skills/new-app/SKILL.md](../.claude/skills/new-app/SKILL.md) | `/new-app <name> <web\|api>`: scaffold an app |
| [../.claude/skills/verify-app/SKILL.md](../.claude/skills/verify-app/SKILL.md) | `/verify-app <app>`: run the app's Verify commands |
| [../.claude/skills/linear-pr/SKILL.md](../.claude/skills/linear-pr/SKILL.md) | `/linear-pr`: ship a ticket (currently direct to `main`) |
| [../.claude/settings.json](../.claude/settings.json) | Shared Claude Code permissions |
| [../.mcp.json](../.mcp.json) | MCP servers: `linear`, `strands` |
| [../.github/workflows/](../.github/workflows/) | `ci.yml`, `claude-code-review.yml`, `claude.yml` |
| [../.github/dependabot.yml](../.github/dependabot.yml) | Dependency updates |
| [../.github/pull_request_template.md](../.github/pull_request_template.md) | PR template (PR mode) |

## Docs

| Doc | What it is |
|---|---|
| [context/challenge.md](context/challenge.md) | Challenge brief and judging criteria |
| [architecture/adr-000-template.md](architecture/adr-000-template.md) | ADR template |
| [architecture/adr-001-tech-stack.md](architecture/adr-001-tech-stack.md) | Tech stack decision |
| [architecture/adr-003-glasses-app-dat-ios.md](architecture/adr-003-glasses-app-dat-ios.md) | Glasses app on Meta DAT iOS (today `owl-glasses` + `owl-api`) |
| [specs/_template.md](specs/_template.md) | Lean PRD template |
| [specs/onboarding-owl.md](specs/onboarding-owl.md) | Owl Boarding: what we build for the Meta challenge |
| [specs/owl-contract.md](specs/owl-contract.md) | Owl data model, API contract and mock data (owl-api, glasses app, Owl Studio) |
| [security/security-rules.md](security/security-rules.md) | Security rules for code, agents and reviews |
| [runbooks/agent-onboarding.md](runbooks/agent-onboarding.md) | How agents and humans get productive |
| [runbooks/local-dev.md](runbooks/local-dev.md) | Local tooling and running apps |
| [runbooks/demo-day.md](runbooks/demo-day.md) | Demo and submission checklist |
| [runbooks/owl-cafe-script.md](runbooks/owl-cafe-script.md) | Café scene for customer service mode (JUN-98) |
| [runbooks/owl-demo.md](runbooks/owl-demo.md) | Owl demo: start owl-api, tunnel and glasses app; rehearsal checklist for real glasses (JUN-53) |
| [../infra/README.md](../infra/README.md) | Hosting: what runs where for the demo |
| [../design/README.md](../design/README.md) | Claude Design workflow and prototypes |

## Specs

| Spec | Ticket |
|---|---|
| [Owl Boarding](specs/onboarding-owl.md) | [JUN-43](https://linear.app/junction-2026-bossit/issue/JUN-43) |
| [Owl contract](specs/owl-contract.md) | [JUN-27](https://linear.app/junction-2026-bossit/issue/JUN-27) |

## Decisions (ADRs)

| ADR | Status |
|---|---|
| [ADR-001 Tech stack](architecture/adr-001-tech-stack.md) | accepted |
| [ADR-003 Glasses app on Meta DAT iOS](architecture/adr-003-glasses-app-dat-ios.md) | accepted |
