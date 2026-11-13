# junction-2026

Our team's monorepo for Junction 2026. AI agents do most of the work from Linear tickets.

## What we built: Kolme koria

**Know your three baskets.** Kolme koria ("three baskets") is an AI money coach for the S-Bank challenge. People talk with their own bank account, see where their money really goes, and get answers they can check, because the coach never guesses a number.

- **Three baskets:** regular essentials, unexpected necessities, everyday spending. The customer can move anything to the basket where it belongs for them.
- **Safe to spend and safe to save**, with the full sum behind each figure.
- **What-if** with a slider, turned into a four-week challenge in one tap.
- **Spender types**, **benchmarks** from Statistics Finland open data and same-age peers, and **free exploration** of one's own transactions.
- **The engine computes, the model talks:** a unit-tested finance engine produces every number; the language model only chooses a calculation and explains it. See [ADR-002](docs/architecture/adr-002-coach-architecture.md).

| Part | Path |
|---|---|
| Backend: engine, benchmarks, chat agent | [`apps/coach-api`](apps/coach-api/README.md) |
| Web: marketing site at `/`, the coach at `/app/`, pitch deck at `/deck/` | [`apps/coach-web`](apps/coach-web/README.md) |
| Pitch, video script, submission copy | [`docs/runbooks/pitch.md`](docs/runbooks/pitch.md) |

### Run it

```sh
cd apps/coach-api
sh scripts/setup_data.sh                      # once: downloads the dataset (360 MB) and builds the database
cp .env.example .env                          # add a model key for free-form chat; shortcuts work without one
(cd ../coach-web && npm ci && npm run build)  # the API serves the built web app
uv run --env-file .env uvicorn app.main:app
```

Open http://localhost:8000 for the site with the live demo, or http://localhost:8000/app/ for the coach alone.

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
