"""Precompute peer distributions per age band into data/peers.json. Run: uv run python -m scripts.build_peers"""

import json
from collections import defaultdict

from app import benchmarks, db

today = db.today()
out: dict[int, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
ids = [r[0] for r in db.connect().execute("SELECT customer_id FROM customers")]
for n, cid in enumerate(ids):
    c = db.load_customer(cid)
    for k, v in benchmarks.customer_metrics(c, today).items():
        out[benchmarks.age_band(c.age)][k].append(v)
    if n % 1000 == 0:
        db.load_customer.cache_clear()
result = {str(b): {k: sorted(v) for k, v in ms.items()} for b, ms in out.items()}
benchmarks.PEERS_PATH.write_text(json.dumps(result))
print({benchmarks.band_label(int(b)): len(ms["spending"]) for b, ms in sorted(result.items())})
