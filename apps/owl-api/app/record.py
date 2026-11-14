"""Record (JUN-32): an expert's narrated task becomes a guided process.

The expert pinches at each step on the glasses; each step arrives with a reference photo, a clip and the narration.
Claude rewrites the narration into short step cards and check criteria. The result is a draft that a person reviews
and publishes in Owl Studio.
"""

import logging
import os
import re
from typing import Literal

from pydantic import BaseModel, Field

from .models import Check, Process, Recording, Step
from .vision import MODEL_ID, VisionError, client

log = logging.getLogger("owl.record")
RECORD_EFFORT = os.getenv("RECORD_EFFORT", "medium")

INSTRUCTIONS = """You turn an experienced worker's narrated recording of a work task into a guided process for a \
new worker who will follow it on smart glasses with a small display. The expert did the task once and talked while \
doing it; each recorded step has the transcript of what they said (from speech recognition, so expect small errors \
and filler words) and the photo they took at the end of the step.

For every recorded step, in the same order, write exactly one step:
- title: what to do, as a short imperative, at most 32 characters ("Pick the items").
- instruction: the instruction on the display, at most 140 characters, plain text. Keep the expert's own tips, \
names of tools, levers and places, and any safety rule they mention.
- say: the same instruction spoken in the worker's ear, at most 25 words.
- check: "visual" when the photo shows a result that can be checked by looking (the box is taped, the label is on top), \
otherwise "none".
- criteria: for visual checks, 1 to 3 short things anyone can see in a photo of the step done right. Empty for "none".

Also write the process title (at most 60 characters), a one-sentence summary, and the language of the narration as a \
BCP 47 tag. Write everything in the narration's language. Do not invent steps, rules or facts the expert did not say."""


class StepDraft(BaseModel):
    title: str
    instruction: str
    say: str
    check: Literal["visual", "none"]
    criteria: list[str]


class ProcessDraft(BaseModel):
    title: str
    summary: str
    language: str = Field(description="BCP 47 tag of the narration, e.g. en or fi")
    steps: list[StepDraft]


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip(" ,.;:") + "…"


def _words(text: str, limit: int) -> str:
    words = re.sub(r"\s+", " ", text).strip().split(" ")
    return " ".join(words[:limit])


# A few very common words tell Finnish narration from English when no model read it.
FINNISH = {
    "ja",
    "ei",
    "se",
    "että",
    "ota",
    "laita",
    "sitten",
    "kun",
    "tämä",
    "tähän",
    "niin",
    "myös",
    "vain",
    "aina",
    "ensin",
    "päälle",
    "tarkista",
    "muista",
    "sekä",
    "tai",
}
ENGLISH = {"the", "and", "is", "it", "to", "of", "take", "put", "then", "this", "that", "you", "always", "first", "check", "with", "into", "or"}


def guess_language(text: str) -> str:
    """fi or en, for narration that no model read. The reviewer can correct it in Owl Studio."""
    words = re.findall(r"[a-zåäö]+", text.lower())
    finnish = sum(w in FINNISH or "ä" in w or "ö" in w for w in words)
    english = sum(w in ENGLISH for w in words)
    return "fi" if finnish > english else "en"


def plain_draft(rec: Recording) -> ProcessDraft:
    """A draft straight from the narration, without a model: the first sentence is the title."""
    steps = []
    for s in rec.steps:
        first = re.split(r"(?<=[.!?])\s", s.narration.strip(), maxsplit=1)[0] or f"Step {s.index}"
        steps.append(
            StepDraft(title=_clip(first, 32), instruction=_clip(s.narration or first, 140), say=_words(s.narration or first, 25), check="none", criteria=[])
        )
    language = guess_language(" ".join(s.narration for s in rec.steps))
    return ProcessDraft(title=rec.title, summary=f"Recorded by {rec.expert or 'an expert'}.", language=language, steps=steps)


def model_draft(rec: Recording, photos: list[bytes | None]) -> ProcessDraft:
    from .vision import _image

    content: list[dict] = [{"type": "text", "text": f"Task: {rec.title}\nExpert: {rec.expert or 'unknown'}\nRecorded steps: {len(rec.steps)}"}]
    for s, photo in zip(rec.steps, photos, strict=True):
        content.append({"type": "text", "text": f"\nRecorded step {s.index}. Narration: {s.narration or '(nothing said)'}"})
        if photo:
            content.append(_image(photo))

    response = client().beta.messages.parse(
        model=MODEL_ID,
        max_tokens=16000,
        output_config={"effort": RECORD_EFFORT},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=INSTRUCTIONS,
        messages=[{"role": "user", "content": content}],
        output_format=ProcessDraft,
    )
    draft = response.parsed_output
    if response.stop_reason == "refusal" or draft is None:
        raise VisionError(f"No usable process (stop_reason={response.stop_reason})")
    if len(draft.steps) != len(rec.steps):
        raise VisionError(f"The model wrote {len(draft.steps)} steps for {len(rec.steps)} recorded ones")
    return draft


def build_process(process_id: str, rec: Recording, draft: ProcessDraft, company: str) -> Process:
    steps = []
    for i, (recorded, s) in enumerate(zip(rec.steps, draft.steps, strict=True), start=1):
        criteria = [_clip(c, 120) for c in s.criteria if c.strip()][:3]
        kind = "visual" if s.check == "visual" and criteria else "none"
        steps.append(
            Step(
                id=f"step-{i}",
                index=i,
                title=_clip(s.title, 32),
                instruction=_clip(s.instruction, 140),
                say=_words(s.say, 25),
                reference_image_url=recorded.photo_url,
                clip_url=recorded.clip_url,
                check=Check(kind=kind, criteria=criteria if kind == "visual" else []),
                # The whole narration, never shortened: the reviewer in Owl Studio reads it beside the written step.
                source={"doc": f"{rec.expert or 'Expert'}'s recording", "quote": re.sub(r"\s+", " ", recorded.narration).strip()}
                if recorded.narration
                else None,
                # Owl wrote this step. A person reads it against the narration in Owl Studio before it can be published.
                reviewed=False,
            )
        )
    return Process(
        id=process_id,
        title=_clip(draft.title or rec.title, 60),
        summary=_clip(draft.summary, 200),
        company=company,
        language=draft.language or "en",
        status="draft",
        source="record",
        expert=rec.expert,
        steps=steps,
    )


def write_process(process_id: str, rec: Recording, photos: list[bytes | None], company: str, use_model: bool = True) -> Process:
    """The draft process for a finished recording. Falls back to the plain narration when the model fails."""
    draft = None
    if use_model:
        try:
            draft = model_draft(rec, photos)
        except Exception as e:  # noqa: BLE001 - the expert's recording must never be lost to a model error
            log.warning("Record: model draft failed, using the narration as it is: %s", e)
    return build_process(process_id, rec, draft or plain_draft(rec), company)
