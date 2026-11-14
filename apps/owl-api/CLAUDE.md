# owl-api

The contract is [`docs/specs/owl-contract.md`](../../docs/specs/owl-contract.md). Change the models in `app/models.py` and the contract together, and tell the glasses session about it.

## Run

```sh
cp .env.example .env   # a human fills in ANTHROPIC_API_KEY; agents never read .env
uv run --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

`--host 0.0.0.0` lets the iPhone reach the Mac at `http://<mac ip>:8000` (`ipconfig getifaddr en0`). Endpoints that still answer from `fixtures/` run without an API key. Swagger UI: `/swagger` (`/docs` is the company-documents endpoint).

Video on the glasses needs https (the DAT `VideoPlayer` refuses http). Open a tunnel and pass its address:

```sh
brew install cloudflared                      # once
cloudflared tunnel --url http://localhost:8000
PUBLIC_BASE_URL=https://<name>.trycloudflare.com uv run --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Placeholder step clips (and a placeholder picture for a step that has none): `uv run python scripts/make_placeholder_media.py`. The step pictures in `fixtures/media/` are sample pictures (JUN-35); the script leaves them alone.

## Verify

```sh
uv sync --locked
uv run ruff check .
uv run ruff format --check .
uv run pytest
```
