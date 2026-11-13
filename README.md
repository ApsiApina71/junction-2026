# junction-2026

Our team's monorepo for Junction 2026. AI agents do most of the work from Linear tickets.

- **Agents:** start with [AGENTS.md](AGENTS.md).
- **Humans:** start with [docs/runbooks/agent-onboarding.md](docs/runbooks/agent-onboarding.md) and [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md).
- **Doc index:** [docs/MAP.md](docs/MAP.md).

## What existed before the event

Junction rules allow no code written before the event. Before hacking started (Fri 13.11 19:30) this repo held only generic, idea-agnostic tooling: agent instructions, Claude Code skills, CI workflows, doc templates and the tech-stack ADR. There was no product code, spec or idea-specific content. Everything under `apps/`, `shared/`, `docs/specs/` and `design/JUN-<n>/` is written at the event.

## Stack

Vite + React + TypeScript for web apps, Python + FastAPI + Strands Agents for APIs, Linear (team `JUN`) for tickets, Claude Design for UI. Hosting is undecided. See [ADR-001](docs/architecture/adr-001-tech-stack.md).

## Team

TODO(team): GitHub handles.

## License

[MIT](LICENSE). Junction licenses every project submission under MIT.
