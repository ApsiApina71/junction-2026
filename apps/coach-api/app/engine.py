"""The finance engine: every number the coach says comes from these pure functions.

All functions take a Customer and an explicit `today`, so they are deterministic and testable.
Money out is reported as positive euros in results.
"""

import calendar
import sqlite3
import statistics
from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta

from .db import Customer, Tx
from .taxonomy import BASKETS, basket_for

MONTH_DAYS = 30.4375
MIN_CUSHION_EUR = 100.0
SMALL_PURCHASE_EUR = 10.0
Overrides = dict[str, str] | None


def r2(x: float) -> float:
    return round(x + 0.0, 2)


def _between(txs: Iterable[Tx], start: date, end: date) -> list[Tx]:
    return [t for t in txs if start <= t.date <= end]


def _spend(txs: Iterable[Tx]) -> float:
    return -sum(t.amount for t in txs if t.kind == "spend")


def _basket(t: Tx, overrides: Overrides) -> str:
    return basket_for(t.category, t.sub, t.amount, overrides)


def _months(days: int) -> float:
    return days / MONTH_DAYS


def _clamp_day(year: int, month: int, day: int) -> date:
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def _next_month(d: date) -> tuple[int, int]:
    return (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)


def month_key(d: date) -> str:
    return f"{d.year}-{d.month:02d}"


def full_months(today: date, n: int) -> list[str]:
    """The last n complete calendar months. The current month counts once it has ended."""
    y, m = today.year, today.month
    if today.day != calendar.monthrange(y, m)[1]:
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    out = []
    for _ in range(n):
        out.append(f"{y}-{m:02d}")
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
    return out[::-1]


# --------------------------------------------------------------------------- overview


def overview(c: Customer, start: date, end: date, overrides: Overrides = None) -> dict:
    txs = _between(c.txs, start, end)
    baskets = dict.fromkeys(BASKETS, 0.0)
    cats: dict[str, float] = defaultdict(float)
    salary = other = invested = withdrawn = swept = 0.0
    for t in txs:
        if t.kind == "spend":
            baskets[_basket(t, overrides)] -= t.amount
            cats[t.category] -= t.amount
        elif t.category == "Salary":
            salary += t.amount
        elif t.category == "Other Income":
            other += t.amount
        elif t.category == "Invest Deposit":
            invested -= t.amount
        elif t.category == "Invest Withdraw":
            withdrawn += t.amount
        elif t.category == "Salary Sweep":
            swept -= t.amount
    spend = sum(baskets.values())
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "days": (end - start).days + 1},
        "income": {"salary": r2(salary), "other": r2(other), "total": r2(salary + other)},
        "spending": {
            "total": r2(spend),
            "by_basket": {k: r2(v) for k, v in baskets.items()},
            "by_category": {k: r2(v) for k, v in sorted(cats.items(), key=lambda kv: -kv[1])},
        },
        "invested": r2(invested),
        "investment_withdrawals": r2(withdrawn),
        "moved_to_other_bank": r2(swept),
        "net_change": r2(salary + other + withdrawn - spend - invested - swept),
        "transactions": len(txs),
    }


def monthly_series(c: Customer, today: date, months: int = 12, overrides: Overrides = None) -> list[dict]:
    keys = full_months(today, months)
    rows = {k: {"month": k, "income": 0.0, "regular": 0.0, "irregular": 0.0, "everyday": 0.0, "invested": 0.0, "moved_to_other_bank": 0.0} for k in keys}
    for t in c.txs:
        row = rows.get(month_key(t.date))
        if row is None:
            continue
        if t.kind == "spend":
            row[_basket(t, overrides)] -= t.amount
        elif t.kind == "income":
            row["income"] += t.amount
        elif t.category == "Invest Deposit":
            row["invested"] -= t.amount
        elif t.category == "Salary Sweep":
            row["moved_to_other_bank"] -= t.amount
    out = []
    for row in rows.values():
        row = {k: (r2(v) if isinstance(v, float) else v) for k, v in row.items()}
        row["spending"] = r2(row["regular"] + row["irregular"] + row["everyday"])
        row["net"] = r2(row["income"] - row["spending"] - row["invested"] - row["moved_to_other_bank"])
        out.append(row)
    return out


# --------------------------------------------------------------------------- baskets


def baskets_summary(c: Customer, today: date, days: int = 180, overrides: Overrides = None) -> dict:
    """Where the money really goes: the three baskets as monthly averages."""
    start = today - timedelta(days=days - 1)
    txs = [t for t in _between(c.txs, start, today) if t.kind == "spend"]
    m = _months(days)
    total = _spend(txs)
    out = {}
    for b in BASKETS:
        mine = [t for t in txs if _basket(t, overrides) == b]
        by_sub: dict[str, list[Tx]] = defaultdict(list)
        for t in mine:
            by_sub[t.sub].append(t)
        subs = sorted(
            ({"sub": s, "category": v[0].category, "monthly": r2(_spend(v) / m), "purchases_per_month": round(len(v) / m, 1)} for s, v in by_sub.items()),
            key=lambda x: -x["monthly"],
        )
        biggest = sorted(mine, key=lambda t: t.amount)[:3]
        spent = _spend(mine)
        out[b] = {
            "monthly": r2(spent / m),
            "share": round(spent / total, 3) if total else 0.0,
            "purchases_per_month": round(len(mine) / m, 1),
            "top": subs[:6],
            "largest": [{"date": t.date.isoformat(), "sub": t.sub, "amount": r2(-t.amount)} for t in biggest],
        }
    return {"period_days": days, "monthly_total": r2(total / m), "baskets": out}


# --------------------------------------------------------------------------- recurring


def _typical_day(dates: list[date]) -> int:
    """Typical day of month. Days 28+ are treated as 'end of month' (31)."""
    days = [31 if d.day >= 28 else d.day for d in dates]
    return int(statistics.median(days))


def _next_due(day: int, last: date | None, today: date) -> date:
    cand = _clamp_day(today.year, today.month, day)
    paid_this_month = last is not None and (last.year, last.month) == (today.year, today.month)
    if cand <= today or paid_this_month:
        y, m = _next_month(today)
        cand = _clamp_day(y, m, day)
    return cand


def recurring(c: Customer, today: date) -> dict:
    """Detected regular money movements: salary, housing, bills, saving habit, transfers to another bank."""
    recent = _between(c.txs, today - timedelta(days=200), today)

    def pattern(category: str, sign: float) -> dict | None:
        rows = [t for t in recent if t.category == category][-6:]
        if len(rows) < 3:
            return None
        day = _typical_day([t.date for t in rows])
        return {
            "typical_amount": r2(sign * statistics.median(t.amount for t in rows)),
            "typical_day": day,
            "last_date": rows[-1].date.isoformat(),
            "next_date": _next_due(day, rows[-1].date, today).isoformat(),
            "seen": len(rows),
        }

    util = [t for t in _between(c.txs, today - timedelta(days=179), today) if t.category == "Utilities"]
    return {
        "salary": pattern("Salary", 1),
        "housing": pattern("Housing", -1),
        "saving": pattern("Invest Deposit", -1),
        "other_bank_transfer": pattern("Salary Sweep", -1),
        "bills": {"monthly": r2(_spend(util) / _months(180)), "payments_per_month": round(len(util) / _months(180), 1)},
    }


# --------------------------------------------------------------------------- safe to spend


def _typicals(c: Customer, today: date, overrides: Overrides) -> dict:
    """Typical monthly figures: 180 days for steady things, 365 for lumpy ones."""
    w180 = _between(c.txs, today - timedelta(days=179), today)
    w365 = _between(c.txs, today - timedelta(days=364), today)
    m = _months(180)
    spend180 = [t for t in w180 if t.kind == "spend"]
    regular = sum(-t.amount for t in spend180 if _basket(t, overrides) == "regular") / m
    everyday = sum(-t.amount for t in spend180 if _basket(t, overrides) == "everyday") / m
    irregular = sum(-t.amount for t in w365 if t.kind == "spend" and _basket(t, overrides) == "irregular") / _months(365)
    deposits = [t for t in w180 if t.category == "Invest Deposit"]
    saving = -sum(t.amount for t in deposits) / m if len(deposits) >= 3 else 0.0
    return {"regular": regular, "everyday": everyday, "irregular": irregular, "saving": saving}


def safe_to_spend(c: Customer, today: date, overrides: Overrides = None) -> dict:
    """How much everyday money is safe to spend before the next payday.

    Two independent limits, and the lower one wins:
      balance view: balance now, minus what is still due before payday, minus a small cushion
      income view:  this pay cycle's everyday budget (pay minus commitments), minus what is already spent
    """
    rec = recurring(c, today)
    typ = _typicals(c, today, overrides)
    balance = c.txs[-1].balance if c.txs else 0.0
    salary = rec["salary"]
    if salary:
        payday = date.fromisoformat(salary["next_date"])
        last_payday = date.fromisoformat(salary["last_date"])
        pay = salary["typical_amount"]
    else:
        payday, last_payday, pay = today + timedelta(days=30), today - timedelta(days=30), 0.0
    days_left = max((payday - today).days, 1)
    sweep = rec["other_bank_transfer"]
    cycle_income = pay - (sweep["typical_amount"] if sweep else 0.0)

    # What still has to leave the account before payday.
    w90 = _between(c.txs, today - timedelta(days=89), today)
    util_daily = -sum(t.amount for t in w90 if t.category == "Utilities") / 90
    basics_daily = -sum(t.amount for t in w90 if t.kind == "spend" and t.category not in ("Housing", "Utilities") and _basket(t, overrides) == "regular") / 90
    upcoming = []
    housing = rec["housing"]
    if housing and today < date.fromisoformat(housing["next_date"]) <= payday:
        upcoming.append({"item": "housing", "amount": housing["typical_amount"], "due": housing["next_date"]})
    upcoming.append({"item": "bills", "amount": r2(util_daily * days_left)})
    upcoming.append({"item": "groceries_and_commute", "amount": r2(basics_daily * days_left)})
    upcoming.append({"item": "unexpected_reserve", "amount": r2(typ["irregular"] * days_left / MONTH_DAYS)})
    saving = rec["saving"]
    if saving and typ["saving"] > 0 and today < date.fromisoformat(saving["next_date"]) <= payday:
        upcoming.append({"item": "planned_saving", "amount": saving["typical_amount"], "due": saving["next_date"]})
    committed = sum(u["amount"] for u in upcoming)
    balance_view = balance - committed - MIN_CUSHION_EUR

    budget = cycle_income - typ["regular"] - typ["irregular"] - typ["saving"]
    # Everyday spending since the last salary landed (transactions are in time order).
    last_pay_idx = max((i for i, t in enumerate(c.txs) if t.category == "Salary"), default=-1)
    since = c.txs[last_pay_idx + 1 :] if salary else _between(c.txs, last_payday, today)
    spent = sum(-t.amount for t in since if t.kind == "spend" and _basket(t, overrides) == "everyday")
    income_view = budget - spent

    safe = max(0.0, min(balance_view, income_view))
    limit = "balance" if balance_view <= income_view else "income"
    per_day = safe / days_left
    typical_daily = typ["everyday"] / MONTH_DAYS
    if safe <= 0:
        status = "stop"
    elif per_day >= typical_daily:
        status = "comfortable"
    elif per_day >= 0.6 * typical_daily:
        status = "on_track"
    else:
        status = "tight"
    # Forecast at the usual pace. The reserve for the unexpected is a precaution, not a forecast, so it is left out here.
    reserve = sum(u["amount"] for u in upcoming if u["item"] == "unexpected_reserve")
    projected = balance - (committed - reserve) - typical_daily * days_left
    return {
        "today": today.isoformat(),
        "next_payday": payday.isoformat(),
        "days_to_payday": days_left,
        "balance": r2(balance),
        "safe_until_payday": r2(safe),
        "safe_per_day": r2(per_day),
        "safe_this_week": r2(per_day * min(7, days_left)),
        "status": status,
        "limited_by": limit,
        "balance_view": {"balance": r2(balance), "still_due_before_payday": upcoming, "cushion_kept": MIN_CUSHION_EUR, "available": r2(balance_view)},
        "income_view": {
            "pay_per_cycle": r2(cycle_income),
            "regular_essentials": r2(typ["regular"]),
            "unexpected_reserve": r2(typ["irregular"]),
            "saving_habit": r2(typ["saving"]),
            "everyday_budget": r2(budget),
            "everyday_spent_since_payday": r2(spent),
            "left": r2(income_view),
        },
        "typical_everyday_per_day": r2(typical_daily),
        "projected_balance_at_payday_at_usual_pace": r2(projected),
        "cushion_beyond_safe": r2(max(0.0, balance_view - safe)),
    }


# --------------------------------------------------------------------------- safe to save


def safe_to_save(c: Customer, today: date, overrides: Overrides = None) -> dict:
    """How much can move to savings without putting everyday life at risk."""
    series = monthly_series(c, today, 6, overrides)
    nets = sorted(row["net"] for row in series)
    median_net = statistics.median(nets) if nets else 0.0
    cautious_net = nets[len(nets) // 4] if nets else 0.0
    typ = _typicals(c, today, overrides)
    mandatory = typ["regular"] + typ["irregular"]
    target = 3 * mandatory
    balance = c.txs[-1].balance if c.txs else 0.0
    sts = safe_to_spend(c, today, overrides)
    due = sum(u["amount"] for u in sts["balance_view"]["still_due_before_payday"])
    if cautious_net > 0:
        monthly = cautious_net
    elif median_net > 0:
        monthly = 0.5 * median_net
    else:
        monthly = 0.0
    monthly = float(int(monthly // 10) * 10)
    one_off = max(0.0, balance - target - due - sts["safe_until_payday"])
    one_off = float(int(one_off // 50) * 50)
    return {
        "suggested_monthly": monthly,
        "suggested_one_off_now": one_off,
        "monthly_surplus": {"median": r2(median_net), "cautious": r2(cautious_net), "months": [{"month": r["month"], "net": r["net"]} for r in series]},
        "already_saving_monthly": r2(typ["saving"]),
        "emergency_fund": {
            "target": r2(target),
            "basis": "3 months of regular essentials and unexpected necessities",
            "monthly_mandatory": r2(mandatory),
            "balance": r2(balance),
            "months_covered": round(balance / mandatory, 1) if mandatory else None,
            "gap": r2(max(0.0, target - balance)),
        },
    }


# --------------------------------------------------------------------------- spender profile

ARCHETYPES = {
    "builder": {"en": "The Builder", "fi": "Rakentaja"},
    "payday_sprinter": {"en": "The Payday Sprinter", "fi": "Tilipäiväspurttaaja"},
    "trickler": {"en": "The Small-Sips Spender", "fi": "Pikkuostosten keräilijä"},
    "weekender": {"en": "The Weekender", "fi": "Viikonloppuilija"},
    "experience_seeker": {"en": "The Experience Seeker", "fi": "Elämyshakija"},
    "foodie": {"en": "The Foodie", "fi": "Herkuttelija"},
    "improviser": {"en": "The Improviser", "fi": "Improvisoija"},
    "steady": {"en": "The Steady Walker", "fi": "Tasainen kulkija"},
}


def spender_profile(c: Customer, today: date, overrides: Overrides = None) -> dict:
    days = 180
    start = today - timedelta(days=days - 1)
    w = _between(c.txs, start, today)
    m = _months(days)
    spend = [t for t in w if t.kind == "spend"]
    everyday = [t for t in spend if _basket(t, overrides) == "everyday"]
    total = _spend(spend)
    ev_total = _spend(everyday)
    by_basket = {b: sum(-t.amount for t in spend if _basket(t, overrides) == b) for b in BASKETS}
    income = sum(t.amount for t in w if t.kind == "income") - sum(-t.amount for t in w if t.category == "Salary Sweep")
    invested = sum(-t.amount for t in w if t.category == "Invest Deposit")

    weekend = sum(-t.amount for t in everyday if t.date.weekday() >= 5)
    late = sum(-t.amount for t in everyday if int(t.ts[11:13]) >= 21 or int(t.ts[11:13]) < 5)
    small = [t for t in everyday if -t.amount < SMALL_PURCHASE_EUR]

    paydays = [t.date for t in w if t.category == "Salary"]
    after = sum(-t.amount for t in everyday if any(0 <= (t.date - p).days < 7 for p in paydays))
    after_days = len({t for p in paydays for t in (p + timedelta(days=i) for i in range(7)) if start <= t <= today})
    rest_days = days - after_days
    payday_ratio = (after / after_days) / ((ev_total - after) / rest_days) if after_days and rest_days and ev_total - after > 0 else 1.0

    merchants: dict[str, float] = defaultdict(float)
    for t in everyday:
        if t.merchant:
            merchants[t.merchant] -= t.amount
    top_merchant_share = max(merchants.values()) / ev_total if merchants and ev_total else 0.0
    cat = defaultdict(float)
    for t in spend:
        cat[t.category] -= t.amount
    eat_out = cat["Restaurants"] / (cat["Restaurants"] + cat["Groceries"]) if cat["Restaurants"] + cat["Groceries"] else 0.0
    experiences = (cat["Travel"] + cat["Entertainment"]) / ev_total if ev_total else 0.0
    months = [r["spending"] for r in monthly_series(c, today, 12, overrides)]
    mean = statistics.fmean(months) if months else 0.0
    volatility = statistics.pstdev(months) / mean if mean else 0.0
    savings_rate = invested / income if income > 0 else 0.0
    ev_share = by_basket["everyday"] / total if total else 0.0
    small_share = len(small) / len(everyday) if everyday else 0.0

    if savings_rate >= 0.10 and ev_share < 0.45:
        arch = "builder"
    elif payday_ratio >= 1.5:
        arch = "payday_sprinter"
    elif small_share >= 0.45 and len(small) / m >= 15:
        arch = "trickler"
    elif ev_total and weekend / ev_total >= 0.42:
        arch = "weekender"
    elif experiences >= 0.45:
        arch = "experience_seeker"
    elif eat_out >= 0.5:
        arch = "foodie"
    elif volatility >= 0.45:
        arch = "improviser"
    else:
        arch = "steady"
    return {
        "archetype": arch,
        "archetype_label": ARCHETYPES[arch],
        "period_days": days,
        "monthly_income": r2(income / m),
        "monthly_spending": r2(total / m),
        "basket_shares": {b: round(v / total, 3) if total else 0.0 for b, v in by_basket.items()},
        "traits": {
            "savings_rate": round(savings_rate, 3),
            "weekend_share_of_everyday": round(weekend / ev_total, 3) if ev_total else 0.0,
            "weekend_share_if_even": round(2 / 7, 3),
            "late_evening_share_of_everyday": round(late / ev_total, 3) if ev_total else 0.0,
            "payday_week_vs_other_days": round(payday_ratio, 2),
            "small_purchases_per_month": round(len(small) / m, 1),
            "small_purchases_eur_per_month": r2(_spend(small) / m),
            "small_purchase_share_of_everyday_count": round(small_share, 3),
            "eating_out_share_of_food": round(eat_out, 3),
            "experiences_share_of_everyday": round(experiences, 3),
            "favourite_merchant_share_of_everyday": round(top_merchant_share, 3),
            "monthly_spending_volatility": round(volatility, 3),
            "everyday_purchases_per_week": round(len(everyday) / (days / 7), 1),
            "average_everyday_purchase": r2(ev_total / len(everyday)) if everyday else 0.0,
        },
    }


# --------------------------------------------------------------------------- what if


def _matches(t: Tx, target: str, overrides: Overrides) -> bool:
    k = target.strip().lower()
    return k in (t.category.lower(), t.sub.lower(), _basket(t, overrides)) or k == "all"


def what_if(
    c: Customer,
    today: date,
    target: str,
    change_pct: float,
    horizon_months: int = 12,
    annual_return_pct: float = 0.0,
    overrides: Overrides = None,
) -> dict:
    """Simulate changing spending on a category, subcategory or basket by change_pct (negative = cut)."""
    days = 180
    txs = [t for t in _between(c.txs, today - timedelta(days=days - 1), today) if t.kind == "spend" and _matches(t, target, overrides)]
    m = _months(days)
    baseline = _spend(txs) / m
    new = baseline * (1 + change_pct / 100)
    delta = baseline - new  # positive = money freed
    count = len(txs) / m
    ticket = _spend(txs) / len(txs) if txs else 0.0
    rate = annual_return_pct / 100 / 12
    if rate:
        future = delta * (((1 + rate) ** horizon_months - 1) / rate)
    else:
        future = delta * horizon_months
    sts = safe_to_spend(c, today, overrides)
    return {
        "target": target,
        "matched_transactions": len(txs),
        "change_pct": change_pct,
        "baseline_monthly": r2(baseline),
        "new_monthly": r2(new),
        "freed_monthly": r2(delta),
        "freed_yearly": r2(delta * 12),
        "horizon_months": horizon_months,
        "annual_return_pct": annual_return_pct,
        "accumulated_over_horizon": r2(future),
        "purchases_per_month": round(count, 1),
        "average_purchase": r2(ticket),
        "equivalent_fewer_purchases_per_month": round(delta / ticket, 1) if ticket else 0.0,
        "safe_per_week_now": sts["safe_this_week"],
        "extra_per_week": r2(delta * 7 / MONTH_DAYS),
    }


# --------------------------------------------------------------------------- free exploration

GROUPS = ("month", "week", "date", "weekday", "hour", "category", "sub", "basket", "merchant", "kind")
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _group_value(t: Tx, g: str, overrides: Overrides) -> str:
    if g == "month":
        return month_key(t.date)
    if g == "week":
        iso = t.date.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    if g == "date":
        return t.date.isoformat()
    if g == "weekday":
        return WEEKDAYS[t.date.weekday()]
    if g == "hour":
        return t.ts[11:13]
    if g == "category":
        return t.category
    if g == "sub":
        return t.sub
    if g == "basket":
        return _basket(t, overrides) if t.kind == "spend" else t.kind
    if g == "merchant":
        return t.merchant or "(no merchant)"
    return t.kind


def explore(
    c: Customer,
    start: date,
    end: date,
    group_by: list[str] | None = None,
    categories: list[str] | None = None,
    subs: list[str] | None = None,
    baskets: list[str] | None = None,
    kinds: list[str] | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    overrides: Overrides = None,
    limit: int = 60,
) -> dict:
    """Filter and group the customer's own transactions any way they like."""
    group_by = [g for g in (group_by or []) if g in GROUPS][:2]
    kinds = kinds or ["spend"]
    cats = {x.lower() for x in categories or []}
    subset = {x.lower() for x in subs or []}
    rows = []
    for t in _between(c.txs, start, end):
        if t.kind not in kinds:
            continue
        if cats and t.category.lower() not in cats:
            continue
        if subset and t.sub not in subset:
            continue
        if baskets and (t.kind != "spend" or _basket(t, overrides) not in baskets):
            continue
        a = abs(t.amount)
        if (min_amount is not None and a < min_amount) or (max_amount is not None and a > max_amount):
            continue
        rows.append(t)
    sign = -1 if kinds == ["spend"] or all(k in ("spend", "saving", "transfer") for k in kinds) else 1
    total = sign * sum(t.amount for t in rows)
    result: dict = {
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "total": r2(total),
        "count": len(rows),
        "average": r2(total / len(rows)) if rows else 0.0,
    }
    if group_by:
        groups: dict[tuple, list[Tx]] = defaultdict(list)
        for t in rows:
            groups[tuple(_group_value(t, g, overrides) for g in group_by)].append(t)
        time_first = group_by[0] in ("month", "week", "date", "hour")
        items = [{"key": list(k), "total": r2(sign * sum(t.amount for t in v)), "count": len(v)} for k, v in groups.items()]
        if group_by[0] == "weekday":
            items.sort(key=lambda x: WEEKDAYS.index(x["key"][0]))
        elif time_first:
            items.sort(key=lambda x: x["key"])
        else:
            items.sort(key=lambda x: -x["total"])
        result["group_by"] = group_by
        result["groups"] = items[:limit]
        result["groups_truncated"] = len(items) > limit
    else:
        latest = sorted(rows, key=lambda t: t.ts, reverse=True)[: min(limit, 25)]
        result["latest"] = [
            {"date": t.date.isoformat(), "time": t.ts[11:16], "category": t.category, "sub": t.sub, "amount": r2(t.amount), "merchant": t.merchant}
            for t in latest
        ]
    return result


SQL_SCHEMA = """transactions(
  date TEXT,            -- YYYY-MM-DD
  time TEXT,            -- HH:MM:SS
  month TEXT,           -- YYYY-MM
  weekday TEXT,         -- Mon..Sun
  hour INTEGER,
  kind TEXT,            -- spend | income | saving | transfer
  category TEXT,        -- Housing, Utilities, Groceries, Transportation, Health, Home & Tech, Restaurants, Entertainment, Lifestyle, Travel, Salary, Other Income, Invest Deposit, Invest Withdraw, Salary Sweep
  subcategory TEXT,     -- e.g. taxis, fast_food_cafes, supermarkets, pharmacy
  basket TEXT,          -- regular | irregular | everyday (NULL when kind is not spend)
  amount_eur REAL,      -- signed: negative is money out
  spend_eur REAL,       -- positive euros for spend rows, else 0
  balance_after_eur REAL,
  merchant_id TEXT      -- synthetic id, NULL for transfers
)"""

_ALLOWED_SQL = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}


def run_sql(c: Customer, sql: str, overrides: Overrides = None, max_rows: int = 100) -> dict:
    """Run a read-only query over this customer's transactions only.

    The data lives in a private in-memory database holding nothing but this customer's rows,
    and the authorizer refuses anything except SELECT, so a query cannot reach other customers or change data.
    """
    con = sqlite3.connect(":memory:")
    try:
        con.execute(
            "CREATE TABLE transactions(date TEXT, time TEXT, month TEXT, weekday TEXT, hour INTEGER, kind TEXT, category TEXT, "
            "subcategory TEXT, basket TEXT, amount_eur REAL, spend_eur REAL, balance_after_eur REAL, merchant_id TEXT)"
        )
        con.executemany(
            "INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                (
                    t.date.isoformat(),
                    t.ts[11:],
                    month_key(t.date),
                    WEEKDAYS[t.date.weekday()],
                    int(t.ts[11:13]),
                    t.kind,
                    t.category,
                    t.sub,
                    _basket(t, overrides) if t.kind == "spend" else None,
                    t.amount,
                    -t.amount if t.kind == "spend" else 0.0,
                    t.balance,
                    t.merchant,
                )
                for t in c.txs
            ),
        )
        con.commit()
        con.set_authorizer(lambda action, *_: sqlite3.SQLITE_OK if action in _ALLOWED_SQL else sqlite3.SQLITE_DENY)
        steps = 0

        def tick() -> int:
            nonlocal steps
            steps += 1
            return 1 if steps > 200 else 0

        con.set_progress_handler(tick, 10_000)
        cur = con.execute(sql)
        cols = [d[0] for d in cur.description or []]
        rows = cur.fetchmany(max_rows + 1)
        return {
            "columns": cols,
            "rows": [[r2(v) if isinstance(v, float) else v for v in row] for row in rows[:max_rows]],
            "truncated": len(rows) > max_rows,
        }
    except sqlite3.Error as e:
        return {"error": str(e), "schema": SQL_SCHEMA}
    finally:
        con.close()


# --------------------------------------------------------------------------- proactive insights


def insights(c: Customer, today: date, overrides: Overrides = None) -> list[dict]:
    """Things worth telling the customer before they ask. Each has a stable type and plain data."""
    out: list[dict] = []
    sts = safe_to_spend(c, today, overrides)
    rec = recurring(c, today)
    for u in sts["balance_view"]["still_due_before_payday"]:
        if u["item"] == "housing":
            out.append(
                {
                    "type": "upcoming_bill",
                    "severity": "info",
                    "item": "housing",
                    "amount": u["amount"],
                    "due": u["due"],
                    "days": (date.fromisoformat(u["due"]) - today).days,
                }
            )
    if sts["projected_balance_at_payday_at_usual_pace"] < 0:
        out.append(
            {
                "type": "overdraft_risk",
                "severity": "warning",
                "projected_balance": sts["projected_balance_at_payday_at_usual_pace"],
                "payday": sts["next_payday"],
            }
        )

    last30 = [t for t in _between(c.txs, today - timedelta(days=29), today) if t.kind == "spend"]
    prior = [t for t in _between(c.txs, today - timedelta(days=179), today - timedelta(days=30)) if t.kind == "spend"]
    now_by: dict[str, float] = defaultdict(float)
    before_by: dict[str, float] = defaultdict(float)
    for t in last30:
        if _basket(t, overrides) == "everyday":
            now_by[t.sub] -= t.amount
    for t in prior:
        if _basket(t, overrides) == "everyday":
            before_by[t.sub] -= t.amount / 5
    spikes = [(s, v, before_by[s]) for s, v in now_by.items() if v - before_by[s] >= 40 and v >= 1.5 * before_by[s]]
    if spikes:
        s, v, b = max(spikes, key=lambda x: x[1] - x[2])
        out.append({"type": "category_spike", "severity": "notice", "sub": s, "last_30_days": r2(v), "usual_30_days": r2(b), "extra": r2(v - b)})

    small = [t for t in last30 if _basket(t, overrides) == "everyday" and -t.amount < SMALL_PURCHASE_EUR]
    if len(small) >= 8:
        out.append(
            {
                "type": "small_purchases",
                "severity": "notice",
                "count": len(small),
                "total": r2(_spend(small)),
                "yearly_at_this_pace": r2(_spend(small) * 365 / 30),
            }
        )

    tickets = [-t.amount for t in prior if _basket(t, overrides) != "regular"]
    if tickets:
        typical = statistics.median(tickets)
        spiked = {i["sub"] for i in out if i["type"] == "category_spike"}
        big = [t for t in last30 if _basket(t, overrides) != "regular" and -t.amount >= max(200.0, 4 * typical) and t.sub not in spiked]
        if big:
            t = min(big, key=lambda t: t.amount)
            out.append(
                {
                    "type": "large_purchase",
                    "severity": "info",
                    "date": t.date.isoformat(),
                    "sub": t.sub,
                    "basket": _basket(t, overrides),
                    "amount": r2(-t.amount),
                }
            )

    if rec["other_bank_transfer"]:
        out.append({"type": "other_bank", "severity": "info", "monthly": rec["other_bank_transfer"]["typical_amount"]})
    windfalls = [t for t in _between(c.txs, today - timedelta(days=29), today) if t.category == "Other Income"]
    if windfalls:
        out.append({"type": "windfall", "severity": "info", "amount": r2(sum(t.amount for t in windfalls)), "date": windfalls[-1].date.isoformat()})
    sav = safe_to_save(c, today, overrides)
    at_risk = sts["status"] == "stop" or sts["projected_balance_at_payday_at_usual_pace"] < 0
    if not at_risk and (sav["suggested_one_off_now"] >= 100 or sav["suggested_monthly"] >= 20):
        out.append({"type": "saving_room", "severity": "positive", "monthly": sav["suggested_monthly"], "one_off": sav["suggested_one_off_now"]})
    return out
