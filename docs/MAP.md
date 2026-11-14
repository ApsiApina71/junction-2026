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
| coach-api | api | [../apps/coach-api](../apps/coach-api/README.md) | Finance engine, benchmarks and the chat agent for the S-Bank money coach |
| coach-web | web | [../apps/coach-web](../apps/coach-web/README.md) | Mobile-first chat app for the S-Bank money coach |
| glasses-api | api | [../apps/glasses-api](../apps/glasses-api/README.md) | Automatic calorie tracker for camera glasses: frames in, a food log and a spoken sentence out |
| copilot-api | api | [../apps/copilot-api](../apps/copilot-api/README.md) | Photo from the glasses → Claude → product check |
| glasses-ios | ios (DAT) | [../apps/glasses-ios](../apps/glasses-ios/README.md) | iPhone app for Meta glasses: camera, speech, display |
| owl-glasses | ios (DAT) | [../apps/owl-glasses](../apps/owl-glasses/README.md) | Onboarding Owl on Meta Ray-Ban Display glasses (display, camera, Neural Band, speech, voice invocations); was bite-ios |
| owl-api | api | [../apps/owl-api](../apps/owl-api/README.md) | Onboarding Owl engine: processes, Owl Check, Ask, Record and Help for the glasses app and Owl Studio |
| owl-site | web | [../apps/owl-site](../apps/owl-site/README.md) | Onboarding Owl launch page: the glasses and Neural Band in 3D and a fly-into-the-lens POV view |
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
| [architecture/adr-002-coach-architecture.md](architecture/adr-002-coach-architecture.md) | Coach architecture: engine computes, model talks, model is swappable |
| [architecture/adr-003-glasses-app-dat-ios.md](architecture/adr-003-glasses-app-dat-ios.md) | Glasses app on Meta DAT iOS + copilot-api |
| [specs/_template.md](specs/_template.md) | Lean PRD template |
| [specs/onboarding-owl.md](specs/onboarding-owl.md) | Onboarding Owl: what we build for the Meta challenge |
| [specs/owl-contract.md](specs/owl-contract.md) | Owl data model, API contract and mock data (owl-api, glasses app, Owl Studio) |
| [security/security-rules.md](security/security-rules.md) | Security rules for code, agents and reviews |
| [runbooks/agent-onboarding.md](runbooks/agent-onboarding.md) | How agents and humans get productive |
| [runbooks/local-dev.md](runbooks/local-dev.md) | Local tooling and running apps |
| [runbooks/demo-day.md](runbooks/demo-day.md) | Demo and submission checklist |
| [runbooks/owl-demo.md](runbooks/owl-demo.md) | Owl demo: start owl-api, tunnel and glasses app; rehearsal checklist for real glasses (JUN-53) |
| [runbooks/pitch.md](runbooks/pitch.md) | Video script, stage pitch, submission copy, judge questions |
| [../infra/README.md](../infra/README.md) | Hosting and CD (undecided) |
| [../design/README.md](../design/README.md) | Claude Design workflow and prototypes |

## Specs

| Spec | Ticket |
|---|---|
| [Onboarding Owl](specs/onboarding-owl.md) | [JUN-43](https://linear.app/junction-2026-bossit/issue/JUN-43) |
| [Owl contract](specs/owl-contract.md) | [JUN-27](https://linear.app/junction-2026-bossit/issue/JUN-27) |

## Decisions (ADRs)

| ADR | Status |
|---|---|
| [ADR-001 Tech stack](architecture/adr-001-tech-stack.md) | accepted |
| [ADR-002 Coach architecture](architecture/adr-002-coach-architecture.md) | proposed |
| [ADR-003 Glasses app on Meta DAT iOS](architecture/adr-003-glasses-app-dat-ios.md) | accepted |
