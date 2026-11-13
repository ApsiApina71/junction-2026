"""Read-only access to the transaction database built by scripts/ingest.py."""

import os
import sqlite3
from dataclasses import dataclass
from datetime import date
from functools import lru_cache
from pathlib import Path

from .taxonomy import kind, subcategory

DB_PATH = Path(os.getenv("SBANK_DB", Path(__file__).resolve().parent.parent / "data" / "sbank.db"))


@dataclass(frozen=True, slots=True)
class Tx:
    date: date
    ts: str  # "YYYY-MM-DD HH:MM:SS"
    category: str
    sub: str
    kind: str  # spend | income | saving | transfer
    amount: float  # signed: negative is money out
    balance: float
    merchant: str | None
    mcc: str | None


@dataclass(frozen=True, slots=True)
class Customer:
    id: str
    postal_code: str
    age: int
    txs: tuple[Tx, ...]  # ordered by time


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, check_same_thread=False)
    con.row_factory = sqlite3.Row
    return con


@lru_cache(maxsize=1)
def _con() -> sqlite3.Connection:
    return connect()


@lru_cache(maxsize=1)
def today() -> date:
    """The demo's 'today' is the last day in the dataset."""
    row = _con().execute("SELECT MAX(date) FROM tx").fetchone()
    return date.fromisoformat(row[0])


def make_tx(d: str, ts: str, category: str, amount: float, balance: float, merchant: str | None, mcc: str | None) -> Tx:
    return Tx(date.fromisoformat(d), ts, category, subcategory(category, mcc), kind(category), amount, balance, merchant, mcc)


@lru_cache(maxsize=512)
def load_customer(customer_id: str) -> Customer | None:
    con = _con()
    c = con.execute("SELECT customer_id, postal_code, age FROM customers WHERE customer_id = ?", (customer_id,)).fetchone()
    if c is None:
        return None
    rows = con.execute(
        "SELECT date, ts, category, amount, balance, merchant_id, mcc FROM tx WHERE customer_id = ? ORDER BY ts, rowid",
        (customer_id,),
    ).fetchall()
    return Customer(c["customer_id"], c["postal_code"], c["age"], tuple(make_tx(*r) for r in rows))
