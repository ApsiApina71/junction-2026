"""Build data/sbank.db from the raw CSVs. Usage: python3 -I ingest.py <tx.csv> <repo_dir> <out.db>"""

import csv
import datetime
import os
import sqlite3
import sys

tx_csv, repo, out = sys.argv[1:4]
if os.path.exists(out):
    os.remove(out)
db = sqlite3.connect(out)
db.executescript("""
PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
CREATE TABLE customers(customer_id TEXT PRIMARY KEY, postal_code TEXT, age INTEGER);
CREATE TABLE tx(customer_id TEXT, account_id TEXT, date TEXT, ts TEXT, category TEXT, amount REAL, balance REAL, type TEXT, merchant_id TEXT, mcc TEXT);
CREATE TABLE mortgage_final(mortgage_customer_id TEXT, customer_id TEXT, final_decision TEXT, rejection_reason TEXT, property_price REAL, requested_loan REAL, equity REAL, collateral_value REAL, required_monthly_income REAL, ltv REAL);
CREATE TABLE mortgage_events(mortgage_customer_id TEXT, ts TEXT, event_type TEXT, property_id TEXT, property_type TEXT, property_price_estimate REAL, loan_amount REAL, equity_amount REAL, collateral_type TEXT, collateral_value REAL, collateral_status TEXT, decision TEXT, rejection_reason TEXT, expense_type TEXT, expense_amount REAL, note TEXT);
""")


def ts(s):  # 03OCT24:09:04:04 -> ISO
    return datetime.datetime.strptime(s, "%d%b%y:%H:%M:%S").strftime("%Y-%m-%d %H:%M:%S")


def num(s):
    return float(s) if s not in ("", ".") else None


def txt(s):
    return s if s not in ("", ".") else None


def rows(p):
    with open(p, encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)


db.executemany(
    "INSERT INTO customers VALUES(?,?,?)",
    ((r["customer_id"], r["customer_postal_code"].zfill(5), int(r["customer_age"])) for r in rows(os.path.join(repo, "tx_customers_junction.csv"))),
)
db.executemany(
    "INSERT INTO tx VALUES(?,?,?,?,?,?,?,?,?,?)",
    (
        (
            r["customer_id"],
            r["bank_account_id"],
            r["tx_date"],
            ts(r["tx_timestamp"]),
            r["category"],
            float(r["tx_amount_eur"]),
            float(r["balance_after_eur"]),
            r["transaction_type"],
            txt(r["merchant_id"]),
            txt(r["mcc_code"]),
        )
        for r in rows(tx_csv)
    ),
)
db.executemany(
    "INSERT INTO mortgage_final VALUES(?,?,?,?,?,?,?,?,?,?)",
    (
        (
            r["mortgage_customer_id"],
            r["customer_id"],
            r["final_decision"],
            txt(r["rejection_reason"]),
            num(r["final_property_price_eur"]),
            num(r["final_requested_loan_eur"]),
            num(r["final_equity_amount_eur"]),
            num(r["final_collateral_value_eur"]),
            num(r["required_monthly_income_eur"]),
            num(r["lfinal_loan_to_value"]),
        )
        for r in rows(os.path.join(repo, "mtg_tx_customer_link_and_final_mtg_infio.csv"))
    ),
)
db.executemany(
    "INSERT INTO mortgage_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    (
        (
            r["mortgage_customer_id"],
            ts(r["timestamp"]),
            r["event_type"],
            txt(r["property_id"]),
            txt(r["property_type"]),
            num(r["property_price_estimate"]),
            num(r["loan_amount"]),
            num(r["equity_amount"]),
            txt(r["collateral_type"]),
            num(r["collateral_value"]),
            txt(r["collateral_status"]),
            txt(r["decision"]),
            txt(r["rejection_reason"]),
            txt(r["expense_type"]),
            num(r["expense_amount"]),
            r["note"],
        )
        for r in rows(os.path.join(repo, "mtg_negotiation_history.csv"))
    ),
)
db.executescript("CREATE INDEX tx_cust ON tx(customer_id, ts); CREATE INDEX me_c ON mortgage_events(mortgage_customer_id, ts); ANALYZE;")
db.commit()
for t in ("customers", "tx", "mortgage_final", "mortgage_events"):
    print(t, db.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0])
