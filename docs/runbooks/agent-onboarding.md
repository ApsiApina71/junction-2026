---
status: active
tags: [runbook, agents, linear]
last-updated: 2026-11-13
---

# Agent onboarding

## For an agent session

1. Read `docs/MAP.md`, then `AGENTS.md`.
2. Take a ticket from Linear (Todo), read its linked docs and design, and move it to In Progress.
3. Turn the goal into checks. Work until `/verify-app <app>` passes.
4. Ship with `/linear-pr`.

## For a human setting up an agent

1. Clone `https://github.com/ApsiApina71/junction-2026` and open Claude Code in its root.
2. Run `/mcp` and log in to `linear`. `strands` needs no login.
3. Check that `gh auth status` shows the right account.
4. Point the agent at a ticket: "Work on JUN-<n>".

## One-time repo setup

- **Linear GitHub integration:** Linear → Settings → Integrations → GitHub, with access to this repo. Commits with `Fixes JUN-<n>` then show up on the ticket.
- **Claude GitHub app:** run `/install-github-app` in Claude Code. It adds the `ANTHROPIC_API_KEY` secret that `@claude` and the Claude review need.

## Writing good tickets

- One outcome per ticket, with a checkable definition of done.
- Link the spec (`docs/specs/`) and the design (`design/JUN-<n>/`).
- Put product direction, money and credentials decisions in the ticket. Agents will not guess them.
