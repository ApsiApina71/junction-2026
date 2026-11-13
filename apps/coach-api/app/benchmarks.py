"""Benchmarks: peers in the same age group (from the dataset) and open data from Statistics Finland."""

import bisect
import json
from datetime import date, timedelta
from functools import lru_cache
from pathlib import Path

from . import engine
from .db import DB_PATH, Customer
from .taxonomy import BASKETS, SPEND_CATEGORIES

DATA = Path(__file__).resolve().parent / "data"
PEERS_PATH = DB_PATH.parent / "peers.json"
AGE_BANDS = ((18, 24), (25, 34), (35, 44), (45, 54), (55, 64), (65, 74), (75, 200))
# Statistics Finland age groups of the household reference person, in the same order.
STATFIN_AGE = ("17 - 24", "25 - 34", "35 - 44", "45 - 54", "55 - 64", "65 - 74", "75 - 84")
# Our categories -> COICOP 2018 divisions in the Household Budget Survey.
COICOP = {
    "Groceries": ["01"],
    "Restaurants": ["11"],
    "Transportation": ["07"],
    "Health": ["06"],
    "Housing + Utilities": ["04"],
    "Entertainment": ["09"],
    "Home & Tech": ["05"],
}


def age_band(age: int) -> int:
    return next(i for i, (lo, hi) in enumerate(AGE_BANDS) if lo <= age <= hi)


def band_label(i: int) -> str:
    lo, hi = AGE_BANDS[i]
    return f"{lo}+" if hi > 120 else f"{lo}-{hi}"


def customer_metrics(c: Customer, today: date) -> dict[str, float]:
    """Monthly figures over the last 180 days, used for both the customer and their peers."""
    ov = engine.overview(c, today - timedelta(days=179), today)
    m = 180 / engine.MONTH_DAYS
    out = {cat: ov["spending"]["by_category"].get(cat, 0.0) / m for cat in SPEND_CATEGORIES}
    for b in BASKETS:
        out[f"basket:{b}"] = ov["spending"]["by_basket"][b] / m
    out["spending"] = ov["spending"]["total"] / m
    income = ov["income"]["total"] - ov["moved_to_other_bank"]
    out["income"] = income / m
    out["invested"] = ov["invested"] / m
    out["savings_rate"] = ov["invested"] / income if income > 0 else 0.0
    return {k: round(v, 4 if k == "savings_rate" else 2) for k, v in out.items()}


@lru_cache(maxsize=1)
def _peers() -> dict:
    if not PEERS_PATH.exists():
        return {}
    return json.loads(PEERS_PATH.read_text())


@lru_cache(maxsize=1)
def _open_data() -> dict:
    return {name: json.loads((DATA / f"{name}.json").read_text()) for name in ("paavo", "consumption", "cpi")}


def _percentile(sorted_values: list[float], v: float) -> int:
    if not sorted_values:
        return 50
    return round(100 * bisect.bisect_left(sorted_values, v) / len(sorted_values))


def _median(sorted_values: list[float]) -> float:
    return sorted_values[len(sorted_values) // 2] if sorted_values else 0.0


def benchmark(c: Customer, today: date) -> dict:
    mine = customer_metrics(c, today)
    band = age_band(c.age)
    peers = _peers().get(str(band), {})
    peer_rows = {}
    for metric, value in mine.items():
        vals = peers.get(metric, [])
        peer_rows[metric] = {"you": value, "peer_median": round(_median(vals), 2), "percentile": _percentile(vals, value)}

    od = _open_data()
    cons, cpi, paavo = od["consumption"], od["cpi"], od["paavo"]
    factor = cpi["derived"]["factor_survey_year_to_latest_month"]
    sf_age = STATFIN_AGE[band]
    per_cu = cons["by_age_group_per_consumption_unit"].get(sf_age, {})
    national = []
    for label, codes in COICOP.items():
        yearly = sum(per_cu.get(code) or 0 for code in codes)
        you = mine["Housing"] + mine["Utilities"] if label == "Housing + Utilities" else mine[label]
        national.append(
            {
                "category": label,
                "you_monthly": round(you, 2),
                "finland_monthly": round(yearly * factor / 12, 2),
                "coicop": codes,
                "coicop_label": "; ".join(cons["all_households"][code]["label"] for code in codes),
            }
        )
    area = paavo["areas"].get(c.postal_code)
    area_out = None
    if area and area.get("median_income_person"):
        area_out = {
            "postal_code": c.postal_code,
            "name": area["name"],
            "municipality": area.get("municipality"),
            "median_income_per_person_monthly": round(area["median_income_person"] / 12, 2),
            "finland_median_income_per_person_monthly": round(paavo["whole_country"]["median_income_person"] / 12, 2),
            "your_income_monthly": mine["income"],
            "year": paavo["source"]["year_dimension_selected"],
        }
    return {
        "peers": {
            "group": f"S-Bank customers aged {band_label(band)} in this dataset",
            "group_size": len(peers.get("spending", [])),
            "metrics": peer_rows,
            "note": "percentile = share of peers with a lower value; all figures are monthly averages over the last 180 days",
        },
        "statistics_finland": {
            "age_group_of_household_reference_person": sf_age,
            "rows": national,
            "note": (
                f"Household Budget Survey {cons['source']['survey_year']}, euros per consumption unit (roughly one adult), "
                f"inflated to {cpi['latest_monthly_period']} prices with the consumer price index (x{factor}). "
                "It covers all payment methods; your figure covers this account only."
            ),
            "source": "Statistics Finland, Household Budget Survey (table 14q4) and Consumer Price Index (table 11xs), CC BY 4.0",
        },
        "your_area": area_out,
        "your_area_source": "Statistics Finland, Paavo open data by postal code area: disposable monetary income of inhabitants aged 18+, CC BY 4.0",
    }
