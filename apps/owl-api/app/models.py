"""The shared JSON shapes of docs/specs/owl-contract.md. Keep the two in step."""

from typing import Literal

from pydantic import BaseModel, Field


class Employee(BaseModel):
    id: str
    name: str
    language: str
    role: str
    company: str
    welcome: str
    process_ids: list[str]


class OrderLine(BaseModel):
    sku: str | None = None
    name: str
    qty: int = Field(ge=1)


class Check(BaseModel):
    kind: Literal["visual", "order", "none"]
    criteria: list[str] = []
    order_lines: list[OrderLine] | None = None


class Source(BaseModel):
    doc: str
    quote: str
    section: str | None = None


class Step(BaseModel):
    id: str
    index: int = Field(ge=1)
    title: str = Field(max_length=32)
    instruction: str = Field(max_length=140)
    say: str
    reference_image_url: str | None = None
    clip_url: str | None = None
    check: Check
    source: Source | None = None


class Process(BaseModel):
    id: str
    title: str
    summary: str
    company: str
    language: str
    status: Literal["draft", "published"]
    source: Literal["record", "docs"]
    expert: str | None = None
    steps: list[Step]


LineStatus = Literal["ok", "wrong_item", "missing", "too_many"]


class CheckLine(BaseModel):
    name: str
    expected: int
    seen: int
    status: LineStatus
    note: str | None = None


class CheckResult(BaseModel):
    status: Literal["ok", "warning", "checking", "unsure"]
    problem: Literal["wrong_item", "missing", "too_many", "not_matching"] | None = None
    text: str
    say: str | None = None
    hint: str | None = None
    lines: list[CheckLine] | None = None
    confidence: float = Field(ge=0, le=1)
    decided_by: Literal["jev", "rules"]
    step_done: bool = False


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    employee_id: str | None = None
    process_id: str | None = None
    step_id: str | None = None
    language: str | None = Field(default=None, max_length=10)


class Answer(BaseModel):
    found: bool
    text: str
    say: str
    language: str
    sources: list[Source]


class Doc(BaseModel):
    id: str
    title: str
    filename: str
    chars: int
    uploaded_at: str


class HelpMessage(BaseModel):
    id: int
    from_: Literal["worker", "expert"] = Field(alias="from")
    text: str
    at: str

    model_config = {"populate_by_name": True, "serialize_by_alias": True}


class HelpSession(BaseModel):
    id: str
    status: Literal["waiting", "connected", "ended"]
    employee_id: str | None = None
    process_id: str | None = None
    step_id: str | None = None
    latest_frame_url: str | None = None
    updated_at: str
    messages: list[HelpMessage] = []


class SayRequest(BaseModel):
    from_: Literal["worker", "expert"] = Field(default="expert", alias="from")
    text: str = Field(min_length=1, max_length=500)

    model_config = {"populate_by_name": True}


class RecordedStep(BaseModel):
    index: int
    narration: str
    photo_url: str | None = None
    clip_url: str | None = None


class Recording(BaseModel):
    id: str
    title: str
    expert: str | None = None
    status: Literal["recording", "processing", "done", "failed"]
    steps: list[RecordedStep] = []
    process_id: str | None = None


class RecordStart(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    expert: str | None = Field(default=None, max_length=80)
