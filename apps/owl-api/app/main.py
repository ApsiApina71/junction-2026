"""HTTP API of Onboarding Owl. The contract is docs/specs/owl-contract.md.

Owl Check (vision + verifier) and Ask run the real engine. Record still finishes with the sample process.
"""

import io
import os
import secrets
from collections.abc import Callable
from typing import Annotated, Any

import anthropic
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

from . import ask as ask_engine
from . import verifier, vision
from .models import (
    Answer,
    AskRequest,
    CheckResult,
    Doc,
    Employee,
    HelpMessage,
    HelpSession,
    Process,
    RecordedStep,
    Recording,
    RecordStart,
    SayRequest,
    Step,
)
from .store import Store, load_fixture, now_iso

MODEL_ID = vision.MODEL_ID
MOCK_CHECK = os.getenv("OWL_MOCK_CHECK", "") == "1"
MOCK_ASK = os.getenv("OWL_MOCK_ASK", "") == "1"
API_TOKEN = os.getenv("API_TOKEN", "")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")

MAX_FRAME_BYTES = 6 * 1024 * 1024
MAX_DOC_BYTES = 10 * 1024 * 1024
MAX_CLIP_BYTES = 80 * 1024 * 1024
MAX_SIDE = 1024  # Frames are downscaled to this before they go to a model.
REFERENCE_SIDE = 600  # The Display glasses render at 600x600 (DAT docs).
Image.MAX_IMAGE_PIXELS = 40_000_000

# /docs is the company-documents endpoint, so the Swagger UI moves to /swagger.
app = FastAPI(title="owl-api", docs_url="/swagger", redoc_url=None)
store = Store()
tracker = verifier.Tracker()

# Owl Studio runs in a browser on another port.
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


def check_token(x_api_token: Annotated[str, Header()] = "") -> None:
    if API_TOKEN and not secrets.compare_digest(x_api_token.encode(), API_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="Missing or wrong API token.")


Auth = Depends(check_token)


# Helpers


def base_url(request: Request) -> str:
    return PUBLIC_BASE_URL or str(request.base_url).rstrip("/")


def absolute(value: Any, base: str) -> Any:
    """Turns every /media/... path in *_url fields into an absolute URL."""
    if isinstance(value, dict):
        return {k: (base + v if k.endswith("_url") and isinstance(v, str) and v.startswith("/") else absolute(v, base)) for k, v in value.items()}
    if isinstance(value, list):
        return [absolute(v, base) for v in value]
    return value


def out(request: Request, model: BaseModel | list | dict) -> Any:
    data = model.model_dump(mode="json", by_alias=True) if isinstance(model, BaseModel) else model
    return absolute(data, base_url(request))


def to_jpeg(body: bytes, max_side: int = MAX_SIDE) -> bytes:
    """Checks that the upload is an image and returns it as an upright JPEG no larger than max_side."""
    if not body or len(body) > MAX_FRAME_BYTES:
        raise HTTPException(status_code=413, detail="Image is empty or larger than 6 MB.")
    try:
        with Image.open(io.BytesIO(body)) as img:
            img = ImageOps.exif_transpose(img).convert("RGB")
            img.thumbnail((max_side, max_side))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=82)
            return buf.getvalue()
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as e:
        raise HTTPException(status_code=400, detail="Not an image this API can read. Send a JPEG or PNG.") from e


async def read_image(upload: UploadFile, max_side: int = MAX_SIDE) -> bytes:
    if upload.content_type not in {"image/jpeg", "image/png", "image/webp", "image/heic"}:
        raise HTTPException(status_code=415, detail="Image must be JPEG, PNG, WebP or HEIC.")
    return to_jpeg(await upload.read(MAX_FRAME_BYTES + 1), max_side)


def get_process(process_id: str) -> Process:
    process = store.processes.get(process_id)
    if process is None:
        raise HTTPException(status_code=404, detail=f"No process {process_id}.")
    return process


def get_step(process: Process, step_id: str) -> Step:
    for step in process.steps:
        if step.id == step_id:
            return step
    raise HTTPException(status_code=404, detail=f"No step {step_id} in {process.id}.")


# Health, employees, processes


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_id": MODEL_ID}


@app.get("/employees/{employee_id}", response_model=Employee, dependencies=[Auth])
def employee(employee_id: str, request: Request):
    found = store.employees.get(employee_id)
    if found is None:
        raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
    return out(request, found)


@app.get("/processes", dependencies=[Auth])
def processes(request: Request) -> dict:
    return {"processes": [out(request, p) for p in store.processes.values()]}


@app.get("/processes/{process_id}", response_model=Process, dependencies=[Auth])
def process(process_id: str, request: Request):
    return out(request, get_process(process_id))


@app.put("/processes/{process_id}", response_model=Process, dependencies=[Auth])
def update_process(process_id: str, body: Process, request: Request):
    get_process(process_id)
    if body.id != process_id:
        raise HTTPException(status_code=422, detail="The body's id must match the URL.")
    base = base_url(request)
    # Owl Studio sends back the absolute URLs it got; store paths again.
    data = body.model_dump()
    for step in data["steps"]:
        for key in ("reference_image_url", "clip_url"):
            if step[key] and step[key].startswith(base + "/media/"):
                step[key] = step[key][len(base) :]
    store.processes[process_id] = Process.model_validate(data)
    return out(request, store.processes[process_id])


# Owl Check


def mock_check(step: Step, final: bool, mock: str) -> CheckResult:
    """Fixture answers, so the apps can show every check state without a model."""
    name = {"warning": "check-warning.json", "unsure": "check-unsure.json"}.get(mock, "check-ok.json")
    result = CheckResult.model_validate(load_fixture(name))
    if mock == "checking":
        result = result.model_copy(update={"status": "checking", "problem": "wrong_item", "say": None, "text": "Checking..."})
    if step.check.kind == "visual":
        result = result.model_copy(update={"lines": None, "problem": "not_matching" if result.problem else None})
    return result.model_copy(update={"step_done": final and result.status == "ok"})


def reference_image(step: Step) -> bytes | None:
    url = step.reference_image_url or ""
    path = store.media_path(url.removeprefix("/media/")) if url.startswith("/media/") else None
    return to_jpeg(path.read_bytes(), REFERENCE_SIDE) if path else None


async def call_model[T](fn: Callable[[], T]) -> T:
    """Runs a blocking model call off the event loop and maps its failures to HTTP errors."""
    try:
        return await run_in_threadpool(fn)
    except vision.VisionError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    except anthropic.RateLimitError as e:
        raise HTTPException(status_code=429, detail="Model rate limited, try again.") from e
    except anthropic.APIStatusError as e:
        raise HTTPException(status_code=502, detail=f"Model error {e.status_code}.") from e
    except anthropic.APIConnectionError as e:
        raise HTTPException(status_code=503, detail="Cannot reach the model.") from e


@app.post("/check", response_model=CheckResult, dependencies=[Auth])
async def check(
    request: Request,
    image: Annotated[UploadFile, File()],
    process_id: Annotated[str, Form()],
    step_id: Annotated[str, Form()],
    run_id: Annotated[str, Form(min_length=1, max_length=64)],
    final: Annotated[bool, Form()] = False,
    language: Annotated[str, Form(max_length=10)] = "",
    # ok | warning | unsure | checking: a fixture answer instead of the model, for UI work. Also OWL_MOCK_CHECK=1.
    mock: Annotated[str, Form()] = "",
):
    step = get_step(get_process(process_id), step_id)
    frame = await read_image(image)
    if mock or MOCK_CHECK:
        return out(request, mock_check(step, final, mock))
    language = language or next((e.language for e in store.employees.values() if process_id in e.process_ids), "en")
    if not tracker.try_begin(run_id):
        # One check per run at a time: a frame that arrives while the last one is checked is answered at once.
        return out(request, CheckResult(status="checking", text="Checking...", confidence=0.0, decided_by="rules"))
    try:
        reference = reference_image(step)
        result = await call_model(lambda: verifier.run_check(step, frame, reference, run_id, final, language, tracker, observe=vision.observe))
    finally:
        tracker.end(run_id)
    return out(request, result)


# Ask


@app.post("/ask", response_model=Answer, dependencies=[Auth])
async def ask(body: AskRequest, request: Request):
    if MOCK_ASK:
        return out(request, Answer.model_validate(load_fixture("answer.json")))
    employee = store.employees.get(body.employee_id or "")
    language = body.language or (employee.language if employee else "en")
    context = None
    if body.process_id in store.processes:
        process = store.processes[body.process_id]
        step = next((s for s in process.steps if s.id == body.step_id), None)
        context = f"{process.title}" + (f", step {step.index}: {step.title}" if step else "")
    docs = [(doc.title, text) for doc, text in store.docs.values()]
    return out(request, await call_model(lambda: ask_engine.answer(body.question, docs, language, context)))


@app.get("/docs", dependencies=[Auth])
def docs(request: Request) -> dict:
    return {"docs": [out(request, doc) for doc, _ in store.docs.values()]}


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return "\n\n".join(page.extract_text() or "" for page in reader.pages)


@app.post("/docs", response_model=Doc, dependencies=[Auth])
async def upload_doc(file: Annotated[UploadFile, File()], request: Request):
    filename = os.path.basename(file.filename or "")
    stem, ext = os.path.splitext(filename)
    ext = ext.lower()
    if ext not in {".md", ".txt", ".pdf"} or not stem:
        raise HTTPException(status_code=415, detail="Upload a .md, .txt or .pdf file.")
    data = await file.read(MAX_DOC_BYTES + 1)
    if not data or len(data) > MAX_DOC_BYTES:
        raise HTTPException(status_code=413, detail="The file is empty or larger than 10 MB.")
    try:
        text = pdf_text(data) if ext == ".pdf" else data.decode("utf-8")
    except Exception as e:  # pypdf raises many types on broken files
        raise HTTPException(status_code=400, detail="Could not read the text in this file.") from e
    if not text.strip():
        raise HTTPException(status_code=400, detail="The file has no text (a scanned PDF needs OCR first).")
    safe = "".join(c if c.isalnum() or c in "-_" else "-" for c in stem).strip("-").lower() or "doc"
    return out(request, store.add_doc(f"{safe}.md" if ext == ".pdf" else f"{safe}{ext}", text))


# Record


def get_recording(record_id: str) -> Recording:
    rec = store.recordings.get(record_id)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"No recording {record_id}.")
    return rec


@app.post("/record", response_model=Recording, dependencies=[Auth])
def record_start(body: RecordStart, request: Request):
    rec = Recording(id=store.next_id("rec"), title=body.title, expert=body.expert, status="recording")
    store.recordings[rec.id] = rec
    return out(request, rec)


@app.post("/record/{record_id}/steps", response_model=Recording, dependencies=[Auth])
async def record_step(
    record_id: str,
    request: Request,
    narration: Annotated[str, Form(max_length=4000)],
    photo: Annotated[UploadFile, File()],
    clip: Annotated[UploadFile | None, File()] = None,
):
    rec = get_recording(record_id)
    if rec.status != "recording":
        raise HTTPException(status_code=409, detail="This recording is already finished.")
    index = len(rec.steps) + 1
    photo_url = store.save_media(f"{rec.id}/{index}.jpg", await read_image(photo, REFERENCE_SIDE))
    clip_url = None
    if clip is not None and clip.filename:
        data = await clip.read(MAX_CLIP_BYTES + 1)
        if not data or len(data) > MAX_CLIP_BYTES:
            raise HTTPException(status_code=413, detail="The clip is empty or larger than 80 MB.")
        # Mock: stored as sent. JUN-32 converts it to a display-sized H.264 MP4.
        clip_url = store.save_media(f"{rec.id}/{index}-source.mp4", data)
    rec.steps.append(RecordedStep(index=index, narration=narration.strip(), photo_url=photo_url, clip_url=clip_url))
    return out(request, rec)


@app.post("/record/{record_id}/finish", response_model=Recording, dependencies=[Auth])
def record_finish(record_id: str, request: Request):
    rec = get_recording(record_id)
    if not rec.steps:
        raise HTTPException(status_code=409, detail="Record at least one step first.")
    # Mock: points at the sample process. JUN-32 writes a new draft process from the steps.
    rec.status, rec.process_id = "done", "proc-pick-pack"
    return out(request, rec)


@app.get("/record/{record_id}", response_model=Recording, dependencies=[Auth])
def record_get(record_id: str, request: Request):
    return out(request, get_recording(record_id))


# Help


def get_help(help_id: str) -> HelpSession:
    session = store.help.get(help_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"No help session {help_id}.")
    return session


@app.post("/help/frames", response_model=HelpSession, dependencies=[Auth])
async def help_frame(
    request: Request,
    image: Annotated[UploadFile, File()],
    employee_id: Annotated[str, Form()] = "",
    process_id: Annotated[str, Form()] = "",
    step_id: Annotated[str, Form()] = "",
    help_id: Annotated[str, Form()] = "",
):
    frame = await read_image(image, REFERENCE_SIDE)
    if help_id:
        session = get_help(help_id)
        if session.status == "ended":
            raise HTTPException(status_code=409, detail="This help session has ended.")
    else:
        session = HelpSession(id=store.next_id("help"), status="waiting", updated_at=now_iso())
        store.help[session.id] = session
    session.latest_frame_url = store.save_media(f"help/{session.id}/latest.jpg", frame) + f"?t={secrets.token_hex(4)}"
    session.employee_id = employee_id or session.employee_id
    session.process_id = process_id or session.process_id
    session.step_id = step_id or session.step_id
    session.updated_at = now_iso()
    return out(request, session)


@app.get("/help", dependencies=[Auth])
def help_list(request: Request) -> dict:
    newest_first = sorted(store.help.values(), key=lambda s: s.updated_at, reverse=True)
    sessions = sorted(newest_first, key=lambda s: s.status == "ended")
    return {"sessions": [out(request, s) for s in sessions]}


@app.get("/help/{help_id}", response_model=HelpSession, dependencies=[Auth])
def help_get(help_id: str, request: Request):
    return out(request, get_help(help_id))


@app.post("/help/{help_id}/say", response_model=HelpSession, dependencies=[Auth])
def help_say(help_id: str, body: SayRequest, request: Request):
    session = get_help(help_id)
    if session.status == "ended":
        raise HTTPException(status_code=409, detail="This help session has ended.")
    with store.lock:
        message = HelpMessage(id=len(session.messages) + 1, from_=body.from_, text=body.text.strip(), at=now_iso())
        session.messages.append(message)
    if body.from_ == "expert":
        session.status = "connected"
    session.updated_at = message.at
    return out(request, session)


@app.post("/help/{help_id}/end", response_model=HelpSession, dependencies=[Auth])
def help_end(help_id: str, request: Request):
    session = get_help(help_id)
    session.status, session.updated_at = "ended", now_iso()
    return out(request, session)


# Media


# HEAD and Range requests too: video players use them.
@app.api_route("/media/{path:path}", methods=["GET", "HEAD"])
def media(path: str) -> FileResponse:
    found = store.media_path(path)
    if found is None:
        raise HTTPException(status_code=404, detail="No such media file.")
    return FileResponse(found)
