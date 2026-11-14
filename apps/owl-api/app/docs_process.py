"""Both knowledge levels (JUN-70): a guided process from the company's documents, and the handbook rule behind
each recorded step.

- from_doc: a written instruction becomes a draft process. Claude writes the steps and quotes the document; without a
  model, a numbered list or the sections of the document become the steps, so the endpoint always works.
- attach_rules: each step of a process gets the handbook sentence that best backs it (local search, JUN-71) as
  Step.rule, when one matches well enough.
"""

import logging
import os
import re
from typing import Literal

from pydantic import BaseModel

from . import search
from .models import Check, Process, Source, Step
from .vision import MODEL_ID, VisionError, client

log = logging.getLogger("owl.docs")
DOCS_EFFORT = os.getenv("DOCS_EFFORT", "medium")
RULE_MIN_SCORE = float(os.getenv("RULE_MIN_SCORE", "3.0"))
MAX_STEPS = 8

INSTRUCTIONS = """You turn a company's written instruction into a guided process for a new worker who follows it \
step by step on smart glasses with a small display. Use only what the document says; do not add steps, rules or facts.

For each step, in the order the work is done (at most 8 steps):
- title: a short imperative, at most 32 characters.
- instruction: for the display, at most 140 characters, plain text.
- say: the same, spoken in the worker's ear, at most 25 words.
- check: "visual" when the result of the step can be seen in a photo from the worker's view, otherwise "none".
- criteria: for visual checks, 1 to 3 things anyone can see in a photo of the step done right. Empty for "none".
- section: the heading of the part of the document the step comes from.
- quote: a short sentence copied word for word from the document that the step is based on.

Also write the process title (at most 60 characters), a one-sentence summary and the document's language as a \
BCP 47 tag. Write in the document's language."""


class DocStep(BaseModel):
    title: str
    instruction: str
    say: str
    check: Literal["visual", "none"]
    criteria: list[str]
    section: str | None
    quote: str


class DocDraft(BaseModel):
    title: str
    summary: str
    language: str
    steps: list[DocStep]


def _clip(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    return text if len(text) <= limit else text[: limit - 1].rstrip(" ,.;:") + "…"


def _words(text: str, limit: int) -> str:
    return " ".join(text.split()[:limit])


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower().strip(".")


def _first_sentence(text: str) -> str:
    parts = [p.strip(" -*•\t") for p in re.split(r"(?<=[.!?])\s+|\n+", text) if p.strip(" -*•\t")]
    return parts[0] if parts else text.strip()


_NUMBERED = re.compile(r"^\s*(\d+)[.)]\s+(.+)$")


def plain_draft(doc_title: str, text: str, title: str | None) -> DocDraft:
    """Without a model: the first numbered list of the document, or else one step per section."""
    numbered = [m.group(2).strip() for line in text.splitlines() if (m := _NUMBERED.match(line))]
    steps: list[DocStep] = []
    if len(numbered) >= 2:
        for item in numbered[:MAX_STEPS]:
            first = _first_sentence(item)
            steps.append(
                DocStep(title=_clip(first, 32), instruction=_clip(item, 140), say=_words(item, 25), check="none", criteria=[], section=None, quote=first)
            )
    else:
        # The document's own title (its "# " heading) is not a step.
        sections = [s for s in search.split_sections("d", doc_title, text) if s.heading and s.text and s.heading != doc_title]
        for section in sections[:MAX_STEPS]:
            first = _first_sentence(section.text)
            steps.append(
                DocStep(
                    title=_clip(section.heading, 32),
                    instruction=_clip(first, 140),
                    say=_words(first, 25),
                    check="none",
                    criteria=[],
                    section=section.heading,
                    quote=first,
                )
            )
    lang = "fi" if re.search(r"[äö]", text.lower()) and not re.search(r"\b(the|and)\b", text.lower()) else "en"
    return DocDraft(title=title or doc_title, summary=f"From the document {doc_title}.", language=lang, steps=steps)


def model_draft(doc_title: str, text: str, title: str | None) -> DocDraft:
    user = f'<document title="{doc_title}">\n{text.strip()}\n</document>'
    if title:
        user += f"\n\nCall the process: {title}"
    response = client().beta.messages.parse(
        model=MODEL_ID,
        max_tokens=16000,
        output_config={"effort": DOCS_EFFORT},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=INSTRUCTIONS,
        messages=[{"role": "user", "content": user}],
        output_format=DocDraft,
    )
    draft = response.parsed_output
    if response.stop_reason == "refusal" or draft is None or not draft.steps:
        raise VisionError(f"No usable process (stop_reason={response.stop_reason})")
    return draft


def from_doc(process_id: str, doc_title: str, text: str, title: str | None, company: str, use_model: bool) -> Process:
    """A draft process from one document. Quotes that are not in the document are dropped, never passed on."""
    draft = None
    if use_model:
        try:
            draft = model_draft(doc_title, text, title)
        except Exception as e:  # noqa: BLE001 - the plain draft keeps the endpoint working without the model
            log.warning("Docs: model draft failed, using the document's own structure: %s", e)
    draft = draft or plain_draft(doc_title, text, title)
    if not draft.steps:
        raise ValueError("The document has no steps or sections to turn into a process.")
    body = _norm(text)
    steps = []
    for i, s in enumerate(draft.steps[:MAX_STEPS], start=1):
        criteria = [_clip(c, 120) for c in s.criteria if c.strip()][:3]
        kind = "visual" if s.check == "visual" and criteria else "none"
        quote_ok = bool(s.quote.strip()) and _norm(s.quote) in body
        steps.append(
            Step(
                id=f"step-{i}",
                index=i,
                title=_clip(s.title, 32),
                instruction=_clip(s.instruction, 140),
                say=_words(s.say, 25),
                check=Check(kind=kind, criteria=criteria if kind == "visual" else []),
                source=Source(doc=doc_title, section=s.section, quote=s.quote.strip()) if quote_ok else None,
                reviewed=False,  # Owl wrote it: a person checks it in Owl Studio before the task can be published
            )
        )
    return Process(
        id=process_id,
        title=_clip(draft.title, 60),
        summary=_clip(draft.summary, 200),
        company=company,
        language=draft.language or "en",
        status="draft",
        source="docs",
        expert=None,
        steps=steps,
    )


def attach_rules(process: Process, docs: list[tuple[str, str]], index: search.Index | None = None) -> Process:
    """Each step gets the handbook sentence that best backs it as Step.rule, when one matches well enough."""
    if not docs:
        return process
    index = index or search.Index()
    index.update([(title, title, text) for title, text in docs])
    steps = []
    for step in process.steps:
        hits = index.search(f"{step.title} {step.instruction}", limit=1)
        rule = None
        if hits and hits[0][0] >= RULE_MIN_SCORE:
            section = hits[0][1]
            rule = Source(doc=section.doc_title, section=section.heading or None, quote=search.best_sentence(f"{step.title} {step.instruction}", section))
        steps.append(step.model_copy(update={"rule": rule}))
    return process.model_copy(update={"steps": steps})
