from datetime import date, timedelta

import pytest

from app import engine
from app.taxonomy import basket_for

from .conftest import TODAY


def test_basket_rules():
    assert basket_for("Housing", "housing", -800) == "regular"
    assert basket_for("Transportation", "public_transport", -3) == "regular"
    assert basket_for("Transportation", "taxis", -30) == "everyday"
    assert basket_for("Health", "dentists", -90) == "irregular"
    assert basket_for("Home & Tech", "electronics", -600) == "irregular"
    assert basket_for("Home & Tech", "electronics", -20) == "everyday"
    assert basket_for("Restaurants", "fast_food_cafes", -4) == "everyday"
    assert basket_for("Restaurants", "fast_food_cafes", -4, {"fast_food_cafes": "regular"}) == "regular"
    assert basket_for("Restaurants", "bars", -4, {"Restaurants": "regular"}) == "regular"


def test_overview_september(customer):
    ov = engine.overview(customer, date(2026, 9, 1), date(2026, 9, 30))
    assert ov["income"]["salary"] == 2500.0
    # 4 Saturdays in Sep 2026 (5, 12, 19, 26); Mon/Wed/Fri count is 13.
    assert ov["spending"]["by_category"]["Groceries"] == 280.0
    assert ov["spending"]["by_category"]["Restaurants"] == 4 * 40 + 13 * 4
    assert ov["spending"]["by_basket"]["regular"] == 800 + 60 + 280
    assert ov["spending"]["by_basket"]["everyday"] == 4 * 40 + 13 * 4 + 30
    assert ov["net_change"] == pytest.approx(2500 - ov["spending"]["total"])


def test_full_months():
    assert engine.full_months(date(2026, 9, 30), 3) == ["2026-07", "2026-08", "2026-09"]
    assert engine.full_months(date(2026, 9, 29), 2) == ["2026-07", "2026-08"]
    assert engine.full_months(date(2026, 1, 15), 2) == ["2025-11", "2025-12"]


def test_recurring(customer):
    rec = engine.recurring(customer, TODAY)
    assert rec["salary"]["typical_amount"] == 2500.0
    assert rec["salary"]["next_date"] == "2026-10-15"
    assert rec["housing"]["typical_amount"] == 800.0
    assert rec["housing"]["next_date"] == "2026-10-02"
    assert rec["saving"] is None and rec["other_bank_transfer"] is None


def test_safe_to_spend(customer):
    s = engine.safe_to_spend(customer, TODAY)
    assert s["days_to_payday"] == 15
    due = {u["item"]: u["amount"] for u in s["balance_view"]["still_due_before_payday"]}
    assert due["housing"] == 800.0
    assert due["bills"] == pytest.approx(60 * 3 / 90 * 15)
    assert s["balance_view"]["available"] == pytest.approx(s["balance"] - sum(due.values()) - 100, abs=0.02)
    # Since the salary on 15 Sep: Saturdays 19 and 26 (2 x 40), cafes on 16,18,21,23,25,28,30 (7 x 4), taxi 30.
    assert s["income_view"]["everyday_spent_since_payday"] == 2 * 40 + 7 * 4 + 30
    assert s["safe_until_payday"] == pytest.approx(max(0, min(s["balance_view"]["available"], s["income_view"]["left"])))
    assert s["safe_per_day"] == pytest.approx(s["safe_until_payday"] / 15, abs=0.01)
    assert s["safe_this_week"] == pytest.approx(s["safe_per_day"] * 7, abs=0.05)


def test_safe_to_spend_never_negative(customer):
    poor = type(customer)(
        customer.id,
        customer.postal_code,
        customer.age,
        tuple(t.__class__(t.date, t.ts, t.category, t.sub, t.kind, t.amount, t.balance - 20000, t.merchant, t.mcc) for t in customer.txs),
    )
    s = engine.safe_to_spend(poor, TODAY)
    assert s["safe_until_payday"] == 0 and s["status"] == "stop" and s["limited_by"] == "balance"
    assert any(i["type"] == "overdraft_risk" for i in engine.insights(poor, TODAY))
    assert not any(i["type"] == "saving_room" for i in engine.insights(poor, TODAY))


def test_what_if_restaurants(customer):
    w = engine.what_if(customer, TODAY, "Restaurants", -20)
    assert w["freed_monthly"] == pytest.approx(w["baseline_monthly"] * 0.2, abs=0.01)
    assert w["freed_yearly"] == pytest.approx(w["freed_monthly"] * 12, abs=0.1)
    assert w["accumulated_over_horizon"] == pytest.approx(w["freed_monthly"] * 12, abs=0.1)
    grown = engine.what_if(customer, TODAY, "restaurants", -20, 120, 5.0)
    assert grown["accumulated_over_horizon"] > grown["freed_monthly"] * 120
    assert engine.what_if(customer, TODAY, "taxis", -50)["matched_transactions"] == 1
    assert engine.what_if(customer, TODAY, "nonsense", -50)["matched_transactions"] == 0


def test_baskets_shares_sum_to_one(customer):
    b = engine.baskets_summary(customer, TODAY)
    assert sum(x["share"] for x in b["baskets"].values()) == pytest.approx(1, abs=0.01)
    assert b["baskets"]["irregular"]["largest"][0]["amount"] == 600.0
    moved = engine.baskets_summary(customer, TODAY, overrides={"Restaurants": "regular"})
    assert moved["baskets"]["regular"]["monthly"] > b["baskets"]["regular"]["monthly"]


def test_explore_taxis_and_grouping(customer):
    e = engine.explore(customer, date(2026, 9, 1), date(2026, 9, 30), subs=["taxis"])
    assert e["total"] == 30.0 and e["count"] == 1
    g = engine.explore(customer, date(2026, 9, 1), date(2026, 9, 30), group_by=["weekday"], categories=["Restaurants"])
    assert [x["key"][0] for x in g["groups"]] == ["Mon", "Wed", "Fri", "Sat"]
    assert sum(x["total"] for x in g["groups"]) == g["total"]


def test_run_sql_is_read_only_and_private(customer):
    ok = engine.run_sql(customer, "SELECT ROUND(SUM(spend_eur)) FROM transactions WHERE subcategory = 'taxis'")
    assert ok["rows"] == [[30.0]]
    for bad in (
        "DELETE FROM transactions",
        "DROP TABLE transactions",
        "ATTACH DATABASE 'x.db' AS x",
        "PRAGMA database_list",
        "UPDATE transactions SET amount_eur = 0",
    ):
        assert "error" in engine.run_sql(customer, bad)
    assert engine.run_sql(customer, "SELECT COUNT(*) FROM transactions")["rows"][0][0] == len(customer.txs)
    slow = engine.run_sql(customer, "WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n) SELECT COUNT(*) FROM n")
    assert "error" in slow


def test_profile_and_save(customer):
    p = engine.spender_profile(customer, TODAY)
    assert p["archetype"] in engine.ARCHETYPES
    assert sum(p["basket_shares"].values()) == pytest.approx(1, abs=0.01)
    assert p["traits"]["small_purchases_per_month"] > 10
    s = engine.safe_to_save(customer, TODAY)
    assert s["suggested_monthly"] % 10 == 0 and s["suggested_monthly"] <= max(0, s["monthly_surplus"]["median"])
    assert s["emergency_fund"]["target"] == pytest.approx(3 * s["emergency_fund"]["monthly_mandatory"], abs=0.05)


def test_empty_window_is_safe(customer):
    assert engine.overview(customer, TODAY + timedelta(days=1), TODAY + timedelta(days=5))["spending"]["total"] == 0
