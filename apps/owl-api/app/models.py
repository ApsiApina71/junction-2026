"""The shared JSON shapes of docs/specs/owl-contract.md. Keep the two in step."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

# BCP 47 tags such as en, fi, uk or pt-BR.
Language = Annotated[str, StringConstraints(min_length=2, max_length=10, pattern=r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$")]
# A pair of glasses, named by the employer ("glasses-1"). It is part of a URL, so only letters, digits, - and _.
GlassesId = Annotated[str, StringConstraints(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Role = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]
Welcome = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


class Employee(BaseModel):
    id: str
    name: str
    language: str
    role: str
    company: str
    welcome: str
    process_ids: list[str]
    glasses_id: str | None = None


class EmployeeCreate(BaseModel):
    name: Name
    language: Language
    role: Role = ""
    process_ids: list[str] = []
    glasses_id: GlassesId | None = None
    # Empty or left out: the server writes the welcome in the employee's language.
    welcome: Welcome | None = None


class EmployeeUpdate(BaseModel):
    """Every field is optional; a field that is left out stays as it is."""

    name: Name | None = None
    language: Language | None = None
    role: Role | None = None
    process_ids: list[str] | None = None
    glasses_id: GlassesId | None = None
    welcome: Welcome | None = None


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
    # Jev's reported probability for its answer; null when the rules decided alone. Never a percentage on screen.
    confidence: float | None = Field(default=None, ge=0, le=1)
    decided_by: Literal["jev", "rules", "demo"]
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
    image_url: str | None = None

    model_config = {"populate_by_name": True, "serialize_by_alias": True}


class HelpSession(BaseModel):
    id: str
    status: Literal["waiting", "connected", "ended"]
    employee_id: str | None = None
    process_id: str | None = None
    step_id: str | None = None
    latest_frame_url: str | None = None
    frame_at: str | None = None
    updated_at: str
    messages: list[HelpMessage] = []


class Mark(BaseModel):
    """A point in the worker's view, as a share of the frame's width and height from its top left corner."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class SayRequest(BaseModel):
    from_: Literal["worker", "expert"] = Field(default="expert", alias="from")
    text: str = Field(min_length=1, max_length=500)
    mark: Mark | None = None

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
