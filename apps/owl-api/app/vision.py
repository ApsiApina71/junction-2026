"""Owl Check vision (JUN-30): what the glasses camera sees during a step, as structured data.

The model only reports what it sees. Deciding whether the step is right is app/verifier.py.
"""

import base64
import os
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

from .models import Step

MODEL_ID = os.getenv("MODEL_ID", "claude-opus-5-5")
# Low effort keeps a check under the 4 s target; raise it if observations get sloppy.
VISION_EFFORT = os.getenv("VISION_EFFORT", "low")
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
- criteria (visual steps only, otherwise empty): for each criterion of the step, "yes", "no" or "unclear" with a short note.
- matches_reference: compare the frame with the expert's reference photo when one is given: "yes", "no", "unclear", or \
"no_reference".
- summary: one short sentence about what you see."""


class SeenItem(BaseModel):
    line: str = Field(description='The order line id this product exactly is, or "other"')
    description: str = Field(description='What the product is, with size or variant, e.g. "Oat drink 0.5 l"')
    qty: int = Field(ge=0)


class CriterionSeen(BaseModel):
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
        lines += [f"- {c}" for c in step.check.criteria]
    return "\n".join(lines)


def observe(frame: bytes, step: Step, reference: bytes | None, language: str = "en") -> Observation:
    """One frame and the step (plus the expert's reference photo) in, a structured observation out."""
    content: list[dict] = []
    if reference:
        content += [{"type": "text", "text": "The expert's reference photo of this step done right:"}, _image(reference)]
    content += [
        {"type": "text", "text": "The worker's camera frame now:"},
        _image(frame),
        {"type": "text", "text": f"{_step_text(step)}\n\nWrite the hint in this language: {language}"},
    ]

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
