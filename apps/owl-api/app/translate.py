"""Hire anyone (JUN-72): Owl translates a process into the worker's language the first time it is needed.

The translation keeps everything but the words: step ids and order, media, check kinds, SKUs and quantities. Order line
names stay as printed on the order and the shelf labels. Only the model can translate; without it the endpoint says so.
"""

import os
import re

from pydantic import BaseModel

from . import vision
from .models import Process
from .vision import MODEL_ID, VisionError, client

TRANSLATE_EFFORT = os.getenv("TRANSLATE_EFFORT", "low")

INSTRUCTIONS = """You translate a guided work process for a new worker who follows it on smart glasses with a small \
display. Translate into the requested language (a BCP 47 tag) in plain, everyday words that a newcomer understands.

- Keep every step, in the same order, with the same id.
- title: at most 32 characters. instruction: at most 140 characters. say: at most 25 words, for the worker's ear.
- criteria: translate each one, the same number in the same order.
- warning: the expert's own sentence for a wrong result, at most 140 characters. Translate it when it is given; leave it empty when it is empty.
- Keep numbers, units, product names, machine names and positions (such as "oven 2" or "lever on 1") exactly right.
- Do not add or drop any rule or safety instruction."""


class TranslatedStep(BaseModel):
    id: str
    title: str
    instruction: str
    say: str
    criteria: list[str]
    warning: str = ""


class TranslatedProcess(BaseModel):
    title: str
    summary: str
    steps: list[TranslatedStep]


class TranslationError(Exception):
    """The model's translation does not fit the process."""


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip(" ,.;:") + "…"


def _source(process: Process) -> dict:
    return {
        "title": process.title,
        "summary": process.summary,
        "steps": [
            {"id": s.id, "title": s.title, "instruction": s.instruction, "say": s.say, "criteria": s.check.criteria, "warning": s.check.warning or ""}
            for s in process.steps
        ],
    }


def apply(process: Process, translated: TranslatedProcess, language: str) -> Process:
    """The process with the translated words. Raises TranslationError when the steps do not match."""
    if [s.id for s in translated.steps] != [s.id for s in process.steps]:
        raise TranslationError("The translation does not keep the steps of the process.")
    steps = []
    for original, t in zip(process.steps, translated.steps, strict=True):
        if len(t.criteria) != len(original.check.criteria):
            raise TranslationError(f"Step {original.id}: the translation has a different number of criteria.")
        # JUN-106: the expert's warning line, translated; the original stays when the model left it out.
        warning = _clip(t.warning, 140) if original.check.warning and t.warning.strip() else original.check.warning
        check = original.check.model_copy(update={"criteria": [_clip(c, 120) for c in t.criteria], "warning": warning})
        steps.append(
            original.model_copy(
                update={"title": _clip(t.title, 32), "instruction": _clip(t.instruction, 140), "say": " ".join(t.say.split()[:25]), "check": check}
            )
        )
    return process.model_copy(update={"title": _clip(translated.title, 60), "summary": _clip(translated.summary, 200), "language": language, "steps": steps})


def translate(process: Process, language: str) -> Process:
    import json

    user = f"Translate into: {language}\n\n{json.dumps(_source(process), ensure_ascii=False, indent=1)}"
    if vision.LLM_BACKEND == "nemotron":
        return apply(process, vision.write_with_nemotron(INSTRUCTIONS, user, TranslatedProcess, "translate"), language)
    response = client().beta.messages.parse(
        model=MODEL_ID,
        max_tokens=16000,
        output_config={"effort": TRANSLATE_EFFORT},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=INSTRUCTIONS,
        messages=[{"role": "user", "content": user}],
        output_format=TranslatedProcess,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise VisionError(f"No usable translation (stop_reason={response.stop_reason})")
    return apply(process, response.parsed_output, language)
