"""Customer service mode (JUN-98): during training Owl listens at the counter and suggests answers.

The glasses send the last ~30 seconds of the conversation as text when the worker pinches Hint. Owl answers with two
or three short bullets from the company's documents only, and names the source. When the documents do not answer it,
Owl says so and never guesses.

Privacy: the transcript is used for this one answer and dropped. It is never written to disk or to the logs, never
sent to the stage view, and never part of an error message.
"""

import os
import re

from pydantic import BaseModel, Field

from . import ask, search
from .models import AssistAnswer, AssistSource
from .vision import MODEL_ID, VisionError, client

# About 30 seconds of speech: people say some 2.5 words a second.
TAIL_WORDS = int(os.getenv("ASSIST_TAIL_WORDS", "80"))
# The customer's question is usually at the end: these last words count twice in the local search.
QUESTION_WORDS = 25
MAX_BULLET = 80
# The local search needs this many of the conversation's words in a section before it suggests anything.
MIN_SHARED_WORDS = 2

UNSURE = {
    "en": "Not in the handbook, ask a colleague",
    "fi": "Ei käsikirjassa, kysy työkaverilta",
}

INSTRUCTIONS = """You are Owl, a training assistant on smart glasses. A new worker is serving a customer at a counter \
and is stuck. You get the last half minute of the conversation from speech recognition, without speaker labels. \
Find the customer's latest question that the worker has not answered yet, and suggest what the worker can say.

Answer only from the company documents below. They override anything you know in general.

- found: true only if the documents answer the question.
- bullets: one to three short points the worker can glance at and say in their own words, in the worker's language, \
each at most 80 characters, plain text, the most important first. Empty when found is false.
- sources: for every fact you used, the document title, the section heading, and a short quote copied word for word \
from the document. Empty when found is false.

Never guess prices, times, allergens or rules. If the documents do not say it, set found to false. The text has \
speech recognition errors; read it generously."""


class Draft(BaseModel):
    found: bool
    bullets: list[str] = Field(description="1-3 points, at most 80 characters each")
    sources: list[ask.DraftSource]


def tail(transcript: str, words: int = TAIL_WORDS) -> str:
    return " ".join(transcript.split()[-words:])


def unsure(language: str) -> AssistAnswer:
    return AssistAnswer(bullets=[UNSURE.get(language.split("-")[0].lower(), UNSURE["en"])], sources=[], unsure=True)


def _clip(text: str, limit: int = MAX_BULLET) -> str:
    text = re.sub(r"\s+", " ", text).strip(" -*•")
    return text if len(text) <= limit else text[: limit - 1].rstrip(" ,;") + "…"


def _ranked_sentences(query: str, section: search.Section) -> list[str]:
    """The sentences of a section that share words with the query, best first."""
    parts = [p.strip(" -*•\t") for p in re.split(r"(?<=[.!?])\s+|\n+", section.text) if p.strip(" -*•\t")]
    q = set(search.tokens(query))
    scored = [(len(q & set(search.tokens(p))), -i, p) for i, p in enumerate(parts)]
    return [p for score, _, p in sorted(scored, reverse=True) if score > 0]


def local_answer(transcript: str, docs: list[tuple[str, str]], language: str) -> AssistAnswer:
    """Demo mode and OWL_MOCK_ASSIST: the best section's best sentences, as they stand in the document."""
    text = tail(transcript)
    if not text or not docs:
        return unsure(language)
    question = tail(text, QUESTION_WORDS)
    query = f"{text} {question}"
    ask.INDEX.update([(title, title, body) for title, body in docs])
    hits = ask.INDEX.search(query, limit=1)
    if not hits or hits[0][0] < ask.DEMO_MIN_SCORE:
        return unsure(language)
    section = hits[0][1]
    shared = set(search.tokens(text)) & set(search.tokens(f"{section.heading} {section.text}"))
    if len(shared) < MIN_SHARED_WORDS:
        # One shared word ("yesterday") is a coincidence, not an answer.
        return unsure(language)
    bullets = [_clip(s) for s in _ranked_sentences(question, section)[:3]] or [_clip(s) for s in _ranked_sentences(query, section)[:3]]
    if not bullets:
        return unsure(language)
    return AssistAnswer(bullets=bullets, sources=[AssistSource(doc=section.doc_title, section=section.heading or None)], unsure=False)


def answer(transcript: str, docs: list[tuple[str, str]], language: str) -> AssistAnswer:
    text = tail(transcript)
    if not text or not docs:
        return unsure(language)
    response = client().beta.messages.parse(
        model=MODEL_ID,
        max_tokens=2000,
        output_config={"effort": "low"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=[
            {"type": "text", "text": INSTRUCTIONS},
            {"type": "text", "text": ask.documents_block(ask.prompt_docs(text, None, docs)), "cache_control": {"type": "ephemeral"}},
        ],
        messages=[{"role": "user", "content": f"Worker's language: {language}\nConversation (last ~30 s):\n{text}"}],
        output_format=Draft,
    )
    if response.stop_reason == "refusal" or response.parsed_output is None:
        # The message names only the stop reason: the transcript never goes into an error or a log line.
        raise VisionError(f"No usable suggestion (stop_reason={response.stop_reason})")
    draft = response.parsed_output
    bullets = [_clip(b) for b in draft.bullets if b.strip()][:3]
    if not draft.found or not bullets:
        return unsure(language)
    grounded = ask.grounded_sources(ask.Draft(found=True, text="", say="", sources=draft.sources), docs)
    if not grounded:
        # Bullets that point to no real text in the documents are not passed on as company policy.
        return unsure(language)
    seen: list[AssistSource] = []
    for s in grounded:
        source = AssistSource(doc=s.doc, section=s.section)
        if source not in seen:
            seen.append(source)
    return AssistAnswer(bullets=bullets, sources=seen, unsure=False)
