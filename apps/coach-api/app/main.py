"""HTTP API for the money coach."""

import json
import logging
import os
import re
from collections.abc import AsyncIterator
from datetime import date, timedelta
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import agent, benchmarks, db, engine, mortgage
from .coach_tools import Session
from .taxonomy import BASKET_LABELS, CATEGORY_FI, SUB_LABELS

log = logging.getLogger("coach")
app = FastAPI(title="coach-api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o],
    allow_methods=["GET", "POST"],
    allow_headers=["content-type"],
)

# Demo personas: real rows from the synthetic dataset, with made-up first names so they are easy to talk about.
PERSONAS = [
    {
        "id": "CUST04754",
        "name": "Aino",
        "story": {"en": "Young adult, most of the pay goes to housing", "fi": "Nuori aikuinen, palkasta suurin osa menee asumiseen"},
    },
    {"id": "CUST00028", "name": "Mikko", "story": {"en": "Money runs fast after payday", "fi": "Rahat hupenevat heti tilipäivän jälkeen"}},
    {"id": "CUST00209", "name": "Sanna", "story": {"en": "Family budget, busy weekends", "fi": "Perheen budjetti, kiireiset viikonloput"}},
    {"id": "CUST01725", "name": "Ville", "story": {"en": "Mortgage application was turned down", "fi": "Asuntolainahakemus hylättiin"}},
    {"id": "CUST00677", "name": "Tiina", "story": {"en": "Salary moves on to another bank", "fi": "Palkka siirtyy toiseen pankkiin"}},
    {"id": "CUST00043", "name": "Juha", "story": {"en": "Steady saver thinking ahead", "fi": "Tasainen säästäjä katsoo eteenpäin"}},
]
_ID = re.compile(r"^CUST\d{5}$")
Overrides = dict[str, Literal["regular", "irregular", "everyday"]]


def _customer(customer_id: str) -> db.Customer:
    # In production the customer comes from the authenticated bank session, never from the request.
    if not _ID.match(customer_id):
        raise HTTPException(404, "unknown customer")
    c = db.load_customer(customer_id)
    if c is None:
        raise HTTPException(404, "unknown customer")
    return c


def _area(c: db.Customer) -> str | None:
    area = benchmarks._open_data()["paavo"]["areas"].get(c.postal_code)
    return f"{area['name']}, {area['municipality']}" if area else None


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_id": agent.MODEL_ID, "provider": agent.LLM_PROVIDER, "llm_configured": agent.llm_configured()}


@app.get("/api/meta")
def meta() -> dict:
    out = []
    for p in PERSONAS:
        c = db.load_customer(p["id"])
        if c:
            out.append({**p, "age": c.age, "area": _area(c)})
    return {
        "today": db.today().isoformat(),
        "personas": out,
        "labels": {"baskets": BASKET_LABELS, "subs": SUB_LABELS, "categories_fi": CATEGORY_FI},
        "llm_configured": agent.llm_configured(),
        "model_id": agent.MODEL_ID,
    }


class OverridesBody(BaseModel):
    overrides: Overrides = Field(default_factory=dict, max_length=60)


@app.post("/api/customers/{customer_id}/home")
def home(customer_id: str, body: OverridesBody) -> dict:
    c = _customer(customer_id)
    today = db.today()
    ov = dict(body.overrides)
    return {
        "customer": {"id": c.id, "age": c.age, "postal_code": c.postal_code, "area": _area(c)},
        "today": today.isoformat(),
        "safe_to_spend": engine.safe_to_spend(c, today, ov),
        "safe_to_save": engine.safe_to_save(c, today, ov),
        "baskets": engine.baskets_summary(c, today, 180, ov),
        "monthly": engine.monthly_series(c, today, 12, ov),
        "profile": engine.spender_profile(c, today, ov),
        "insights": engine.insights(c, today, ov),
        "recurring": engine.recurring(c, today),
        "has_mortgage": mortgage.mortgage_story(c, today) is not None,
    }


class ExploreBody(OverridesBody):
    start: date | None = None
    end: date | None = None
    group_by: list[Literal["month", "week", "date", "weekday", "hour", "category", "sub", "basket", "merchant", "kind"]] = Field(
        default_factory=list, max_length=2
    )
    categories: list[str] = Field(default_factory=list, max_length=20)
    subs: list[str] = Field(default_factory=list, max_length=40)
    baskets: list[Literal["regular", "irregular", "everyday"]] = Field(default_factory=list)
    kinds: list[Literal["spend", "income", "saving", "transfer"]] = Field(default_factory=list)
    min_amount: float | None = None
    max_amount: float | None = None


@app.post("/api/customers/{customer_id}/explore")
def explore(customer_id: str, body: ExploreBody) -> dict:
    c = _customer(customer_id)
    end = body.end or db.today()
    start = body.start or end - timedelta(days=29)
    return engine.explore(
        c, start, end, list(body.group_by), body.categories, body.subs, list(body.baskets), list(body.kinds) or None,
        body.min_amount, body.max_amount, dict(body.overrides),
    )  # fmt: skip


class WhatIfBody(OverridesBody):
    target: str = Field(max_length=60)
    change_pct: float = Field(ge=-100, le=300)
    horizon_months: int = Field(default=12, ge=1, le=480)
    annual_return_pct: float = Field(default=0, ge=0, le=15)


@app.post("/api/customers/{customer_id}/what-if")
def what_if(customer_id: str, body: WhatIfBody) -> dict:
    c = _customer(customer_id)
    return engine.what_if(c, db.today(), body.target, body.change_pct, body.horizon_months, body.annual_return_pct, dict(body.overrides))


class ChallengeBody(OverridesBody):
    target: str = Field(max_length=60)
    change_pct: float = Field(ge=-100, le=0)
    weeks: int = Field(default=4, ge=1, le=12)


@app.post("/api/customers/{customer_id}/challenge")
def challenge(customer_id: str, body: ChallengeBody) -> dict:
    plan = engine.challenge(_customer(customer_id), db.today(), body.target, body.change_pct, body.weeks, dict(body.overrides))
    if plan is None:
        raise HTTPException(404, "no spending found for that target")
    return plan


@app.get("/api/customers/{customer_id}/benchmark")
def benchmark(customer_id: str) -> dict:
    return benchmarks.benchmark(_customer(customer_id), db.today())


@app.get("/api/customers/{customer_id}/mortgage")
def mortgage_story(customer_id: str) -> dict:
    return mortgage.mortgage_story(_customer(customer_id), db.today()) or {"has_mortgage_application": False}


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatBody(OverridesBody):
    customer_id: str
    messages: list[ChatMessage] = Field(min_length=1, max_length=40)
    language: Literal["fi", "en"] = "en"


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


async def _chat_events(body: ChatBody, c: db.Customer) -> AsyncIterator[str]:
    session = Session(c, db.today(), dict(body.overrides))
    history = [m.model_dump() for m in body.messages]
    if history[-1]["role"] != "user":
        yield _sse({"type": "error", "message": "last message must be from the user"})
        return
    prompt = history.pop()["content"]
    while history and history[0]["role"] != "user":
        history.pop(0)
    sent = 0
    announced: set[str] = set()
    try:
        coach = agent.build_agent(session, body.language, history)
        async for ev in coach.stream_async(prompt):
            if ev.get("data"):
                yield _sse({"type": "text", "text": ev["data"]})
            tool_use = ev.get("current_tool_use")
            if tool_use and tool_use.get("toolUseId") and tool_use["toolUseId"] not in announced:
                announced.add(tool_use["toolUseId"])
                yield _sse({"type": "tool", "name": tool_use.get("name")})
            while sent < len(session.outbox):
                yield _sse(session.outbox[sent])
                sent += 1
    except Exception:
        log.exception("chat failed")
        yield _sse({"type": "error", "message": "The coach could not answer right now."})
    while sent < len(session.outbox):
        yield _sse(session.outbox[sent])
        sent += 1
    yield _sse({"type": "done"})


@app.post("/api/chat")
async def chat(body: ChatBody) -> StreamingResponse:
    c = _customer(body.customer_id)
    if not agent.llm_configured():
        raise HTTPException(503, "No language model is configured on the server.")
    return StreamingResponse(_chat_events(body, c), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# Serve the built web app from the same origin when it exists (single deployable for the demo).
_WEB = Path(os.getenv("WEB_DIST", Path(__file__).resolve().parents[2] / "coach-web" / "dist"))
if (_WEB / "index.html").exists():
    app.mount("/assets", StaticFiles(directory=_WEB / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        f = (_WEB / path).resolve()
        if path and f.is_relative_to(_WEB.resolve()):
            if f.is_file():
                return FileResponse(f)
            if (f / "index.html").is_file():  # /app/ is the coach itself; / is the marketing page
                return FileResponse(f / "index.html")
        return FileResponse(_WEB / "index.html")
