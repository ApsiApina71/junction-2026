"""Build data/demo.db: only the demo personas (and their mortgage rows), a few MB instead of 550.

Peer benchmarks do not need the full database at run time: data/peers.json is precomputed from all 5,100 customers.
Run after setup_data.sh:  uv run python -m scripts.make_demo_db   then start the API with SBANK_DB=data/demo.db
"""

import sqlite3

from app import db
from app.main import PERSONAS

out = db.DB_PATH.parent / "demo.db"
out.unlink(missing_ok=True)
ids = [p["id"] for p in PERSONAS]
marks = ",".join("?" * len(ids))
con = sqlite3.connect(out)
con.execute("ATTACH DATABASE ? AS full", (f"file:{db.DB_PATH}?mode=ro",))
for table, where in (
    ("customers", f"customer_id IN ({marks})"),
    ("tx", f"customer_id IN ({marks})"),
    ("mortgage_final", f"customer_id IN ({marks})"),
    ("mortgage_events", f"mortgage_customer_id IN (SELECT mortgage_customer_id FROM full.mortgage_final WHERE customer_id IN ({marks}))"),
):
    con.execute(f"CREATE TABLE {table} AS SELECT * FROM full.{table} WHERE {where}", ids)
con.execute("CREATE INDEX tx_cust ON tx(customer_id, ts)")
# The demo's "today" is the last day of the whole dataset, not of these six customers.
last = con.execute("SELECT MAX(date) FROM full.tx").fetchone()[0]
con.execute("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT)")
con.execute("INSERT INTO meta VALUES('today', ?)", (last,))
con.commit()
print({t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("customers", "tx", "mortgage_final", "mortgage_events")}, "today", last)
con.close()
con = sqlite3.connect(out)
con.execute("VACUUM")
con.close()
print(out, round(out.stat().st_size / 1e6, 2), "MB")
