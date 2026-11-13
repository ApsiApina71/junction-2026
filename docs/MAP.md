---
status: active
tags: [index]
last-updated: 2026-11-13
---

# Map

The index of every doc and app. Read this first. Add every new doc or app here.

## Apps

| App | Type | Path | Purpose |
|---|---|---|---|
| _none yet: create one with `/new-app <name> <web\|api>`_ | | | |

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
| [specs/_template.md](specs/_template.md) | Lean PRD template |
| [security/security-rules.md](security/security-rules.md) | Security rules for code, agents and reviews |
| [runbooks/agent-onboarding.md](runbooks/agent-onboarding.md) | How agents and humans get productive |
| [runbooks/local-dev.md](runbooks/local-dev.md) | Local tooling and running apps |
| [runbooks/demo-day.md](runbooks/demo-day.md) | Demo and submission checklist |
| [../infra/README.md](../infra/README.md) | Hosting and CD (undecided) |
| [../design/README.md](../design/README.md) | Claude Design workflow and prototypes |

## Specs

| Spec | Ticket |
|---|---|
| _none yet_ | |

## Decisions (ADRs)

| ADR | Status |
|---|---|
| [ADR-001 Tech stack](architecture/adr-001-tech-stack.md) | accepted |
