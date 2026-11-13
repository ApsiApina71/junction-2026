---
name: new-app
description: Scaffold an empty app under apps/<name>. A web app is official Vite react-ts + Vitest + oxlint. An api app is Python + uv + FastAPI + Strands Agents + pytest + ruff. Both get README.md, CLAUDE.md, .env.example, a CI job and a MAP.md entry.
argument-hint: "<name> <web|api>"
disable-model-invocation: true
---

Create `apps/$0` as a `$1` app. `$0` must be kebab-case and must not exist yet. Before pinning anything, check current versions and docs.

## web

1. `npm create vite@latest apps/$0 -- --template react-ts --no-interactive`
2. In `apps/$0`, run `npm install`, then `npm install -D vitest`.
3. In `package.json`, add `"test": "vitest run --passWithNoTests"` and `"engines": { "node": ">=22.12" }`. Keep the template's `lint` script (oxlint, see ADR-001).
4. Create `.env.example` containing `VITE_API_URL=http://localhost:8000`.
5. **Verify** commands: `npm ci`, `npm run lint`, `npm test`, `npm run build`.

## api

1. `uv init --bare --python 3.13 --author-from none --name $0 apps/$0`
2. In `apps/$0`, run `uv add fastapi "uvicorn[standard]" "strands-agents[anthropic]"`, then `uv add --dev pytest ruff httpx`.
3. Append `[tool.pytest.ini_options]` with `pythonpath = ["."]` to `pyproject.toml`.
4. Create these files:
   - `app/__init__.py`: empty.
   - `app/main.py`: `MODEL_ID = os.getenv("MODEL_ID", "claude-sonnet-5-5")`, `app = FastAPI(title="$0")`, and `GET /health` returning `{"status": "ok", "model_id": MODEL_ID}`.
   - `app/agent.py`: `build_agent()` returning `Agent(model=AnthropicModel(model_id=MODEL_ID, max_tokens=1024))`. The imports are `from strands import Agent` and `from strands.models.anthropic import AnthropicModel`. The API key comes from `ANTHROPIC_API_KEY` in the environment.
   - `tests/test_health.py`: use `TestClient(app)` and assert that `/health` returns 200 and `status == "ok"`.
   - `.env.example`: `ANTHROPIC_API_KEY=` and `MODEL_ID=claude-sonnet-5-5`.
5. **Run** command: `uv run --env-file .env uvicorn app.main:app --reload`.
6. **Verify** commands: `uv sync --locked`, `uv run ruff check .`, `uv run ruff format --check .`, `uv run pytest`.

## Both

1. `apps/$0/README.md`: frontmatter (`status`, `tags`, `last-updated`), what the app is for, and its Linear project.
2. `apps/$0/CLAUDE.md`: **Run** and **Verify** sections with the exact commands above. `/verify-app` runs these and nothing else.
3. `.github/workflows/ci.yml`:
   - Add a filter `$0: ['apps/$0/**', 'shared/**', '.github/workflows/ci.yml']`.
   - Add a job `$0` with `needs: changes`, `if: contains(fromJSON(needs.changes.outputs.apps), '$0')`, and `defaults.run.working-directory: apps/$0`.
   - Its steps are `actions/checkout`, then setup (web: `actions/setup-node` with `node-version: 24`, `cache: npm` and `cache-dependency-path: apps/$0/package-lock.json`; api: `astral-sh/setup-uv` with `enable-cache: true` and `working-directory: apps/$0`), then the Verify commands.
   - Add `$0` to `ci-ok.needs`. Use the same action versions as the rest of the file.
4. `.github/dependabot.yml`: add `/apps/$0` to the `npm` (web) or `uv` (api) entry, and create the entry if it is missing.
5. `docs/MAP.md`: add the app to the Apps table. In `AGENTS.md`, add a row to the project → app map (use `TBD` if there is no Linear project).
6. Run `/verify-app $0` and loop until it passes.
