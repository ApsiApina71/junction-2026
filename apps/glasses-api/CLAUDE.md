# glasses-api

## Run

```sh
cp .env.example .env   # once, then a human adds ANTHROPIC_API_KEY
uv run --env-file .env uvicorn app.main:app --reload
```

The test page is at `http://localhost:8000`. Add `--host 0.0.0.0` to reach it from another device.

## Verify

```sh
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

Tests use a stand-in for the model (`tests/conftest.py`) and do not need an API key.
