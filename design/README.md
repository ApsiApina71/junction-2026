---
status: active
tags: [design, ui, ux]
last-updated: 2026-11-10
---

# Design

We use **Claude Design** for UI/UX: flows, prototypes and the design system.

## Design system

- One team design system lives in Claude, set as the organization default so every new design uses it.
- Once a web app exists, sync the design system from its code (colors, type, components), and sync again after UI changes land.

## Prototypes

- One folder per ticket: `design/JUN-<n>/`, containing a `README.md` (frontmatter, ticket link, Claude Design link, decisions) plus any exported files.
- The ticket links the folder and the folder links the ticket. List the folder in `docs/MAP.md`.

## Handoff to Claude Code

- Give the implementing agent the Claude Design link (teammates need edit access) in the ticket. In this repo, it implements the design from that link.
- If the design was made in a Claude Code session, ask that same session to build it.
- Export features in Claude Design are still in preview. Check the current docs before relying on a specific export flow.
