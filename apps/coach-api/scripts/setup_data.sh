#!/bin/sh
# Download the Junction 2026 S-Pankki dataset and build data/sbank.db and data/peers.json.
# Run from apps/coach-api: sh scripts/setup_data.sh
set -eu
RAW=data/raw
BASE=https://raw.githubusercontent.com/hackjunction/Junction-2026-S-pankki/main
LFS=https://media.githubusercontent.com/media/hackjunction/Junction-2026-S-pankki/main
mkdir -p "$RAW"
for f in tx_customers_junction.csv mtg_negotiation_history.csv mtg_tx_customer_link_and_final_mtg_infio.csv; do
  [ -s "$RAW/$f" ] || curl -fsSL -o "$RAW/$f" "$BASE/$f"
done
[ -s "$RAW/tx_junction_transactions.csv" ] || curl -fSL -o "$RAW/tx_junction_transactions.csv" "$LFS/tx_junction_transactions.csv"
uv run python scripts/ingest.py "$RAW/tx_junction_transactions.csv" "$RAW" data/sbank.db
uv run python -m scripts.build_peers
