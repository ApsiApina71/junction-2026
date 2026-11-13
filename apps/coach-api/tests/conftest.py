from datetime import date, timedelta

import pytest

from app.db import Customer, make_tx

TODAY = date(2026, 9, 30)


def build_customer() -> Customer:
    """A small, fully known customer: 12 months of salary on the 15th, rent on the 2nd, bills, groceries, cafes."""
    rows = []
    bal = 2000.0

    def add(d: date, hhmm: str, category: str, amount: float, merchant=None, mcc=None):
        nonlocal bal
        bal = round(bal + amount, 2)
        rows.append((d.isoformat(), f"{d.isoformat()} {hhmm}:00", category, amount, bal, merchant, mcc))

    d = date(2025, 10, 1)
    while d <= TODAY:
        if d.day == 2:
            add(d, "08:00", "Housing", -800.0)
        if d.day == 10:
            add(d, "09:00", "Utilities", -60.0)
        if d.day == 15:
            add(d, "07:00", "Salary", 2500.0)
        if d.weekday() == 5:
            add(d, "11:00", "Groceries", -70.0, "MRC-GRO-0001", "5411")
            add(d, "20:00", "Restaurants", -40.0, "MRC-RES-0001", "5812")
        if d.weekday() in (0, 2, 4):
            add(d, "08:30", "Restaurants", -4.0, "MRC-RES-0002", "5814")
        if d == date(2026, 6, 20):
            add(d, "14:00", "Home & Tech", -600.0, "MRC-HOM-0001", "5732")
        if d == date(2026, 9, 20):
            add(d, "23:30", "Transportation", -30.0, "MRC-TRN-0001", "4121")
        d += timedelta(days=1)
    return Customer("CUST99999", "00100", 30, tuple(make_tx(*r) for r in rows))


@pytest.fixture
def customer() -> Customer:
    return build_customer()
