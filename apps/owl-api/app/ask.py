"""Ask (JUN-31): answers from the company's own documents only, with the source.

The handbooks are small, so they go into the system prompt whole and are cached; no retrieval index. Every quote the
model gives as a source is checked against the documents in code, so a made-up source never reaches the worker.
"""

import os
import re

from pydantic import BaseModel, Field

from .models import Answer, Source
from .vision import MODEL_ID, VisionError, client

ASK_EFFORT = os.getenv("ASK_EFFORT", "low")

INSTRUCTIONS = """You are Owl, a training assistant on smart glasses. A new worker asks a question out loud during \
their shift. Answer only from the company documents below. They are the company's own rules, and they override \
anything you know in general.

- If the documents answer the question, set found to true. Give the answer as the company wants it done, in the \
worker's language, even when the documents are in another language.
- If they do not, set found to false and say so kindly in the worker's language, and tell them to ask their shift \
lead. Do not answer from general knowledge, even when you know the answer; safety questions included.
- text: the answer for the glasses display, at most 140 characters, plain text.
- say: the same answer to be spoken, at most 25 words, plain text, no lists or symbols.
- sources: for every fact you used, the document title, the section heading, and a short quote copied word for word \
from the document in its original language. Empty when found is false.

The question comes from speech recognition, so it may have small recognition errors; read it generously."""


class DraftSource(BaseModel):
    doc: str
    section: str | None
    quote: str


class Draft(BaseModel):
    found: bool
    text: str = Field(description="At most 140 characters")
    say: str = Field(description="At most 25 words")
    sources: list[DraftSource]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower().strip(".")


def documents_block(docs: list[tuple[str, str]]) -> str:
    """The documents as one stable text block. Sorted by title, so the cached prefix does not change between requests."""
    parts = [f'<document title="{title}">\n{text.strip()}\n</document>' for title, text in sorted(docs)]
    return "<documents>\n" + "\n\n".join(parts) + "\n</documents>"


def grounded_sources(draft: Draft, docs: list[tuple[str, str]]) -> list[Source]:
    """Keeps only sources whose quote really is in a document."""
    by_title = {title: _norm(text) for title, text in docs}
    kept = []
    for s in draft.sources:
        quote = _norm(s.quote)
        title = s.doc if s.doc in by_title else next((t for t, text in by_title.items() if quote and quote in text), None)
        if title and quote and quote in by_title[title]:
            kept.append(Source(doc=title, section=s.section, quote=s.quote.strip()))
    return kept


NOT_FOUND = {
    "en": ("That's not in our instructions. Ask your shift lead.", "That's not in our instructions. Please ask your shift lead."),
    "fi": ("Tätä ei ole ohjeissamme. Kysy vuoroesimieheltä.", "Tätä ei ole ohjeissamme. Kysy vuoroesimieheltäsi."),
}


def answer(question: str, docs: list[tuple[str, str]], language: str, context: str | None = None) -> Answer:
    lang = language or "en"
    if not docs:
        text, say = NOT_FOUND.get(lang.split("-")[0], NOT_FOUND["en"])
        return Answer(found=False, text=text, say=say, language=lang, sources=[])

    user = f"Worker's language: {lang}\n"
    if context:
        user += f"What they are doing now: {context}\n"
    user += f"Question: {question.strip()}"

    response = client().beta.messages.parse(
        model=MODEL_ID,
        max_tokens=4000,
        output_config={"effort": ASK_EFFORT},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=[
            {"type": "text", "text": INSTRUCTIONS},
            # The documents change only on upload, so this prefix stays cached across questions.
            {"type": "text", "text": documents_block(docs), "cache_control": {"type": "ephemeral"}},
        ],
        messages=[{"role": "user", "content": user}],
        output_format=Draft,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise VisionError(f"No usable answer (stop_reason={response.stop_reason})")
    draft = response.parsed_output

    sources = grounded_sources(draft, docs) if draft.found else []
    if draft.found and not sources:
        # The model answered but could not point to the text it came from: do not pass it on as company policy.
        text, say = NOT_FOUND.get(lang.split("-")[0], NOT_FOUND["en"])
        return Answer(found=False, text=text, say=say, language=lang, sources=[])
    return Answer(found=draft.found, text=draft.text.strip()[:140], say=draft.say.strip(), language=lang, sources=sources)
