"""Owl Check vision (JUN-30): what the glasses camera sees during a step, as structured data.

The model only reports what it sees. Deciding whether the step is right is app/verifier.py.

Two backends behind `observe`, chosen with VISION_BACKEND:

- claude (default): Anthropic's API, MODEL_ID.
- nemotron: NVIDIA Nemotron 3.5 Super VL, open weights, served by vLLM on a Verda GPU in Finland (OpenAI-compatible
  API, VERDA_INFERENCE_KEY). The same prompt and the same Observation schema, enforced by vLLM's structured output, with
  thinking off: a check takes about 0.6-1.6 s. When it fails and an Anthropic key is set, Claude answers instead.
"""

import base64
import logging
import os
import time
from typing import Literal

import anthropic
import httpx
from pydantic import BaseModel, Field, ValidationError

from .models import Step

log = logging.getLogger("owl.vision")

MODEL_ID = os.getenv("MODEL_ID", "claude-opus-5-5")
# Low effort keeps a check under the 4 s target; raise it if observations get sloppy.
VISION_EFFORT = os.getenv("VISION_EFFORT", "low")
VISION_BACKEND = os.getenv("VISION_BACKEND", "claude")
NEMOTRON_URL = os.getenv("NEMOTRON_URL", "https://containers.datacrunch.io/nemotron-3-5-super-vl-b300/v1")
NEMOTRON_MODEL = os.getenv("NEMOTRON_MODEL", "nemotron-3.5-super-vl")
NEMOTRON_TIMEOUT_S = float(os.getenv("NEMOTRON_TIMEOUT_S", "8"))
OTHER = "other"

SYSTEM_PROMPT = """You are the eyes of Owl, a training assistant on smart glasses. A new worker is doing one step of a \
work task, and you get one frame from the camera on their glasses (their own point of view).

Report only what is visible in the frame. Never guess, and never judge whether the work is right: other code does that.

- visibility: "clear" when the work area of this step is in view and sharp enough to read sizes and count items; \
"partial" when part of it is cut off, covered by a hand or blurry; "unclear" when you cannot see the work area at all.
- hint: when visibility is not "clear", one short instruction that would fix the view, for example "Move closer to the \
box" or "Hold the box still". Otherwise null.
- items (order steps only, otherwise empty): every product inside the box or tray of this step. Group identical products \
into one entry with their count. Set line to the id of the order line that this exact product is (same product, same \
size or variant), or "other" when it is not exactly any order line, for example a different size. Read sizes such as \
0.5 l or 1 l from the package when you can; if the size cannot be read, say so in description.
- criteria (visual steps only, otherwise empty): one entry per numbered criterion of the step, in order, with its \
number as index and its text copied exactly: "yes", "no" or "unclear", with a short note. Answer "yes" only when the \
frame itself shows it.
- matches_reference: compare the frame with the expert's reference photo when one is given: "yes", "no", "unclear", or \
"no_reference". The photo is for context only; the criteria decide.
- summary: one short sentence about what you see."""


class SeenItem(BaseModel):
    line: str = Field(description='The order line id this product exactly is, or "other"')
    description: str = Field(description='What the product is, with size or variant, e.g. "Oat drink 0.5 l"')
    qty: int = Field(ge=0)


class CriterionSeen(BaseModel):
    index: int = Field(default=0, description="The criterion's number in the step's list, starting at 1")
    criterion: str
    met: Literal["yes", "no", "unclear"]
    note: str


class Observation(BaseModel):
    visibility: Literal["clear", "partial", "unclear"]
    hint: str | None
    items: list[SeenItem]
    criteria: list[CriterionSeen]
    matches_reference: Literal["yes", "no", "unclear", "no_reference"]
    summary: str


class VisionError(Exception):
    """The model could not produce a usable observation."""


_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def line_id(index: int, sku: str | None) -> str:
    return sku or f"line-{index + 1}"


def _image(data: bytes) -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(data).decode()}}


def _step_text(step: Step) -> str:
    lines = [f"Step {step.index}: {step.title}", f"Instruction: {step.instruction}", f"Check kind: {step.check.kind}"]
    if step.check.kind == "order":
        lines.append("Order lines (id: product × quantity):")
        lines += [f"- {line_id(i, ol.sku)}: {ol.name} × {ol.qty}" for i, ol in enumerate(step.check.order_lines or [])]
    if step.check.criteria:
        lines.append("Criteria:")
        lines += [f"{n}. {c}" for n, c in enumerate(step.check.criteria, start=1)]
    return "\n".join(lines)


def vision_model() -> str:
    """The model that looks at check frames, for /health."""
    return NEMOTRON_MODEL if VISION_BACKEND == "nemotron" else MODEL_ID


def _content(frame: bytes, step: Step, reference: bytes | None, language: str) -> list[dict]:
    """The user message in Anthropic's form; _openai_content converts it for Nemotron."""
    content: list[dict] = []
    if reference:
        content += [{"type": "text", "text": "The expert's reference photo of this step done right:"}, _image(reference)]
    return content + [
        {"type": "text", "text": "The worker's camera frame now:"},
        _image(frame),
        {"type": "text", "text": f"{_step_text(step)}\n\nWrite the hint in this language: {language}"},
    ]


def _openai_content(content: list[dict]) -> list[dict]:
    return [
        {"type": "image_url", "image_url": {"url": f"data:{c['source']['media_type']};base64,{c['source']['data']}"}} if c["type"] == "image" else c
        for c in content
    ]


def observe_nemotron(content: list[dict]) -> Observation:
    """Nemotron 3.5 Super VL on Verda. vLLM's structured output keeps the answer to the Observation schema."""
    key = os.getenv("VERDA_INFERENCE_KEY")
    if not key:
        raise VisionError("VISION_BACKEND=nemotron needs VERDA_INFERENCE_KEY.")
    body = {
        "model": NEMOTRON_MODEL,
        "max_tokens": 1500,
        "temperature": 0,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": _openai_content(content)}],
        "response_format": {"type": "json_schema", "json_schema": {"name": "Observation", "schema": Observation.model_json_schema()}},
        # The answer is a short report of what is seen; thinking would only add latency.
        "chat_template_kwargs": {"enable_thinking": False},
    }
    start = time.monotonic()
    try:
        response = httpx.post(f"{NEMOTRON_URL}/chat/completions", json=body, headers={"Authorization": f"Bearer {key}"}, timeout=NEMOTRON_TIMEOUT_S)
        response.raise_for_status()
        choice = response.json()["choices"][0]
        if choice.get("finish_reason") != "stop":
            raise VisionError(f"No usable observation (finish_reason={choice.get('finish_reason')})")
        obs = Observation.model_validate_json(choice["message"]["content"] or "")
    except (httpx.HTTPError, KeyError, IndexError, ValueError, ValidationError) as e:
        log.warning("Nemotron failed after %.1f s: %s", time.monotonic() - start, type(e).__name__)
        raise VisionError(f"Nemotron gave no usable observation ({type(e).__name__})") from e
    log.info("Nemotron %.1f s: %s; %s", time.monotonic() - start, obs.visibility, obs.summary)
    return obs


def observe(frame: bytes, step: Step, reference: bytes | None, language: str = "en") -> Observation:
    """One frame and the step (plus the expert's reference photo) in, a structured observation out."""
    content = _content(frame, step, reference, language)
    if VISION_BACKEND == "nemotron":
        try:
            return observe_nemotron(content)
        except VisionError as e:
            if not os.getenv("ANTHROPIC_API_KEY"):
                raise
            log.warning("%s; Claude answers this check", e)
    return observe_claude(content)


def observe_claude(content: list[dict]) -> Observation:
    response = client().beta.messages.parse(
        model=MODEL_ID,
        max_tokens=4000,
        output_config={"effort": VISION_EFFORT},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
        output_format=Observation,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise VisionError(f"No usable observation (stop_reason={response.stop_reason})")
    return response.parsed_output
