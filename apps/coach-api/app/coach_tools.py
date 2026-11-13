"""The coach's tools. Each call is bound to one customer, so the model can never ask for anyone else's data."""

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from strands import tool

from . import benchmarks, engine, mortgage, verify
from .db import Customer
from .taxonomy import BASKETS


@dataclass
class Session:
    customer: Customer
    today: date
    overrides: dict[str, str] = field(default_factory=dict)
    # UI events produced by tools (cards, actions). The API streams them to the app.
    outbox: list[dict[str, Any]] = field(default_factory=list)

    # Every number a tool has returned in this turn; the answer's euro amounts are checked against these.
    figures: set[float] = field(default_factory=set)

    def card(self, kind: str, data: Any) -> None:
        self.outbox.append({"type": "card", "card": kind, "data": data})

    def seen(self, result: Any) -> Any:
        verify.collect_numbers(result, self.figures)
        return result


def _date(s: str | None, default: date) -> date:
    try:
        return date.fromisoformat(s) if s else default
    except ValueError:
        return default


def build_tools(s: Session) -> list:
    c, today = s.customer, s.today

    @tool
    def get_safe_to_spend() -> dict:
        """How much the customer can safely spend on everyday things before the next payday, per day and this week.
        Returns both limits (balance view and income view), what is still due before payday, and the status.
        Shows a safe-to-spend card in the app."""
        out = engine.safe_to_spend(c, today, s.overrides)
        s.card("safe_to_spend", out)
        return s.seen(out)

    @tool
    def get_safe_to_save() -> dict:
        """How much the customer could safely move to savings: a monthly amount based on their real monthly surplus,
        a one-off amount based on money beyond a three-month emergency fund, and how many months of mandatory costs the balance covers.
        Shows a safe-to-save card."""
        out = engine.safe_to_save(c, today, s.overrides)
        s.card("safe_to_save", out)
        return s.seen(out)

    @tool
    def get_baskets(days: int = 180) -> dict:
        """Where the money really goes, split into the three baskets as monthly averages:
        regular (mandatory and regular, e.g. rent, bills, groceries, commuting), irregular (mandatory but unexpected,
        e.g. health, repairs, replacing a broken appliance) and everyday (spending that slips through the fingers,
        e.g. cafes, restaurants, taxis, entertainment, shopping). Includes top subcategories per basket. Shows a baskets card.

        Args:
            days: Length of the period ending today, 30 to 730.
        """
        out = engine.baskets_summary(c, today, max(30, min(days, 730)), s.overrides)
        s.card("baskets", out)
        return s.seen(out)

    @tool
    def get_overview(start_date: str = "", end_date: str = "") -> dict:
        """Income, spending (by basket and by category), investing, transfers to another bank and net change for a period.

        Args:
            start_date: YYYY-MM-DD. Defaults to 30 days ago.
            end_date: YYYY-MM-DD. Defaults to today.
        """
        end = _date(end_date, today)
        start = _date(start_date, date.fromordinal(end.toordinal() - 29))
        return s.seen(engine.overview(c, start, end, s.overrides))

    @tool
    def get_monthly_history(months: int = 12) -> dict:
        """Month-by-month income, the three baskets, investing and net for the last full calendar months. Shows a trend card.

        Args:
            months: How many months, 2 to 24.
        """
        rows = engine.monthly_series(c, today, max(2, min(months, 24)), s.overrides)
        s.card("monthly", {"months": rows})
        return s.seen({"months": rows})

    @tool
    def get_spender_profile() -> dict:
        """What kind of spender the customer is: an archetype plus measurable traits (savings rate, weekend share,
        payday effect, small purchases, eating out share, volatility). Shows a profile card."""
        out = engine.spender_profile(c, today, s.overrides)
        s.card("profile", out)
        return s.seen(out)

    @tool
    def simulate_what_if(target: str, change_pct: float, horizon_months: int = 12, annual_return_pct: float = 0.0) -> dict:
        """Simulate a change in spending, e.g. dining out reduced by 20 percent. Returns the monthly and yearly money freed,
        what it means in fewer purchases, and the effect on weekly safe-to-spend. Shows an interactive what-if card with a slider.

        Args:
            target: A category (e.g. "Restaurants"), a subcategory key (e.g. "taxis", "fast_food_cafes"), a basket
                ("regular", "irregular", "everyday") or "all".
            change_pct: Percent change, negative to cut (e.g. -20).
            horizon_months: Months to accumulate over.
            annual_return_pct: Optional hypothetical yearly return if the freed money were saved. Use 0 unless the customer asks.
        """
        out = engine.what_if(c, today, target, change_pct, max(1, min(horizon_months, 480)), annual_return_pct, s.overrides)
        if out["matched_transactions"]:
            s.card("what_if", out)
        return s.seen(out)

    @tool
    def explore_transactions(
        start_date: str = "",
        end_date: str = "",
        group_by: list[str] | None = None,
        categories: list[str] | None = None,
        subcategories: list[str] | None = None,
        baskets: list[str] | None = None,
        kinds: list[str] | None = None,
        min_amount: float | None = None,
        max_amount: float | None = None,
    ) -> dict:
        """Filter and group the customer's transactions. Use for questions like "how much did I spend on taxis last month".
        Returns total, count, average, and either groups or the latest matching transactions.

        Args:
            start_date: YYYY-MM-DD, defaults to 30 days ago.
            end_date: YYYY-MM-DD, defaults to today.
            group_by: Up to two of: month, week, date, weekday, hour, category, sub, basket, merchant, kind.
            categories: Category names to include.
            subcategories: Subcategory keys to include (e.g. taxis, supermarkets, fast_food_cafes, bars, pharmacy).
            baskets: Baskets to include.
            kinds: Any of spend, income, saving, transfer. Defaults to spend.
            min_amount: Smallest absolute amount in euros.
            max_amount: Largest absolute amount in euros.
        """
        end = _date(end_date, today)
        start = _date(start_date, date.fromordinal(end.toordinal() - 29))
        return s.seen(engine.explore(c, start, end, group_by, categories, subcategories, baskets, kinds, min_amount, max_amount, s.overrides))

    @tool
    def run_sql(query: str) -> dict:
        """Run one read-only SQLite SELECT over the customer's own transactions for anything the other tools cannot answer.
        Table: transactions(date, time, month, weekday, hour, kind, category, subcategory, basket, amount_eur, spend_eur,
        balance_after_eur, merchant_id). amount_eur is signed (negative is money out); spend_eur is positive for spending rows.
        At most 100 rows come back, so aggregate.

        Args:
            query: A single SELECT statement.
        """
        return s.seen(engine.run_sql(c, query, s.overrides))

    @tool
    def compare_with_others() -> dict:
        """Benchmarks: the customer against S-Bank customers of the same age group (median and percentile per category and basket),
        against Statistics Finland's Household Budget Survey for their age group, and their income against the median income
        of their postal code area (Statistics Finland Paavo). Shows a benchmark card."""
        out = benchmarks.benchmark(c, today)
        s.card("benchmark", out)
        return s.seen(out)

    @tool
    def get_recurring() -> dict:
        """Detected regular money movements: salary (amount, day, next date), housing payment, bills per month,
        saving habit, and regular transfers to another bank."""
        return s.seen(engine.recurring(c, today))

    @tool
    def get_mortgage_story() -> dict:
        """The customer's mortgage application, if they have one: decision, reason, loan, equity, collateral, loan-to-value,
        income required versus income seen on this account, and the timeline of the process. Shows a mortgage card."""
        out = mortgage.mortgage_story(c, today)
        if out is None:
            return {"has_mortgage_application": False}
        s.card("mortgage", {k: v for k, v in out.items() if k != "timeline"})
        return s.seen(out)

    @tool
    def show_chart(title: str, chart_type: str, labels: list[str], values: list[float], unit: str = "€") -> dict:
        """Show a chart in the app built from numbers you got from other tools. Use it when a picture answers better than text.

        Args:
            title: Short title in the customer's language.
            chart_type: "bar", "line" or "donut".
            labels: One label per value.
            values: The numbers.
            unit: Unit shown with values.
        """
        n = min(len(labels), len(values), 40)
        if n == 0:
            return s.seen({"shown": False, "reason": "no data"})
        kind = chart_type if chart_type in ("bar", "line", "donut") else "bar"
        s.card("chart", {"title": title[:80], "chart_type": kind, "labels": [str(x)[:40] for x in labels[:n]], "values": values[:n], "unit": unit[:8]})
        return s.seen({"shown": True})

    @tool
    def move_to_basket(target: str, basket: str) -> dict:
        """Reclassify a category or subcategory into another basket because the customer says so
        (e.g. "the gym is mandatory for me", "taxis are not everyday for me"). It is their data and their labels.

        Args:
            target: Category name or subcategory key.
            basket: "regular", "irregular" or "everyday".
        """
        if basket not in BASKETS:
            return s.seen({"ok": False, "reason": "unknown basket"})
        s.overrides[target] = basket
        s.outbox.append({"type": "override", "target": target, "basket": basket})
        return s.seen({"ok": True, "note": "Applied. Figures from now on use the new label."})

    @tool
    def propose_challenge(title: str, target: str, change_pct: float, weeks: int = 4) -> dict:
        """Offer the customer a small, concrete habit challenge they can accept in the app, e.g. cut cafes by 20 percent for 4 weeks.
        Only propose one after showing what it would free up.

        Args:
            title: Short title in the customer's language.
            target: Category, subcategory key or basket the challenge is about.
            change_pct: Negative percent to cut.
            weeks: Length in weeks, 1 to 12.
        """
        plan = engine.challenge(c, today, target, change_pct, weeks, s.overrides)
        if plan is None:
            return s.seen({"ok": False, "reason": "no spending found for that target"})
        data = {"title": title[:80], **plan}
        s.card("challenge", data)
        return s.seen({"ok": True, **data})

    return [
        get_safe_to_spend,
        get_safe_to_save,
        get_baskets,
        get_overview,
        get_monthly_history,
        get_spender_profile,
        simulate_what_if,
        explore_transactions,
        run_sql,
        compare_with_others,
        get_recurring,
        get_mortgage_story,
        show_chart,
        move_to_basket,
        propose_challenge,
    ]
