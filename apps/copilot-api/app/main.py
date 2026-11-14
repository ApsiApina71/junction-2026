import json
import os
import secrets
from collections.abc import Callable
from typing import Annotated

import anthropic
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from app.vision import MODEL_ID, CheckError, ProductCheck, check_product

# Optional shared secret, so others on the venue Wi-Fi cannot spend our API credits.
APP_TOKEN = os.getenv("APP_TOKEN", "")
MAX_IMAGE_BYTES = 5 * 1024 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}

DEMO_LIST = [
    "milk",
    "oat drink",
    "bananas",
    "eggs",
    "rye bread",
    "tomatoes",
    "pasta",
    "cheese",
]

app = FastAPI(title="copilot-api")


def _require_token(token: str) -> None:
    if APP_TOKEN and not secrets.compare_digest(token, APP_TOKEN):
        raise HTTPException(status_code=401, detail="Bad app token")


async def _read_image(image: UploadFile) -> bytes:
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Image must be JPEG, PNG or WebP")
    data = await image.read()
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413, detail="Image is empty or larger than 5 MB"
        )
    return data


async def _call_model[T](fn: Callable[[], T]) -> T:
    """Runs a blocking model call off the event loop and maps its failures to HTTP errors."""
    try:
        return await run_in_threadpool(fn)
    except CheckError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except anthropic.RateLimitError as exc:
        raise HTTPException(
            status_code=429, detail="Model rate limited, try again"
        ) from exc
    except anthropic.APIStatusError as exc:
        raise HTTPException(
            status_code=502, detail=f"Model error {exc.status_code}"
        ) from exc
    except anthropic.APIConnectionError as exc:
        raise HTTPException(status_code=503, detail="Cannot reach the model") from exc


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_id": MODEL_ID}


@app.get("/list")
def demo_list() -> dict:
    return {"items": DEMO_LIST}


@app.post("/check", response_model=ProductCheck)
async def check(
    image: Annotated[UploadFile, File()],
    # JSON array of strings; the demo list is used when empty.
    shopping_list: Annotated[str, Form()] = "",
    preferences: Annotated[str, Form()] = "budget-conscious, prefers less sugar",
    language: Annotated[str, Form()] = "en",
    x_app_token: Annotated[str, Header()] = "",
) -> ProductCheck:
    _require_token(x_app_token)
    data = await _read_image(image)

    items = DEMO_LIST
    if shopping_list:
        try:
            parsed = json.loads(shopping_list)
        except json.JSONDecodeError as exc:
            raise HTTPException(
                status_code=422, detail="shopping_list must be JSON"
            ) from exc
        if not isinstance(parsed, list) or not all(isinstance(i, str) for i in parsed):
            raise HTTPException(
                status_code=422, detail="shopping_list must be a list of strings"
            )
        items = [i.strip()[:80] for i in parsed if i.strip()][:50]

    content_type = image.content_type
    return await _call_model(
        lambda: check_product(
            data, content_type, items, preferences[:300], language[:10]
        )
    )
