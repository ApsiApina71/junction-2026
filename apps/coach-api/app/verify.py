"""Check the coach's words against the engine: every euro amount it states must be a figure a tool returned.

The prompt already tells the model to state only tool figures. This is the independent check behind that rule:
after an answer, amounts in the text are compared with the numbers tools produced in this conversation turn.
"""

import re
from typing import Any

# A number with optional thousands separators (space, narrow or non-breaking space, comma, dot) and decimals.
_NUM = r"\d{1,3}(?:[   ,.]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?"
_MONEY = re.compile(
    rf"(?:€\s?(?P<a>{_NUM}))|(?:(?P<b>{_NUM})\s?(?:€|euro[a-z]*|eur\b))",
    re.IGNORECASE,
)


def parse_number(text: str) -> float | None:
    """Parse '1 234,56', '1,234.56', '1.234,56', '1234' or '12,5' into a float."""
    s = re.sub(r"[   ]", "", text)
    if "," in s and "." in s:
        dec = "," if s.rfind(",") > s.rfind(".") else "."
        s = s.replace("." if dec == "," else ",", "").replace(dec, ".")
    elif "," in s or "." in s:
        sep = "," if "," in s else "."
        head, _, tail = s.rpartition(sep)
        # One separator followed by exactly three digits is a thousands separator ("1,234"), otherwise a decimal.
        s = head.replace(sep, "") + tail if len(tail) == 3 and s.count(sep) >= 1 and head else head.replace(sep, "") + "." + tail
    try:
        return float(s)
    except ValueError:
        return None


def numbers_in(text: str) -> list[float]:
    """Every number written in a piece of text."""
    return [n for n in (parse_number(x) for x in re.findall(_NUM, text)) if n is not None]


def collect_numbers(value: Any, into: set[float]) -> None:
    """Gather every number in a tool result, at any depth."""
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        into.add(abs(float(value)))
    elif isinstance(value, dict):
        for v in value.values():
            collect_numbers(v, into)
    elif isinstance(value, (list, tuple)):
        for v in value:
            collect_numbers(v, into)


def _matches(amount: float, known: set[float]) -> bool:
    # People round: "183 €" for 182.85 and "1 800 €" for 1 819 are both honest. Allow whole-euro rounding or 1.5 %.
    return any(abs(amount - k) <= max(0.5, 0.015 * k) for k in known)


def check_text(text: str, known: set[float]) -> dict:
    """Return how many euro amounts in `text` were found among the engine's figures, and the ones that were not."""
    checked = 0
    unverified: list[str] = []
    for m in _MONEY.finditer(text):
        raw = m.group("a") or m.group("b")
        amount = parse_number(raw)
        if amount is None:
            continue
        checked += 1
        if not _matches(amount, known) and m.group(0).strip() not in unverified:
            unverified.append(m.group(0).strip())
    return {"checked": checked, "unverified": unverified}
