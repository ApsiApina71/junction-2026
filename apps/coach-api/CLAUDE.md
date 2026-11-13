# coach-api

## Run

```sh
sh scripts/setup_data.sh   # once: downloads the dataset and builds data/sbank.db and data/peers.json
uv run --env-file .env uvicorn app.main:app --reload
```

If `../coach-web/dist` exists the API also serves the web app at `/`.

## Verify

```sh
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

Tests use a synthetic customer built in `tests/conftest.py` and do not need the dataset.
