#!/usr/bin/env python3
"""Fetch open benchmark data from Statistics Finland's PxWeb API.

Run:  python3 -I scripts/fetch-statfin.py
Writes paavo.json, consumption.json, cpi.json
into app/data/. Every number comes straight from the API responses;
the only derived values are the CPI ratios in cpi.json (marked "derived").
"""

import json
import os
import re
import sys
import time
import urllib.request

BASE = "https://pxdata.stat.fi/PXWeb/api/v1/en/"
UA = "Mozilla/5.0 (data-fetch script)"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "app", "data")
FETCHED = time.strftime("%Y-%m-%d")


def http(path, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8-sig"))
        except Exception as e:  # retry on rate limit / transient errors
            if attempt == 3:
                raise
            print("retry", path, e, file=sys.stderr)
            time.sleep(5)


def query(path, selections):
    """selections: {var_code: [values] or None (= all)} -> json-stat2 dataset."""
    q = []
    for code, vals in selections.items():
        if vals is None:
            q.append({"code": code, "selection": {"filter": "all", "values": ["*"]}})
        else:
            q.append({"code": code, "selection": {"filter": "item", "values": vals}})
    time.sleep(1)
    return http(path, {"query": q, "response": {"format": "json-stat2"}})


def cube(ds):
    """Return lookup(*codes in ds['id'] order) -> value (None if missing)."""
    ids, sizes, vals = ds["id"], ds["size"], ds["value"]
    idx = [ds["dimension"][i]["category"]["index"] for i in ids]

    def get(*codes):
        pos = 0
        for k, c in enumerate(codes):
            pos = pos * sizes[k] + idx[k][c]
        return vals[pos]

    return get


def labels(ds, dim):
    return ds["dimension"][dim]["category"]["label"]


def write(name, obj):
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    print("wrote", os.path.normpath(p), os.path.getsize(p), "bytes")


# ---------------------------------------------------------------- Paavo
def paavo():
    path = "Postinumeroalueittainen_avoin_tieto/2026/12f7_ja2026.px"
    meta = http(path)
    area_var = meta["variables"][0]["code"]
    years = meta["variables"][1]["values"]
    year = years[-1]
    fields = {
        "hr_mtu": "median_income_person",
        "hr_ktu": "avg_income_person",
        "tr_mtu": "median_income_household",
        "tr_ktu": "avg_income_household",
        "he_vakiy": "inhabitants",
        "he_kika": "avg_age",
    }
    ds = query(path, {area_var: None, "timeperiod_y": [year], "contentscode": list(fields)})
    assert ds["id"] == [area_var, "timeperiod_y", "contentscode"], ds["id"]
    get = cube(ds)
    cc = ds["dimension"]["contentscode"]["category"]
    areas = {}
    whole = None
    for code, text in labels(ds, area_var).items():
        row = {out: get(code, year, c) for c, out in fields.items()}
        if code == "SSS":
            whole = dict(name=text, **row)
            continue
        m = re.match(r"^\d{5}\s+(.*?)(?:\s+\(([^()]*)\))?$", text)
        entry = {"name": m.group(1).strip(), "municipality": m.group(2)}
        entry.update(row)
        areas[code] = entry
    source = {
        "publisher": "Statistics Finland (Tilastokeskus), Paavo - Open data by postal code area",
        "title": ds["label"],
        "table_id": ds["extension"]["px"]["tableid"],
        "table_description": ds["extension"]["px"]["description"],
        "url": BASE + path,
        "api_updated": ds.get("updated"),
        "year_dimension_selected": year,
        "years_available_in_table": [years[0], years[-1]],
        "reference_year_notes": (
            "Table is from the folder 'Data published in 2026' (postal code area division 2026). "
            "It has a Year dimension (%s-%s); all values here are for Year=%s, the latest year in the table, "
            "for both population (HE, situation 31 December) and income (HR, TR) variables. "
            "Metadata states: 'Data in euros are given in the value of the statistical year.' "
            "Income = annual disposable monetary income in euros; HR variables concern inhabitants aged 18 or over." % (years[0], years[-1], year)
        ),
        "variables": {
            out: {"code": c, "label": cc["label"][c], "unit": cc["unit"][c]["base"], "note": " ".join(cc.get("note", {}).get(c, []))}
            for c, out in fields.items()
        },
        "missing_values": "null = confidential/suppressed ('...') or missing in the API response",
        "table_notes": [
            n
            for n in ds.get("note", [])
            if n.startswith(
                (
                    "...",
                    "INHABITANTS' DISPOSABLE",
                    "HOUSEHOLDS' DISPOSABLE",
                    "Current transfers",
                    "Data in euros",
                    "Data protection:\r\nData on income",
                    "Data protection:\r\nData on the income",
                    "Data protection:\r\nData on population",
                )
            )
        ],
        "licence": "CC BY 4.0, Statistics Finland",
        "fetched": FETCHED,
    }
    cap = {k: v for k, v in areas.items() if k[:2] in ("00", "01", "02")}
    write("paavo.json", {"source": dict(source, scope="postal code areas starting with 00, 01, 02"), "whole_country": whole, "areas": cap})


# ---------------------------------------------------------- Consumption
MAIN = ["0", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13"]
C_HH = "kulu_kt_hk_1_1"
C_CU = "kulu_kt_hk_2_1"


def consumption_table(tid):
    path = "StatFin/ktutk/%s.px" % tid
    meta = http(path)
    codes = [v["code"] for v in meta["variables"]]
    year = meta["variables"][0]["values"][-1]
    coicop, group = codes[1], codes[2]
    ds = query(path, {"timeperiod_y": [year], coicop: MAIN, group: None, "contentscode": [C_HH, C_CU]})
    assert ds["id"] == ["timeperiod_y", coicop, group, "contentscode"], ds["id"]
    get = cube(ds)
    glab = labels(ds, group)
    clab = labels(ds, coicop)
    hh = {glab[g]: {c: get(year, c, g, C_HH) for c in MAIN} for g in glab}
    cu = {glab[g]: {c: get(year, c, g, C_CU) for c in MAIN} for g in glab}
    info = {
        "title": ds["label"],
        "table_id": ds["extension"]["px"]["tableid"],
        "table_description": ds["extension"]["px"]["description"],
        "url": BASE + path,
        "api_updated": ds.get("updated"),
        "contents": {k: labels(ds, "contentscode")[k] for k in (C_HH, C_CU)},
    }
    return year, clab, hh, cu, info, ds


def consumption():
    year, clab, age_hh, age_cu, age_info, ds = consumption_table("14q4")
    _, _, q_hh, q_cu, q_info, _ = consumption_table("14pg")
    _, _, t_hh, t_cu, t_info, _ = consumption_table("14ph")
    total_key = "Total"
    allh = {}
    for c in MAIN:
        allh[c] = {
            "label": re.sub(r"^\d+\s+", "", clab[c]),
            "eur_per_household_year": age_hh[total_key][c],
            "eur_per_consumption_unit_year": age_cu[total_key][c],
        }
    out = {
        "source": {
            "publisher": "Statistics Finland (Tilastokeskus), Households' consumption (Household Budget Survey, ktutk)",
            "title": age_info["title"],
            "table_id": age_info["table_id"],
            "url": age_info["url"],
            "tables": {"by_age_group": age_info, "by_income_quintile": q_info, "by_household_type": t_info},
            "survey_year": int(year),
            "unit": "EUR per year at current prices (prices of the survey year %s); per household, and per consumption unit in the *_per_consumption_unit keys"
            % year,
            "classification": "COICOP main divisions as used in the table (13 divisions, 01-13, plus 0 = Total). Note 12 = Insurance and financial services and 13 = Personal care, social protection and miscellaneous are separate divisions.",
            "all_households_from": "table 14q4, Reference person's age = Total",
            "table_notes": ds.get("note", []),
            "licence": "CC BY 4.0, Statistics Finland",
            "fetched": FETCHED,
        },
        "all_households": allh,
        "by_age_group": {k: v for k, v in age_hh.items() if k != total_key},
        "by_age_group_per_consumption_unit": {k: v for k, v in age_cu.items() if k != total_key},
        "by_income_quintile": {k: v for k, v in q_hh.items() if k != total_key},
        "by_income_quintile_per_consumption_unit": {k: v for k, v in q_cu.items() if k != total_key},
        "by_household_type": {k: v for k, v in t_hh.items() if k != total_key},
        "by_household_type_per_consumption_unit": {k: v for k, v in t_cu.items() if k != total_key},
    }
    # cross-check: the Total column must agree across the three tables
    for c in MAIN:
        assert age_hh[total_key][c] == q_hh[total_key][c] == t_hh[total_key][c], c
    write("consumption.json", out)
    return int(year)


# ------------------------------------------------------------------ CPI
def cpi(survey_year):
    ypath, mpath = "StatFin/khi/11xt.px", "StatFin/khi/11xs.px"
    ymeta = http(ypath)
    ylast = ymeta["variables"][0]["values"][-1]
    yds = query(ypath, {"timeperiod_y": [str(survey_year), ylast], "indeksisarja_1_20160101": ["0_2015"], "contentscode": ["Pisteluku"]})
    assert yds["id"] == ["timeperiod_y", "indeksisarja_1_20160101", "contentscode"], yds["id"]
    yget = cube(yds)
    a_survey = yget(str(survey_year), "0_2015", "Pisteluku")
    a_last = yget(ylast, "0_2015", "Pisteluku")

    mmeta = http(mpath)
    mlast = mmeta["variables"][0]["values"][-1]
    mds = query(mpath, {"timeperiod_m": [mlast], "contentscode": ["ip_0_2015", "ip_0_2025"]})
    assert mds["id"] == ["timeperiod_m", "contentscode"], mds["id"]
    mget = cube(mds)
    m_2015 = mget(mlast, "ip_0_2015")
    m_2025 = mget(mlast, "ip_0_2025")

    def ratio(a, b):
        return round(a / b, 4) if a is not None and b else None

    write(
        "cpi.json",
        {
            "source": {
                "publisher": "Statistics Finland (Tilastokeskus), Consumer price index (khi)",
                "annual": {
                    "title": yds["label"],
                    "table_id": yds["extension"]["px"]["tableid"],
                    "table_description": yds["extension"]["px"]["description"],
                    "url": BASE + ypath,
                    "api_updated": yds.get("updated"),
                },
                "monthly": {
                    "title": mds["label"],
                    "table_id": mds["extension"]["px"]["tableid"],
                    "table_description": mds["extension"]["px"]["description"],
                    "url": BASE + mpath,
                    "api_updated": mds.get("updated"),
                },
                "series": "Consumer Price Index, overall index, point figures",
                "licence": "CC BY 4.0, Statistics Finland",
                "fetched": FETCHED,
            },
            "base_2015_100": {
                "annual": {str(survey_year): a_survey, ylast: a_last},
                "monthly": {mlast: m_2015},
            },
            "base_2025_100": {"monthly": {mlast: m_2025}},
            "survey_year": survey_year,
            "latest_annual_period": ylast,
            "latest_monthly_period": mlast,
            "derived": {
                "note": "Computed by this script from the 2015=100 point figures above (not API values). Multiply survey-year euros by the factor.",
                "factor_survey_year_to_latest_annual": ratio(a_last, a_survey),
                "factor_survey_year_to_latest_month": ratio(m_2015, a_survey),
            },
        },
    )


if __name__ == "__main__":
    paavo()
    sy = consumption()
    cpi(sy)
