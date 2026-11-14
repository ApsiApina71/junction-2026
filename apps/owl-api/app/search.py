"""Local retrieval over the company's documents (JUN-71): sections by heading, ranked with BM25.

Everything runs on this server: no embeddings API and no third-party index, so the documents stay with the company.
Ask uses it when the documents no longer fit the prompt, and demo mode answers from the best sentence.
"""

import math
import re
import threading
from collections import Counter
from dataclasses import dataclass

K1, B = 1.5, 0.75
STEM = 5  # crude stemming that also helps inflection: "leaves" -> "leave", "laatikkoon" -> "laati"
_STOP = "a an and are as at be by do does for from how i if in is it its me my of on or should the this to what when where which who why will with you your can ja on ei se että kun mitä miten mikä mihin jos tai kuin olla minä mä"
STOPWORDS = frozenset(_STOP.split())
_WORD = re.compile(r"[^\W_]+", re.UNICODE)
_HEADING = re.compile(r"^(#{1,6})\s+(.*)$")


def tokens(text: str) -> list[str]:
    return [w[:STEM] for w in _WORD.findall(text.lower()) if w not in STOPWORDS and (len(w) > 1 or w.isdigit())]


@dataclass(frozen=True)
class Section:
    doc_id: str
    doc_title: str
    heading: str
    text: str

    def render(self) -> str:
        return f"## {self.heading}\n{self.text}" if self.heading else self.text


def split_sections(doc_id: str, title: str, text: str) -> list[Section]:
    """One section per heading. A document without headings is split at blank lines into chunks of about 1500 chars."""
    sections: list[Section] = []
    heading, lines = "", []

    def flush() -> None:
        body = "\n".join(lines).strip()
        if body:
            sections.append(Section(doc_id, title, heading, body))

    has_headings = any(_HEADING.match(line) for line in text.splitlines())
    if has_headings:
        for line in text.splitlines():
            m = _HEADING.match(line)
            if m:
                flush()
                heading, lines = m.group(2).strip(), []
            else:
                lines.append(line)
        flush()
        return sections
    chunk = ""
    for para in re.split(r"\n\s*\n", text):
        if chunk and len(chunk) + len(para) > 1500:
            sections.append(Section(doc_id, title, "", chunk.strip()))
            chunk = ""
        chunk += para + "\n\n"
    if chunk.strip():
        sections.append(Section(doc_id, title, "", chunk.strip()))
    return sections


class Index:
    """BM25 over sections. Rebuilt when the set of documents changes."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._key: tuple = ()
        self.sections: list[Section] = []
        self._tf: list[Counter] = []
        self._df: Counter = Counter()
        self._avg = 1.0

    def update(self, docs: list[tuple[str, str, str]]) -> None:
        """docs: (doc_id, title, text). Cheap when nothing changed."""
        key = tuple(sorted((d, len(t)) for d, _, t in docs))
        with self._lock:
            if key == self._key:
                return
            self.sections = [s for d, title, text in sorted(docs) for s in split_sections(d, title, text)]
            self._tf = [Counter(tokens(f"{s.heading} {s.heading} {s.text}")) for s in self.sections]
            self._df = Counter(t for tf in self._tf for t in tf)
            self._avg = sum(sum(tf.values()) for tf in self._tf) / max(1, len(self._tf))
            self._key = key

    def search(self, query: str, limit: int = 5) -> list[tuple[float, Section]]:
        q = tokens(query)
        with self._lock:
            n = len(self.sections)
            scored = []
            for tf, section in zip(self._tf, self.sections, strict=True):
                length = sum(tf.values()) or 1
                score = 0.0
                for term in set(q):
                    if term in tf:
                        idf = math.log(1 + (n - self._df[term] + 0.5) / (self._df[term] + 0.5))
                        score += idf * tf[term] * (K1 + 1) / (tf[term] + K1 * (1 - B + B * length / self._avg))
                if score > 0:
                    scored.append((score, section))
        scored.sort(key=lambda x: -x[0])
        return scored[:limit]


def best_sentence(query: str, section: Section) -> str:
    """The sentence or bullet of a section that best matches the query. A query word found in fewer sentences of the
    section weighs more, so "where does the label go" picks the label rule, not any sentence with "go"."""
    parts = [p.strip(" -*•\t") for p in re.split(r"(?<=[.!?])\s+|\n+", section.text) if p.strip(" -*•\t")]
    if not parts:
        return section.text
    words = [set(tokens(p)) for p in parts]
    q = set(tokens(query))
    # Two-letter words ("go", "on") say little about the rule the worker asks for.
    weight = {t: (0.25 if len(t) <= 2 and not t.isdigit() else 1.0) / max(1, sum(t in w for w in words)) for t in q}
    best = max(range(len(parts)), key=lambda i: (sum(weight[t] for t in q & words[i]), -len(parts[i])))
    return parts[best]
