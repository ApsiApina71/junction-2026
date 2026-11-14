"""HTTP API of Owl Boarding. The contract is docs/specs/owl-contract.md.

Owl Check (vision + verifier), Ask and Record run the real engine; OWL_MOCK_* switch each one to fixtures.
"""

import asyncio
import io
import json
import logging
import os
import secrets
import threading
import time
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Any, Literal

import anthropic
from fastapi import BackgroundTasks, Depends, FastAPI, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
from fastapi import Path as PathParam
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image, ImageDraw, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

from . import ask as ask_engine
from . import assist as assist_engine
from . import demo as demo_engine
from . import docs_process as docs_engine
from . import jepa, location, people, persist, place, shift, training, verifier, vision
from . import media as media_engine
from . import progress as progress_engine
from . import record as record_engine
from . import stage as stage_engine
from . import translate as translate_engine
from .models import (
    Answer,
    AskRequest,
    AssistAnswer,
    AssistRequest,
    AssistSign,
    CheckResult,
    Consent,
    Doc,
    Employee,
    FromDocs,
    HelpAnswer,
    HelpMessage,
    HelpSession,
    Mark,
    Process,
    RecordedStep,
    Recording,
    RecordStart,
    SayRequest,
    Step,
    TranslateRequest,
)
from .store import Store, lang_key, load_fixture, now_iso

log = logging.getLogger("owl.api")
MODEL_ID = vision.MODEL_ID
MOCK_CHECK = os.getenv("OWL_MOCK_CHECK", "") == "1"
MOCK_ASK = os.getenv("OWL_MOCK_ASK", "") == "1"
# 1 = customer service suggestions from the local handbook search, without the model (JUN-98). Also in demo mode.
MOCK_ASSIST = os.getenv("OWL_MOCK_ASSIST", "") == "1"
# 1 = the demo story plays without models (JUN-69): scripted observations for /check, handbook search for /ask,
# narration drafts for /record. Every check answers decided_by "demo".
DEMO = os.getenv("OWL_DEMO", "") == "1"
# In demo mode, the parts listed here still use the live models: "check" (Owl Check: vision and the verifier),
# "recognize" (step recognition with V-JEPA) and "place" (place recognition). For the demo on real glasses, where the
# camera shows the real task.
DEMO_LIVE = {part.strip() for part in os.getenv("OWL_DEMO_LIVE", "").split(",") if part.strip()}
# 1 = Record writes the draft straight from the narration, without the model.
MOCK_RECORD = os.getenv("OWL_MOCK_RECORD", "") == "1" or DEMO
API_TOKEN = os.getenv("API_TOKEN", "")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")

MAX_FRAME_BYTES = 6 * 1024 * 1024
MAX_DOC_BYTES = 10 * 1024 * 1024
MAX_CLIP_BYTES = 80 * 1024 * 1024
MAX_SIDE = 1024  # Frames are downscaled to this before they go to a model.
REFERENCE_SIDE = 600  # The Display glasses render at 600x600 (DAT docs).
Image.MAX_IMAGE_PIXELS = 40_000_000


def scripted(part: str) -> bool:
    """Demo mode scripts this part ("check", "recognize" or "place") unless OWL_DEMO_LIVE lists it."""
    return DEMO and part not in DEMO_LIVE


store = Store()
tracker = verifier.Tracker()
recognizer = jepa.Recognizer(store.data_dir / "jepa")
stage = stage_engine.Stage()
progress = progress_engine.Progress()
locations = location.Locations()  # JUN-97: in memory only, today only
places = place.Places()  # JUN-97: recognises a step's place in a camera picture
# JUN-78: state survives restarts. OWL_RESET=1 starts clean from the fixtures (rehearsals).
if os.getenv("OWL_RESET", "") != "1":
    persist.load(store, progress)
demo = demo_engine.Demo()
if DEMO:
    training.seed_demo(store, progress)  # JUN-96: Sami on the last day of their training week
    # JUN-100: Mika is the manager on shift at Kide Logistics, unless Studio set someone.
    if "emp-mika" in store.employees and store.employees["emp-mika"].company not in store.on_shift:
        store.on_shift[store.employees["emp-mika"].company] = "emp-mika"


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Help sessions live in memory, so frames left on disk by an earlier run belong to no one: delete them.
    store.clear_help_media()
    if jepa.JEPA_BACKEND != "baseline" and not scripted("recognize"):
        # The model takes a few seconds to load: load it now, not on the worker's first look.
        threading.Thread(target=jepa.embedder, name="jepa-warmup", daemon=True).start()
    yield


# /docs is the company-documents endpoint, so the Swagger UI moves to /swagger.
app = FastAPI(title="owl-api", docs_url="/swagger", redoc_url=None, lifespan=lifespan)


@app.middleware("http")
async def save_state(request: Request, call_next):
    """Saves the state after every change (JUN-78). Reads never write."""
    response = await call_next(request)
    if request.method in {"POST", "PUT", "DELETE"} and response.status_code < 500 and not request.url.path.startswith("/stage"):
        await run_in_threadpool(persist.save, store, progress)
    return response


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
        return {
            k: (
                base + v
                if k.endswith("_url") and isinstance(v, str) and v.startswith("/")
                else [base + u if isinstance(u, str) and u.startswith("/") else u for u in v]
                if k.endswith("_urls") and isinstance(v, list)
                else absolute(v, base)
            )
            for k, v in value.items()
        }
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


async def read_frame(image: UploadFile | None, clip: UploadFile | None, max_side: int = MAX_SIDE) -> bytes:
    """One camera frame from either a JPEG/PNG `image` or, when the phone could not decode the hvc1 stream, a short
    `clip` (MP4/MOV) whose last frame is used."""
    if (image is None) == (clip is None):
        raise HTTPException(status_code=422, detail="Send either image or clip.")
    if image is not None:
        return await read_image(image, max_side)
    data = await clip.read(MAX_FRAME_BYTES * 3 + 1)
    if not data or len(data) > MAX_FRAME_BYTES * 3:
        raise HTTPException(status_code=413, detail="The clip is empty or larger than 18 MB.")
    try:
        return to_jpeg(await run_in_threadpool(media_engine.last_frame, data), max_side)
    except media_engine.MediaError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


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
    return {"status": "ok", "model_id": MODEL_ID, "vision_model": vision.vision_model(), "step_recognition": jepa.backend_name()}


@app.get("/employees/{employee_id}", response_model=Employee, dependencies=[Auth])
def employee(employee_id: str, request: Request):
    found = store.employees.get(employee_id)
    if found is None:
        raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
    return out(request, found)


# Employees (list, add, edit) and the glasses they wear live in people.py.
app.include_router(people.router(lambda: store, Auth, out))
# Training period and target level (JUN-96).
app.include_router(training.router(lambda: store, lambda: progress, Auth))
# Location during training: zones, QR markers, checkpoints that unlock steps (JUN-97).
app.include_router(location.router(lambda: store, lambda: locations, Auth))
# The manager on shift (JUN-100).
app.include_router(shift.router(lambda: store, Auth))

LanguageQuery = Annotated[str, Query(max_length=10)]


@app.get("/processes", dependencies=[Auth])
def processes(request: Request, language: LanguageQuery = "") -> dict:
    return {"processes": [out(request, store.translated(p, language)) for p in store.processes.values()]}


@app.get("/processes/{process_id}", response_model=Process, dependencies=[Auth])
def process(process_id: str, request: Request, language: LanguageQuery = ""):
    return out(request, store.translated(get_process(process_id), language))


def wording(process: Process) -> dict:
    """Everything in a process that a translation repeats in its own language."""
    return process.model_dump(include={"title": True, "summary": True, "steps": {"__all__": {"id", "title", "instruction", "say", "check", "source"}}})


@app.put("/processes/{process_id}", response_model=Process, dependencies=[Auth])
def update_process(process_id: str, body: Process, request: Request, language: LanguageQuery = ""):
    original = get_process(process_id)
    if body.id != process_id:
        raise HTTPException(status_code=422, detail="The body's id must match the URL.")
    step_ids = [step.id for step in body.steps]
    if len(set(step_ids)) != len(step_ids):
        raise HTTPException(status_code=422, detail="Two steps have the same id.")
    base = base_url(request)
    data = body.model_dump()
    # Owl Studio reorders and deletes steps: the order of the array is the order of the work.
    for index, step in enumerate(data["steps"], start=1):
        step["index"] = index
        # Owl Studio sends back the absolute URLs it got; store paths again.
        for key in ("reference_image_url", "clip_url"):
            if step[key] and step[key].startswith(base + "/media/"):
                step[key] = step[key][len(base) :]
        if step.get("checkpoint"):
            step["checkpoint"]["photo_urls"] = [u[len(base) :] if u.startswith(base + "/media/") else u for u in step["checkpoint"]["photo_urls"]]
    updated = Process.model_validate(data)
    waiting = [step.index for step in updated.steps if not step.reviewed]
    if updated.status == "published" and waiting:
        # A recording is written into steps by Owl. Nobody learns from them before a person has read every one.
        raise HTTPException(status_code=422, detail=f"Review every step before publishing. Not reviewed yet: step {', '.join(map(str, waiting))}.")
    if language and lang_key(language) != lang_key(original.language):
        # ?language=sv: the body is this process in another language, kept beside the original, which does not change.
        if step_ids != [step.id for step in original.steps]:
            raise HTTPException(status_code=422, detail="A translation must keep the steps of the original, in the same order.")
        store.translations[(process_id, lang_key(language))] = updated.model_copy(update={"language": language})
        return out(request, store.translated(original, language))
    # Without ?language= the body is the process itself. Its language can be corrected too (a recording's is a guess).
    if wording(updated) != wording(original) or lang_key(updated.language) != lang_key(original.language):
        store.drop_translations(process_id)  # they would say what the process used to say
    store.processes[process_id] = updated
    return out(request, updated)


@app.post("/processes/{process_id}/translate", response_model=Process, dependencies=[Auth])
async def translate_process(process_id: str, body: TranslateRequest, request: Request):
    """Owl writes and stores the process in the worker's language (JUN-72). Needs the model."""
    original = get_process(process_id)
    if lang_key(body.language) == lang_key(original.language):
        return out(request, original)
    if DEMO or MOCK_RECORD:
        raise HTTPException(status_code=503, detail="Translation needs the model.")
    try:
        translated = await call_model(lambda: translate_engine.translate(original, body.language))
    except translate_engine.TranslationError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    store.translations[(process_id, lang_key(body.language))] = translated
    return out(request, store.translated(original, body.language))


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
    except TypeError as e:
        # The SDK raises a plain TypeError when no API key or credentials are set (JUN-68 turns the models on).
        if "authentication" not in str(e):
            raise
        raise HTTPException(status_code=503, detail="The model is not set up on this server yet.") from e


@app.post("/check", response_model=CheckResult, dependencies=[Auth])
async def check(
    request: Request,
    process_id: Annotated[str, Form()],
    step_id: Annotated[str, Form()],
    run_id: Annotated[str, Form(min_length=1, max_length=64)],
    image: Annotated[UploadFile | None, File()] = None,
    # Instead of image: a ~1 s hvc1/H.264 MP4 from the stream; its last frame is used. See the contract.
    clip: Annotated[UploadFile | None, File()] = None,
    final: Annotated[bool, Form()] = False,
    language: Annotated[str, Form(max_length=10)] = "",
    # The worker, for their own learning progress (JUN-73). Optional.
    employee_id: Annotated[str, Form(max_length=80)] = "",
    # ok | warning | unsure | checking: a fixture answer instead of the model, for UI work. Also OWL_MOCK_CHECK=1.
    mock: Annotated[str, Form()] = "",
):
    process = get_process(process_id)
    step = get_step(process, step_id)
    worker = store.employees.get(employee_id) if employee_id else None
    if worker is not None and not store.consents.get(worker.id, {}).get("camera_checks"):
        # JUN-80: no frame is looked at before the worker has agreed on the glasses.
        raise HTTPException(status_code=403, detail="consent_required")
    frame = await read_frame(image, clip)
    if mock or MOCK_CHECK:
        result = with_pace(step, mock_check(step, final, mock))
        record_check(run_id, employee_id, process, step, result)
        stage_check(worker, step, result)
        return out(request, result)
    language = language or (worker.language if worker else None) or next((e.language for e in store.employees.values() if process_id in e.process_ids), "en")
    if worker is not None and worker.access.easy_language:
        language = verifier.easy(language)
    if not tracker.allow(run_id):
        # JUN-82: a per-run budget of model calls; a burst of frames is answered without a call.
        return out(
            request,
            CheckResult(status="checking", text="Checking...", confidence=None, decided_by="demo" if scripted("check") else "rules", next_check_ms=2000),
        )
    if not tracker.try_begin(run_id):
        # One check per run at a time: a frame that arrives while the last one is checked is answered at once.
        return out(
            request, CheckResult(status="checking", text="Checking...", confidence=None, decided_by="demo" if scripted("check") else "rules", next_check_ms=800)
        )
    try:
        if scripted("check"):
            result = verifier.run_check(
                step, frame, None, run_id, final, language, tracker,
                observe=lambda _f, s, _r, _l: demo.observe(process_id, s, run_id), jev=lambda *_: None, decided_by="demo",
            )  # fmt: skip
        else:
            reference = reference_image(step)
            result = await call_model(lambda: verifier.run_check(step, frame, reference, run_id, final, language, tracker, observe=vision.observe))
    finally:
        tracker.end(run_id)
    result = with_pace(step, result)
    record_check(run_id, employee_id, process, step, result)
    stage_check(worker, step, result)
    return out(request, result)


def record_check(run_id: str, employee_id: str, process: Process, step: Step, result: CheckResult) -> None:
    progress.record(run_id, employee_id, process, step, result)
    if result.step_done and employee_id:
        locations.step_done(employee_id, process.id, step.id)  # JUN-97: the next run asks for the spot again


def stage_check(worker: Employee | None, step: Step, result: CheckResult) -> None:
    """Owl's decision on the stage timeline (JUN-79), when the worker wears a pair of glasses."""
    if worker is None or not worker.glasses_id:
        return
    stage.event(
        worker.glasses_id, "check", employee_id=worker.id, status=result.status, problem=result.problem, text=result.say or result.text,
        decided_by=result.decided_by, step=step.index, step_done=result.step_done, spoken=bool(result.say),
    )  # fmt: skip


def with_pace(step: Step, result: CheckResult) -> CheckResult:
    """JUN-82: look again soon while a problem is being confirmed or fixed, rarely when all is well, never when done."""
    if result.step_done or step.check.kind == "none":
        ms = None
    else:
        ms = {"checking": 800, "warning": 1500, "unsure": 1500}.get(result.status, 3000)
    return result.model_copy(update={"next_check_ms": ms})


# Step recognition (JUN-34): which step is the worker doing? V-JEPA 2 (or the baseline) against the expert's clips.


@app.post("/steps/recognize", dependencies=[Auth])
async def recognize_step(
    clip: Annotated[UploadFile, File()],
    process_id: Annotated[str, Form()],
    employee_id: Annotated[str, Form(max_length=80)] = "",
    # The run: the last few clips of the same run are looked at together (a longer look than one 2 s clip).
    run_id: Annotated[str, Form(max_length=64)] = "",
) -> dict:
    process = get_process(process_id)
    worker = store.employees.get(employee_id) if employee_id else None
    if worker is not None and not store.consents.get(worker.id, {}).get("camera_checks"):
        raise HTTPException(status_code=403, detail="consent_required")
    data = await clip.read(MAX_FRAME_BYTES * 3 + 1)
    if not data or len(data) > MAX_FRAME_BYTES * 3:
        raise HTTPException(status_code=413, detail="The clip is empty or larger than 18 MB.")
    if scripted("recognize"):
        # Demo mode: the mock camera shows the same picture in every step, so the story says where the worker is:
        # the first step not yet done in their run. Honest about it: backend "demo".
        step_id = progress.next_step(worker.id, process) if worker else None
        return {"status": "ok" if step_id else "unsure", "step_id": step_id, "similarities": {}, "margin": 0.0, "backend": "demo"}
    clips = {}
    for step in process.steps:
        url = step.clip_url or ""
        path = store.media_path(url.removeprefix("/media/")) if url.startswith("/media/") else None
        if path:
            clips[step.id] = path
    try:
        result = await run_in_threadpool(lambda: recognizer.recognize(process, clips, data, run_id=run_id or None))
    except jepa.ClipError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return result.to_dict()


class StepConfirm(BaseModel):
    run_id: str = Field(min_length=1, max_length=64)
    process_id: str
    step_id: str


@app.post("/steps/confirm", status_code=204, dependencies=[Auth])
async def confirm_step(body: StepConfirm) -> Response:
    """The worker confirmed "Looks like step N" with a pinch: Owl learns that look as an example of the step (JUN-34)."""
    get_step(get_process(body.process_id), body.step_id)
    if not scripted("recognize"):
        await run_in_threadpool(recognizer.confirm, body.run_id, body.process_id, body.step_id)
    return Response(status_code=204)


# Consent (JUN-80): what the worker agreed to on the glasses. Without camera_checks, /check answers 403.


@app.get("/employees/{employee_id}/consent", response_model=Consent, dependencies=[Auth])
def get_consent(employee_id: str):
    if employee_id not in store.employees:
        raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
    return Consent(**store.consents.get(employee_id, {}))


@app.post("/employees/{employee_id}/consent", response_model=Consent, dependencies=[Auth])
def set_consent(employee_id: str, body: Consent):
    if employee_id not in store.employees:
        raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
    consent = body.model_copy(update={"at": now_iso()})
    with store.lock:
        store.consents[employee_id] = consent.model_dump()
    if not consent.location:
        locations.forget(employee_id)
    return consent


@app.delete("/employees/{employee_id}/consent", status_code=204, dependencies=[Auth])
def reset_consent(employee_id: str) -> Response:
    """Back to "not asked yet" (at null), so the glasses ask again. For a new worker on used glasses, and rehearsals."""
    if employee_id not in store.employees:
        raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
    with store.lock:
        store.consents.pop(employee_id, None)
    locations.forget(employee_id)
    return Response(status_code=204)


@app.delete("/employees/{employee_id}/progress", status_code=204, dependencies=[Auth])
def forget_progress(employee_id: str) -> Response:
    """ "Forget me": the worker erases their own learning data."""
    if employee_id not in store.employees:
        raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
    progress.forget(employee_id)
    locations.forget(employee_id)
    with store.lock:
        if employee_id in store.trainings:  # the evidence is gone, so is the result built on it
            store.trainings[employee_id].update(seen_at=None, confirmed=None)
    return Response(status_code=204)


# Learning progress (JUN-73): the worker's own, and anonymous totals. Never one person's results in Studio.


@app.get("/employees/{employee_id}/progress", dependencies=[Auth])
def employee_progress(employee_id: str) -> dict:
    if employee_id not in store.employees:
        raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
    return progress.for_employee(employee_id)


@app.get("/stats", dependencies=[Auth])
def stats() -> dict:
    return progress.stats()


# Ask


@app.post("/ask", response_model=Answer, dependencies=[Auth])
async def ask(body: AskRequest, request: Request):
    employee = store.employees.get(body.employee_id or "")
    if employee is not None:
        progress.helped(employee.id, body.process_id or "", body.step_id or "")  # JUN-96: not "without help"
    if MOCK_ASK:
        return out(request, Answer.model_validate(load_fixture("answer.json")))
    language = body.language or (employee.language if employee else "en")
    if employee is not None and employee.access.easy_language:
        language = verifier.easy(language)
    if DEMO:
        return out(
            request,
            stage_answer(employee, body.question, ask_engine.demo_answer(body.question, store.docs_for(employee), language)),
        )
    context = None
    if body.process_id in store.processes:
        process = store.processes[body.process_id]
        step = next((s for s in process.steps if s.id == body.step_id), None)
        context = f"{process.title}" + (f", step {step.index}: {step.title}" if step else "")
    docs = store.docs_for(employee)
    return out(request, stage_answer(employee, body.question, await call_model(lambda: ask_engine.answer(body.question, docs, language, context))))


def stage_answer(employee: Employee | None, question: str, answer: Answer) -> Answer:
    """The question and Owl's answer on the stage timeline (JUN-79)."""
    if employee is not None and employee.glasses_id:
        source = (
            f"{answer.sources[0].doc} · {answer.sources[0].section}"
            if answer.sources and answer.sources[0].section
            else (answer.sources[0].doc if answer.sources else "")
        )
        stage.event(employee.glasses_id, "ask", employee_id=employee.id, question=question, answer=answer.text, source=source)
    return answer


# Place recognition (JUN-97): a locked step opens when Owl recognises its place in the camera picture.


@app.post("/location/frame", dependencies=[Auth])
async def location_frame(
    employee_id: Annotated[str, Form(min_length=1, max_length=80)],
    process_id: Annotated[str, Form()],
    step_id: Annotated[str, Form()],
    image: Annotated[UploadFile | None, File()] = None,
    clip: Annotated[UploadFile | None, File()] = None,
) -> dict:
    """One look from the glasses while a step is locked. The picture is compared and dropped, never stored."""
    worker = store.employees.get(employee_id)
    if worker is None:
        raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
    if not store.consents.get(worker.id, {}).get("location"):
        raise HTTPException(status_code=403, detail="consent_required")
    if not training.in_training(store, worker.id):
        raise HTTPException(status_code=409, detail="not_in_training")
    process = get_process(process_id)
    step = get_step(process, step_id)
    if step.checkpoint is None:
        raise HTTPException(status_code=404, detail=f"Step {step_id} has no place.")
    frame = await read_frame(image, clip, REFERENCE_SIDE)
    target = place.target_key(process_id, step_id)
    if scripted("place"):
        # The camera's eyes are scripted in demo mode: every look is at the place, so the second one opens the step.
        look = place.Look(matched=True, score=1.0, best=target, backend="demo")
        reached, can = places.count(worker.id, target, True, time.monotonic()), True
    else:
        gallery = await run_in_threadpool(places.gallery, place.worker_processes(store.processes, worker) or [process], store.media_path)
        can = target in gallery
        look, reached = await run_in_threadpool(places.look, worker.id, target, frame, gallery)
    if reached:
        locations.enter(worker.id, step.checkpoint.zone_id)
        locations.unlock(worker.id, process_id, step_id)
    answer = location.view(store, locations, worker.id)
    decided_by = {"demo": "demo", "baseline": "baseline"}.get(look.backend, "model")
    answer["match"] = (
        {"zone_id": step.checkpoint.zone_id, "process_id": process_id, "step_id": step_id, "score": look.score, "decided_by": decided_by}
        if look.matched
        else None
    )
    answer["can_recognize"] = can
    answer["next_check_ms"] = 2000
    return answer


@app.post("/processes/{process_id}/steps/{step_id}/place-photos", response_model=Process, dependencies=[Auth])
async def add_place_photo(process_id: str, step_id: str, request: Request, image: Annotated[UploadFile, File()]):
    """Studio adds a picture of a step's place, so Owl recognises it from more angles. Faces are blurred first."""
    process = get_process(process_id)
    step = get_step(process, step_id)
    if step.checkpoint is None:
        raise HTTPException(status_code=422, detail="Give the step a place first.")
    if len(step.checkpoint.photo_urls) >= 8:
        raise HTTPException(status_code=422, detail="A place has at most 8 photos. Remove one first.")
    try:
        photo = await run_in_threadpool(media_engine.blur_faces, await read_image(image, REFERENCE_SIDE))
    except media_engine.MediaError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    folder = f"places/{process_id}-{secrets.token_urlsafe(9)}"
    url = store.save_media(f"{folder}/{step_id}-{len(step.checkpoint.photo_urls) + 1}.jpg", photo)
    with store.lock:
        step.checkpoint.photo_urls.append(url)
    return out(request, process)


# Customer service mode (JUN-98). The transcript is used for one answer: never stored, logged or staged.


@app.post("/assist", response_model=AssistAnswer, dependencies=[Auth])
async def assist(body: AssistRequest):
    employee = store.employees.get(body.employee_id)
    if employee is None:
        raise HTTPException(status_code=404, detail=f"No employee {body.employee_id}.")
    if not training.in_training(store, employee.id):
        raise HTTPException(status_code=409, detail="not_in_training")
    if not training.customer_service(store, employee.id):
        raise HTTPException(status_code=403, detail="not_customer_service")
    language = body.language or employee.language
    docs = store.docs_for(employee)
    if DEMO or MOCK_ASSIST:
        return assist_engine.local_answer(body.transcript, docs, language)
    return await call_model(lambda: assist_engine.answer(body.transcript, docs, language))


@app.get("/assist/sign", response_model=AssistSign, dependencies=[Auth])
def assist_sign():
    return AssistSign(text=store.assist_sign)


@app.put("/assist/sign", response_model=AssistSign, dependencies=[Auth])
def set_assist_sign(body: AssistSign):
    with store.lock:
        store.assist_sign = body.text.strip()
    return AssistSign(text=store.assist_sign)


@app.post("/processes/from-docs", response_model=Process, dependencies=[Auth])
async def process_from_docs(body: FromDocs, request: Request):
    """A draft guided process from one company document (JUN-70). A person reviews and publishes it in Owl Studio."""
    entry = store.docs.get(body.doc_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"No document {body.doc_id}.")
    doc, text = entry
    process_id = store.next_id("proc-doc")
    use_model = not (DEMO or MOCK_RECORD)
    try:
        process = await run_in_threadpool(docs_engine.from_doc, process_id, doc.title, text, body.title, store.company(), use_model)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    store.processes[process_id] = process
    return out(request, process)


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


@app.delete("/docs/{doc_id}", status_code=204, dependencies=[Auth])
def delete_doc(doc_id: str) -> Response:
    """The company takes a document back: Ask stops using it at once, and the uploaded file is deleted."""
    if not store.remove_doc(doc_id):
        raise HTTPException(status_code=404, detail=f"No document {doc_id}.")
    return Response(status_code=204)


# Record


# The glasses name each step upload (a UUID), so a given-up upload can be taken back.
STEP_KEY = r"^[A-Za-z0-9-]{0,64}$"
MAX_DROPPED_STEPS = 200


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
    photo: Annotated[UploadFile, File()],
    # Empty when the expert said nothing or the glasses heard nothing: the step is still kept, with its photo
    # and clip, and the reviewer writes the words in Owl Studio.
    narration: Annotated[str, Form(max_length=4000)] = "",
    clip: Annotated[UploadFile | None, File()] = None,
    # The glasses' own name for this upload. With it they can take the step back when the expert gives the upload up.
    key: Annotated[str, Form(pattern=STEP_KEY)] = "",
):
    rec = get_recording(record_id)
    if rec.status != "recording":
        raise HTTPException(status_code=409, detail="This recording is already finished.")
    photo_jpeg = await read_image(photo, REFERENCE_SIDE)
    clip_data = None
    if clip is not None and clip.filename:
        clip_data = await clip.read(MAX_CLIP_BYTES + 1)
        if not clip_data or len(clip_data) > MAX_CLIP_BYTES:
            raise HTTPException(status_code=413, detail="The clip is empty or larger than 80 MB.")
    # Faces are blurred before anything is stored; the clip becomes a display-sized H.264 MP4 (DAT VideoPlayer limits).
    try:
        photo_jpeg = await run_in_threadpool(media_engine.blur_faces, photo_jpeg)
        clip_mp4 = await run_in_threadpool(media_engine.transcode_clip, clip_data) if clip_data else None
    except media_engine.MediaError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    with store.lock:
        if key and key in rec.dropped:
            # The expert gave this upload up while it was on its way: nothing of it is kept.
            return out(request, rec)
        if rec.media_dir is None:
            rec.media_dir = f"{rec.id}-{secrets.token_urlsafe(9)}"
        # A file name no step of this recording has had, also after a step was taken back.
        number = len(rec.steps) + len(rec.dropped) + 1
        photo_url = store.save_media(f"{rec.media_dir}/{number}.jpg", photo_jpeg)
        clip_url = store.save_media(f"{rec.media_dir}/{number}.mp4", clip_mp4) if clip_mp4 else None
        rec.steps.append(RecordedStep(index=len(rec.steps) + 1, narration=narration.strip(), photo_url=photo_url, clip_url=clip_url, key=key or None))
    return out(request, rec)


@app.delete("/record/{record_id}/steps/{key}", response_model=Recording, dependencies=[Auth])
def record_drop_step(record_id: str, key: Annotated[str, PathParam(pattern=STEP_KEY, min_length=1)], request: Request):
    """The expert gave up a step upload: the step is removed if it arrived, and ignored if it arrives later.

    A slow upload can be cancelled on the glasses while owl-api is still storing it. Without this the step would
    be in the task although the glasses said it was not saved.
    """
    rec = get_recording(record_id)
    with store.lock:
        if rec.status != "recording":
            raise HTTPException(status_code=409, detail="This recording is already finished.")
        if key not in rec.dropped and len(rec.dropped) < MAX_DROPPED_STEPS:
            rec.dropped.append(key)
        for step in [s for s in rec.steps if s.key == key]:
            rec.steps.remove(step)
            store.remove_media(step.photo_url)
            store.remove_media(step.clip_url)
        for number, step in enumerate(rec.steps, start=1):
            step.index = number
    return out(request, rec)


def finish_recording(rec: Recording, process_id: str) -> None:
    """Writes the draft process for a recording. Runs after /finish has answered."""
    try:
        photos = []
        for step in rec.steps:
            path = store.media_path(step.photo_url.removeprefix("/media/")) if step.photo_url else None
            photos.append(path.read_bytes() if path else None)
        company = store.company()
        process = record_engine.write_process(process_id, rec, photos, company, use_model=not MOCK_RECORD)
        # Each recorded step also gets the handbook rule that backs it, when one matches (JUN-70).
        store.processes[process_id] = docs_engine.attach_rules(process, [(doc.title, text) for doc, text in store.docs.values()])
        rec.process_id, rec.status = process_id, "done"
        persist.save(store, progress)
    except Exception:
        log.exception("Record: could not write the process for %s", rec.id)
        rec.status = "failed"


@app.post("/record/{record_id}/finish", response_model=Recording, dependencies=[Auth])
def record_finish(record_id: str, request: Request, background: BackgroundTasks):
    rec = get_recording(record_id)
    with store.lock:
        if rec.status != "recording":
            raise HTTPException(status_code=409, detail="This recording is already finished.")
        if not rec.steps:
            raise HTTPException(status_code=409, detail="Record at least one step first.")
        rec.status = "processing"
    # Poll GET /record/{id} until the status is done (process_id is set) or failed.
    background.add_task(finish_recording, rec, f"proc-{rec.id}")
    return out(request, rec)


@app.get("/record", dependencies=[Auth])
def record_list(request: Request) -> dict:
    """Every recording, newest first, so Owl Studio can show "Owl is writing the steps"."""
    recordings = sorted(store.recordings.values(), key=lambda r: int(r.id.rsplit("-", 1)[-1]), reverse=True)
    return {"recordings": [out(request, r) for r in recordings]}


@app.get("/record/{record_id}", response_model=Recording, dependencies=[Auth])
def record_get(record_id: str, request: Request):
    return out(request, get_recording(record_id))


# Help


def get_help(help_id: str) -> HelpSession:
    session = store.help.get(help_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"No help session {help_id}.")
    return shift.settle(session)


@app.post("/help/frames", response_model=HelpSession, dependencies=[Auth])
async def help_frame(
    request: Request,
    image: Annotated[UploadFile | None, File()] = None,
    # Instead of image: a ~1 s hvc1/H.264 MP4 from the stream; its last frame is used. See the contract.
    clip: Annotated[UploadFile | None, File()] = None,
    employee_id: Annotated[str, Form()] = "",
    process_id: Annotated[str, Form()] = "",
    step_id: Annotated[str, Form()] = "",
    help_id: Annotated[str, Form()] = "",
    # JUN-100: "manager" calls the manager on shift on their own glasses; "studio" (the default) the console.
    to: Annotated[Literal["manager", "studio"], Form()] = "studio",
):
    frame = await read_frame(image, clip, REFERENCE_SIDE)
    if help_id:
        session = get_help(help_id)
        if session.status == "ended":
            raise HTTPException(status_code=409, detail="This help session has ended.")
    else:
        session = HelpSession(id=store.next_id("help"), status="waiting", updated_at=now_iso())
        if to == "manager":
            manager = shift.manager_for(store, store.employees.get(employee_id))
            if manager is not None:
                shift.ring(session, manager)
            else:
                session.fallback = "no_manager"
        store.help[session.id] = session
    # The frame is the worker's live view and /media needs no token, so its folder name cannot be guessed.
    session.latest_frame_url = store.save_media(f"{store.help_dir(session.id)}/latest.jpg", frame) + f"?t={secrets.token_hex(4)}"
    session.employee_id = employee_id or session.employee_id
    session.process_id = process_id or session.process_id
    session.step_id = step_id or session.step_id
    session.frame_at = session.updated_at = now_iso()
    progress.helped(session.employee_id or "", session.process_id or "", session.step_id or "")  # JUN-96
    return out(request, session)


@app.get("/help", dependencies=[Auth])
def help_list(request: Request) -> dict:
    newest_first = sorted((shift.settle(s) for s in store.help.values()), key=lambda s: s.updated_at, reverse=True)
    sessions = sorted(newest_first, key=lambda s: s.status == "ended")
    return {"sessions": [out(request, s) for s in sessions]}


@app.get("/help/incoming", dependencies=[Auth])
def help_incoming(employee_id: str, request: Request) -> dict:
    """The shift manager's glasses: calls ringing for them and the one they are on, newest first (JUN-100)."""
    if employee_id not in store.employees:
        raise HTTPException(status_code=404, detail=f"No employee {employee_id}.")
    mine = [shift.settle(s) for s in store.help.values() if s.assignee == employee_id]
    mine = sorted((s for s in mine if s.status in {"ringing", "accepted"} and s.assignee == employee_id), key=lambda s: s.updated_at, reverse=True)
    rows = []
    for session in mine:
        worker = store.employees.get(session.employee_id or "")
        process = store.processes.get(session.process_id or "")
        shown = store.translated(process, store.employees[employee_id].language) if process else None
        step = next((x for x in shown.steps if x.id == session.step_id), None) if shown else None
        rows.append(
            out(request, session)
            | {
                "employee_name": worker.name if worker else None,
                "process_title": shown.title if shown else None,
                "step_index": step.index if step else None,
                "step_title": step.title if step else None,
            }
        )
    return {"sessions": rows}


def manager_session(help_id: str, employee_id: str) -> HelpSession:
    session = get_help(help_id)
    if session.assignee != employee_id:
        raise HTTPException(status_code=409, detail="This call is not for you, or it has gone to Studio.")
    return session


@app.post("/help/{help_id}/accept", response_model=HelpSession, dependencies=[Auth])
def help_accept(help_id: str, body: HelpAnswer, request: Request):
    session = manager_session(help_id, body.employee_id)
    if session.status != "ringing":
        raise HTTPException(status_code=409, detail="This call is no longer ringing.")
    session.status, session.updated_at = "accepted", now_iso()
    return out(request, session)


@app.post("/help/{help_id}/later", response_model=HelpSession, dependencies=[Auth])
def help_later(help_id: str, body: HelpAnswer, request: Request):
    """The manager cannot take it now: the request goes to the Studio console."""
    session = manager_session(help_id, body.employee_id)
    if session.status != "ringing":
        raise HTTPException(status_code=409, detail="This call is no longer ringing.")
    shift.to_studio(session, "later")
    return out(request, session)


@app.get("/help/{help_id}", response_model=HelpSession, dependencies=[Auth])
def help_get(help_id: str, request: Request):
    return out(request, get_help(help_id))


MARK_COLOR = (255, 214, 10)  # bright on the additive glasses display and on a monitor


def draw_mark(frame: bytes, mark: Mark) -> bytes:
    """The frame with a ring where the expert pointed: bright, with a dark edge so it shows on any background."""
    with Image.open(io.BytesIO(frame)) as img:
        img = img.convert("RGB")
        short = min(img.size)
        radius, width = max(12, round(short * 0.09)), max(4, round(short * 0.016))
        cx, cy = mark.x * img.width, mark.y * img.height
        draw = ImageDraw.Draw(img)
        edge = max(2, width // 2)
        draw.ellipse((cx - radius - edge, cy - radius - edge, cx + radius + edge, cy + radius + edge), outline=(0, 0, 0), width=width + 2 * edge)
        draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), outline=MARK_COLOR, width=width)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue()


def marked_frame(session: HelpSession, message_id: int, mark: Mark) -> str | None:
    """Saves the latest frame with the expert's mark and returns its /media path, or None when there is no frame."""
    folder = store.help_dir(session.id)
    latest = store.media_path(f"{folder}/latest.jpg")
    if latest is None:
        return None
    return store.save_media(f"{folder}/mark-{message_id}.jpg", draw_mark(latest.read_bytes(), mark))


@app.post("/help/{help_id}/say", response_model=HelpSession, dependencies=[Auth])
def help_say(help_id: str, body: SayRequest, request: Request):
    session = get_help(help_id)
    if session.status == "ended":
        raise HTTPException(status_code=409, detail="This help session has ended.")
    with store.lock:
        message = HelpMessage(id=len(session.messages) + 1, from_=body.from_, text=body.text.strip(), at=now_iso())
        if body.from_ == "expert" and body.mark:
            # The expert can point: the glasses show the worker's own view with a ring around the spot.
            message.image_url = marked_frame(session, message.id, body.mark)
        session.messages.append(message)
    if body.from_ == "expert" and session.status == "waiting":
        session.status = "connected"
    session.updated_at = message.at
    return out(request, session)


@app.post("/help/{help_id}/end", response_model=HelpSession, dependencies=[Auth])
def help_end(help_id: str, request: Request):
    session = get_help(help_id)
    session.status, session.updated_at = "ended", now_iso()
    # Help frames are kept only while the session is open.
    store.remove_help_media(session.id)
    session.latest_frame_url = None
    for message in session.messages:
        message.image_url = None
    return out(request, session)


# Stage view (JUN-79): the audience sees what the worker sees. In memory only; nothing is stored.


def check_token_or_query(x_api_token: Annotated[str, Header()] = "", token: Annotated[str, Query()] = "") -> None:
    """The stage page runs in a browser: EventSource and <img> cannot send headers, so ?token= works too."""
    given = x_api_token or token
    if API_TOKEN and not secrets.compare_digest(given.encode(), API_TOKEN.encode()):
        raise HTTPException(status_code=401, detail="Missing or wrong API token.")


StageAuth = Depends(check_token_or_query)


def stage_employee(employee_id: str | None) -> dict | None:
    e = store.employees.get(employee_id or "")
    if e is None:
        return None
    consent = bool(store.consents.get(e.id, {}).get("camera_checks"))
    return {"name": e.name, "role": e.role, "language": e.language, "access": e.access.model_dump(), "consent": consent}


@app.post("/stage", status_code=204, dependencies=[Auth])
def stage_update(body: stage_engine.StageUpdate) -> Response:
    stage.update(body, stage_employee(body.employee_id))
    return Response(status_code=204)


@app.post("/stage/frame", status_code=204, dependencies=[Auth])
async def stage_frame(image: Annotated[UploadFile, File()], glasses_id: Annotated[str, Form(min_length=1, max_length=40)]) -> Response:
    stage.frame(glasses_id, await read_image(image, 640))
    return Response(status_code=204)


@app.get("/stage", include_in_schema=False)
def stage_page() -> FileResponse:
    return FileResponse(Path(__file__).parent / "static" / "stage.html", media_type="text/html")


@app.get("/stage/frame", dependencies=[StageAuth])
def stage_latest_frame(glasses: str = "") -> Response:
    snap = stage.snapshot(glasses or None)
    frame = stage.latest_frame(snap["glasses"]["glasses_id"]) if snap["glasses"] else None
    if frame is None:
        raise HTTPException(status_code=404, detail="No live frame.")
    return Response(frame, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


def stage_state(glasses: str) -> dict:
    snap = stage.snapshot(glasses or None)
    if snap["glasses"]:
        snap["glasses"]["employee"] = stage_employee(snap["glasses"].get("employee_id")) or snap["glasses"].get("employee")
    return snap


@app.get("/stage/state", dependencies=[StageAuth])
def stage_state_json(glasses: str = "") -> dict:
    return stage_state(glasses)


@app.get("/stage/events", dependencies=[StageAuth])
async def stage_events(request: Request, glasses: str = "") -> StreamingResponse:
    async def stream():
        seen, idle = -1, 0.0
        while not await request.is_disconnected():
            if stage.version != seen:
                state = stage_state(glasses)
                seen = state["version"]
                yield f"data: {json.dumps(state, ensure_ascii=False)}\n\n"
                idle = 0.0
            elif idle >= 15:
                yield ": keep-alive\n\n"
                idle = 0.0
            await asyncio.sleep(0.3)
            idle += 0.3

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


# Media


# HEAD and Range requests too: video players use them.
@app.api_route("/media/{path:path}", methods=["GET", "HEAD"])
def media(path: str) -> FileResponse:
    found = store.media_path(path)
    if found is None:
        raise HTTPException(status_code=404, detail="No such media file.")
    return FileResponse(found)
