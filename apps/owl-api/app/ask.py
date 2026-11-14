"""Ask (JUN-31): answers from the company's own documents only, with the source.

The handbooks are small, so they go into the system prompt whole and are cached; no retrieval index. Every quote the
model gives as a source is checked against the documents in code, so a made-up source never reaches the worker.
"""

import os
import re

from pydantic import BaseModel, Field

from . import search, vision
from .models import Answer, Source
from .vision import MODEL_ID, VisionError, client

ASK_EFFORT = os.getenv("ASK_EFFORT", "low")
# Above this many characters in all documents together, only the best sections go into the prompt (JUN-71).
ASK_MAX_CHARS = int(os.getenv("ASK_MAX_CHARS", "60000"))
# Demo mode: the lowest BM25 score that still counts as an answer.
DEMO_MIN_SCORE = float(os.getenv("DEMO_MIN_SCORE", "1.0"))
INDEX = search.Index()

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

If the worker's language tag ends with "-x-easy", write in easy language: one idea per sentence, everyday words, \
no clauses.

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

    def found(quote: str, text: str) -> bool:
        # Word for word, sentence by sentence: a quote may join two sentences of one section that have a line between.
        parts = [_norm(p) for p in re.split(r"(?<=[.!?])\s+", quote) if _norm(p)]
        return bool(parts) and all(p in text for p in parts)

    kept = []
    for s in draft.sources:
        title = s.doc if s.doc in by_title else next((t for t, text in by_title.items() if found(s.quote, text)), None)
        if title and found(s.quote, by_title[title]):
            kept.append(Source(doc=title, section=s.section, quote=s.quote.strip()))
    return kept


NOT_FOUND = {
    "en": ("That's not in our instructions. Ask your shift lead.", "That's not in our instructions. Please ask your shift lead."),
    "fi": ("Tätä ei ole ohjeissamme. Kysy vuoroesimieheltä.", "Tätä ei ole ohjeissamme. Kysy vuoroesimieheltäsi."),
}


NOT_FOUND_EASY = {
    "en": ("It is not in our rules. Ask your boss.", "It is not in our rules. Ask your boss."),
    "fi": ("Tätä ei ole ohjeissa. Kysy esimieheltä.", "Tätä ei ole ohjeissa. Kysy esimieheltä."),
}


def not_found(lang: str) -> Answer:
    table = NOT_FOUND_EASY if "-x-easy" in lang.lower() else NOT_FOUND
    text, say = table.get(lang.split("-")[0].lower(), table["en"])
    return Answer(found=False, text=text, say=say, language=lang, sources=[])


def prompt_docs(question: str, context: str | None, docs: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Every document when they fit the prompt; otherwise only the best sections, found locally (JUN-71)."""
    if sum(len(text) for _, text in docs) <= ASK_MAX_CHARS:
        return docs
    INDEX.update([(title, title, text) for title, text in docs])
    picked: dict[str, list[str]] = {}
    used = 0
    for _, section in INDEX.search(f"{question} {context or ''}", limit=12):
        rendered = section.render()
        if used + len(rendered) > ASK_MAX_CHARS:
            break
        picked.setdefault(section.doc_title, []).append(rendered)
        used += len(rendered)
    return [(title, "\n\n".join(parts)) for title, parts in picked.items()]


def demo_answer(question: str, docs: list[tuple[str, str]], language: str) -> Answer:
    """Demo mode, no model: the best sentence of the best section, quoted as it stands in the document."""
    lang = language or "en"
    INDEX.update([(title, title, text) for title, text in docs])
    hits = INDEX.search(question, limit=1)
    if not hits or hits[0][0] < DEMO_MIN_SCORE:
        return not_found(lang)
    section = hits[0][1]
    sentence = search.best_sentence(question, section)
    words = sentence.split()
    return Answer(
        found=True,
        text=sentence if len(sentence) <= 140 else sentence[:139].rstrip() + "…",
        say=" ".join(words[:25]),
        language=lang,
        sources=[Source(doc=section.doc_title, section=section.heading or None, quote=sentence)],
    )


def answer(question: str, docs: list[tuple[str, str]], language: str, context: str | None = None) -> Answer:
    lang = language or "en"
    if not docs:
        return not_found(lang)

    user = f"Worker's language: {lang}\n"
    if context:
        user += f"What they are doing now: {context}\n"
    user += f"Question: {question.strip()}"

    documents = documents_block(prompt_docs(question, context, docs))
    if vision.LLM_BACKEND == "nemotron":
        # The same rules on Nemotron: the answer still passes only with a quote found word for word below.
        draft = vision.nemotron_parse(f"{INSTRUCTIONS}\n\n{documents}", user, Draft, "ask", max_tokens=1200)
    else:
        response = client().beta.messages.parse(
            model=MODEL_ID,
            max_tokens=4000,
            output_config={"effort": ASK_EFFORT},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=[
                {"type": "text", "text": INSTRUCTIONS},
                # The documents change only on upload, so this prefix stays cached across questions.
                {"type": "text", "text": documents, "cache_control": {"type": "ephemeral"}},
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
        return not_found(lang)
    return Answer(found=draft.found, text=draft.text.strip()[:140], say=draft.say.strip(), language=lang, sources=sources)
