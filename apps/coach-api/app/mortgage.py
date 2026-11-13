"""Mortgage journey for the customers who have a mortgage application in the dataset."""

from datetime import date, timedelta

from . import engine
from .db import Customer, _con


def mortgage_story(c: Customer, today: date) -> dict | None:
    con = _con()
    final = con.execute("SELECT * FROM mortgage_final WHERE customer_id = ?", (c.id,)).fetchone()
    if final is None:
        return None
    events = con.execute(
        "SELECT ts, event_type, property_type, property_price_estimate, loan_amount, equity_amount, collateral_type, collateral_value, "
        "collateral_status, decision, rejection_reason, expense_type, expense_amount, note FROM mortgage_events WHERE mortgage_customer_id = ? ORDER BY ts",
        (final["mortgage_customer_id"],),
    ).fetchall()
    ov = engine.overview(c, today - timedelta(days=179), today)
    m = 180 / engine.MONTH_DAYS
    income = (ov["income"]["salary"] - ov["moved_to_other_bank"]) / m
    required = final["required_monthly_income"]
    return {
        "decision": final["final_decision"],
        "rejection_reason": final["rejection_reason"],
        "property_price": final["property_price"],
        "requested_loan": final["requested_loan"],
        "own_equity": final["equity"],
        "collateral_value": final["collateral_value"],
        "loan_to_value": round(final["ltv"], 3) if final["ltv"] is not None else None,
        "required_monthly_income": round(required, 2) if required is not None else None,
        "observed_monthly_salary_on_this_account": round(income, 2),
        "income_gap": round(max(0.0, required - income), 2) if required is not None else None,
        "current_monthly_housing_cost": round(ov["spending"]["by_category"].get("Housing", 0.0) / m, 2),
        "timeline": [
            {k: v for k, v in dict(e).items() if v is not None and (k != "note" or e["event_type"] in ("loan_decision", "loan_calculation"))} for e in events
        ],
    }
