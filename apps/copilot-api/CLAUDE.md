# copilot-api

## Run

```sh
cp .env.example .env   # a human fills in ANTHROPIC_API_KEY; agents never read .env
uv run --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` lets the iPhone reach the Mac. Set `APP_TOKEN` in `.env` on shared Wi-Fi.

## Verify

```sh
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pytest
```
