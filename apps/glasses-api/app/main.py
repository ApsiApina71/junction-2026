"""HTTP API of the calorie tracker: camera frames in, a food log and a sentence to speak out."""

import io
import os
import secrets
import threading
from datetime import datetime
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError

from . import vision
from .tracker import TIMEZONE, Tracker

MAX_FRAME_BYTES = 6 * 1024 * 1024
MAX_SIDE = 1024  # Frames are downscaled to this before they go to the model.
Image.MAX_IMAGE_PIXELS = 40_000_000

API_TOKEN = os.getenv("API_TOKEN", "")
DB_PATH = os.getenv("DB_PATH", "data/glasses.db")
STATIC = Path(__file__).parent / "static"

app = FastAPI(title="glasses-api")
# Tests replace these two.
analyse = vision.analyse
tracker: Tracker | None = None

origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
if origins:
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

# One frame is analysed at a time. A frame that arrives while the model is busy is dropped, not queued.
_busy = threading.Lock()


def get_tracker() -> Tracker:
    global tracker
    if tracker is None:
        tracker = Tracker(DB_PATH)
    return tracker


def check_token(x_api_token: str | None = Header(default=None), token: str | None = Query(default=None)) -> None:
    """When API_TOKEN is set, every data endpoint needs it, as the X-Api-Token header or a ?token= query."""
    if not API_TOKEN:
        return
    given = (x_api_token or token or "").encode()
    if not secrets.compare_digest(given, API_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="Missing or wrong API token.")


def normalise(body: bytes) -> bytes:
    """Check that the upload is an image and return it as a JPEG no larger than MAX_SIDE."""
    try:
        with Image.open(io.BytesIO(body)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((MAX_SIDE, MAX_SIDE))
            out = io.BytesIO()
            img.save(out, format="JPEG", quality=80)
            return out.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as e:
        raise HTTPException(status_code=400, detail="The body is not an image this API can read. Send a JPEG or PNG.") from e


def handle_frame(body: bytes) -> dict:
    frame = normalise(body)
    if not _busy.acquire(blocking=False):
        return {"event": "busy", "say": None, "scene": None, "today": None}
    try:
        log = get_tracker()
        now = datetime.now(TIMEZONE)
        try:
            sighting = analyse(frame, log.open_meal(now))
        except vision.VisionError as e:
            raise HTTPException(status_code=503, detail=str(e)) from e
        outcome = log.observe(sighting, frame, now)
        return {"event": outcome.event, "say": outcome.say, "scene": sighting.scene, "today": log.today(now)}
    finally:
        _busy.release()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_id": vision.MODEL_ID}


@app.get("/")
def page() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.post("/frames", dependencies=[Depends(check_token)])
async def post_frame(request: Request) -> dict:
    """Send one camera frame as the raw request body (JPEG or PNG). Returns what happened and what to say aloud."""
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_FRAME_BYTES:
            raise HTTPException(status_code=413, detail="The frame is larger than 6 MB.")
        chunks.append(chunk)
    if size == 0:
        raise HTTPException(status_code=400, detail="The request body is empty. Send the image bytes as the body.")
    return await run_in_threadpool(handle_frame, b"".join(chunks))


@app.get("/today", dependencies=[Depends(check_token)])
def today() -> dict:
    return get_tracker().today(datetime.now(TIMEZONE))


@app.get("/entries/{entry_id}/image", dependencies=[Depends(check_token)])
def entry_image(entry_id: int) -> Response:
    image = get_tracker().image(entry_id)
    if image is None:
        raise HTTPException(status_code=404, detail="No such entry.")
    return Response(content=image, media_type="image/jpeg")


@app.delete("/entries/{entry_id}", dependencies=[Depends(check_token)])
def delete_entry(entry_id: int) -> dict:
    if not get_tracker().delete(entry_id):
        raise HTTPException(status_code=404, detail="No such entry.")
    return get_tracker().today(datetime.now(TIMEZONE))
