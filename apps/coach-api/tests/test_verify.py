import pytest

from app import verify


@pytest.mark.parametrize(
    ("text", "value"),
    [
        ("1 234,56", 1234.56),
        ("1,234.56", 1234.56),
        ("1.234,56", 1234.56),
        ("1234", 1234.0),
        ("12,5", 12.5),
        ("12.50", 12.5),
        ("1,234", 1234.0),
        ("3\u00a0152", 3152.0),
        ("0,99", 0.99),
    ],
)
def test_parse_number(text, value):
    assert verify.parse_number(text) == pytest.approx(value)


def test_collect_numbers_walks_everything():
    found: set[float] = set()
    verify.collect_numbers({"a": -12.5, "b": [{"c": 3}, 4.0], "ok": True, "name": "x"}, found)
    assert found == {12.5, 3.0, 4.0}


def test_check_text_in_both_languages():
    known = {182.85, 26.12, 3152.4, 1819.0}
    assert verify.check_text("You can spend €183 this week, €26.12 a day.", known) == {"checked": 2, "unverified": []}
    assert verify.check_text("Menosi ovat 3 152 € kuussa, josta 1 819 euroa on pakollisia.", known) == {"checked": 2, "unverified": []}
    assert verify.check_text("That is 450 € more.", known) == {"checked": 1, "unverified": ["450 €"]}
    # Percentages, dates and counts are not money and are left alone.
    assert verify.check_text("58 % of it, 15 days to payday on 15 October.", known) == {"checked": 0, "unverified": []}
