"""The shared JSON shapes of docs/specs/owl-contract.md. Keep the two in step."""

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

# BCP 47 tags such as en, fi, uk or pt-BR.
Language = Annotated[str, StringConstraints(min_length=2, max_length=10, pattern=r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$")]
# A pair of glasses, named by the employer ("glasses-1"). It is part of a URL, so only letters, digits, - and _.
GlassesId = Annotated[str, StringConstraints(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Role = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)]
Welcome = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]


class Access(BaseModel):
    """How Owl talks to this worker (JUN-81). Studio sets it; everything is off by default."""

    audio_first: bool = False  # low vision or eyes busy: everything on the display is also spoken
    display_first: bool = False  # Deaf or hard of hearing, or a loud workplace: every spoken line is also captioned
    easy_language: bool = False  # short, plain sentences (intellectual disability, dyslexia, newcomers)


class Consent(BaseModel):
    """What the worker agreed to on the glasses, and when (JUN-80)."""

    camera_checks: bool = False
    recording: bool = False
    # JUN-97: during training, Owl follows which area the worker is in, from the markers the camera sees.
    location: bool = False
    at: str | None = None


class Employee(BaseModel):
    id: str
    name: str
    language: str
    role: str
    company: str
    welcome: str
    process_ids: list[str]
    glasses_id: str | None = None
    access: Access = Access()
    # JUN-100: can be the manager on shift, who answers Help on their own glasses.
    shift_manager: bool = False
    # The language of the welcome and the voice that speaks it; null: the same as language (JUN-108).
    welcome_language: str | None = None


class EmployeeCreate(BaseModel):
    name: Name
    language: Language
    role: Role = ""
    process_ids: list[str] = []
    glasses_id: GlassesId | None = None
    # Empty or left out: the server writes the welcome in the employee's language.
    welcome: Welcome | None = None
    access: Access = Access()
    shift_manager: bool = False
    welcome_language: Language | None = None


class EmployeeUpdate(BaseModel):
    """Every field is optional; a field that is left out stays as it is."""

    name: Name | None = None
    language: Language | None = None
    role: Role | None = None
    process_ids: list[str] | None = None
    glasses_id: GlassesId | None = None
    welcome: Welcome | None = None
    access: Access | None = None
    shift_manager: bool | None = None
    # Sent as null: back to the employee's language.
    welcome_language: Language | None = None


class OrderLine(BaseModel):
    sku: str | None = None
    name: str
    qty: int = Field(ge=1)


class Check(BaseModel):
    kind: Literal["visual", "order", "none"]
    criteria: list[str] = []
    order_lines: list[OrderLine] | None = None
    # JUN-106: the expert's own sentence for a check that does not match ("That's a deposit bottle. It goes to the
    # return crate."). Shown and spoken as it is, instead of "Check again: <criterion>".
    warning: str | None = Field(default=None, max_length=140)


class Source(BaseModel):
    doc: str
    quote: str
    section: str | None = None


class Checkpoint(BaseModel):
    """Where a step happens (JUN-97). The step unlocks when Owl recognises the place in the worker's camera picture."""

    zone_id: str
    label: str = Field(min_length=1, max_length=40)  # "Aisle C · Shelf 12"
    # More pictures of the place, added in Studio. The step's own reference photo is always one of them.
    photo_urls: list[str] = Field(default=[], max_length=8)


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
    # False on a step that Owl wrote from a recording and no person has checked yet. Such a process cannot be published.
    reviewed: bool = True
    # The company rule from the handbooks that backs this step, found locally (JUN-70). Shown as "Company rule".
    rule: Source | None = None
    # JUN-97: during training the step is locked until the worker reaches this spot.
    checkpoint: Checkpoint | None = None


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
    # When the glasses should look again, in milliseconds; null: not before the next step or pinch (JUN-82).
    next_check_ms: int | None = None


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
    from_: Literal["worker", "expert", "manager"] = Field(alias="from")
    text: str
    at: str
    image_url: str | None = None

    model_config = {"populate_by_name": True, "serialize_by_alias": True}


class HelpSession(BaseModel):
    id: str
    # waiting/connected: the Studio console. ringing/accepted: the shift manager's own glasses (JUN-100).
    status: Literal["waiting", "connected", "ringing", "accepted", "ended"]
    employee_id: str | None = None
    process_id: str | None = None
    step_id: str | None = None
    latest_frame_url: str | None = None
    frame_at: str | None = None
    updated_at: str
    messages: list[HelpMessage] = []
    # JUN-100: who the request went to. routed "manager": the manager on shift, on their glasses; "studio": the console.
    routed: Literal["manager", "studio"] = "studio"
    assignee: str | None = None
    assignee_name: str | None = None
    rang_at: str | None = None
    # Why a call to the manager went to Studio instead.
    fallback: Literal["no_answer", "later", "no_manager"] | None = None


class Mark(BaseModel):
    """A point in the worker's view, as a share of the frame's width and height from its top left corner."""

    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class SayRequest(BaseModel):
    from_: Literal["worker", "expert", "manager"] = Field(default="expert", alias="from")
    text: str = Field(min_length=1, max_length=500)
    mark: Mark | None = None

    model_config = {"populate_by_name": True}


class RecordedStep(BaseModel):
    index: int
    narration: str
    photo_url: str | None = None
    clip_url: str | None = None
    # The glasses' own name for this upload, so they can take the step back (DELETE /record/{id}/steps/{key}).
    key: str | None = None


class Recording(BaseModel):
    id: str
    title: str
    expert: str | None = None
    status: Literal["recording", "processing", "done", "failed"]
    steps: list[RecordedStep] = []
    process_id: str | None = None
    # Keys of step uploads the expert gave up: removed if they arrived, ignored if they arrive later.
    dropped: list[str] = []
    # The folder of this recording's photos and clips under /media. Its name ends in random letters: media is served
    # by address without a token (the glasses' display loads it), so the address must not be guessable.
    media_dir: str | None = None


class TranslateRequest(BaseModel):
    language: str = Field(min_length=2, max_length=10, pattern=r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$")


class FromDocs(BaseModel):
    doc_id: str
    title: str | None = Field(default=None, max_length=80)


class RecordStart(BaseModel):
    title: str = Field(min_length=1, max_length=80)
    expert: str | None = Field(default=None, max_length=80)


class TargetStep(BaseModel):
    """One part of the target level: this step verified this many times without help (JUN-96)."""

    process_id: str
    step_id: str
    required: int = Field(default=3, ge=1, le=20)


class TrainingPlan(BaseModel):
    """What the company set for a role in Studio: how long training lasts and the level to reach (JUN-96)."""

    id: str = Field(min_length=1, max_length=60, pattern=r"^[A-Za-z0-9_-]+$")
    role: Role
    days: int = Field(default=5, ge=1, le=90)
    target: list[TargetStep] = []
    # JUN-98: workers in this role may turn on customer service mode on the glasses during training.
    customer_service: bool = False


class TrainingStart(BaseModel):
    """Studio puts a worker on a training period. starts null ends it; plan_id null: the plan of the worker's role."""

    starts: date | None = None
    plan_id: str | None = None


class TrainingConfirm(BaseModel):
    """A person confirms the end result. Owl only suggests it."""

    result: Literal["ready", "more_practice"]
    by: Name
    note: str | None = Field(default=None, max_length=300)
    # more_practice: training goes on this many days more.
    extend_days: int = Field(default=3, ge=1, le=30)


class Zone(BaseModel):
    """An area of the workplace on Studio's map (JUN-97). x, y, w and h are shares of the map's width and height."""

    id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    name: Name
    kind: Literal["aisle", "packing", "loading", "other"] = "other"
    x: float = Field(default=0, ge=0, le=1)
    y: float = Field(default=0, ge=0, le=1)
    w: float = Field(default=0.2, gt=0, le=1)
    h: float = Field(default=0.2, gt=0, le=1)


class StepRef(BaseModel):
    process_id: str
    step_id: str


class LocationReport(BaseModel):
    """The worker is in this zone or at this checkpoint, from another source than the camera (later: BLE beacons)."""

    employee_id: str
    zone: str | None = None
    checkpoint: StepRef | None = None


class Unlock(BaseModel):
    process_id: str
    step_id: str
    by: Literal["trainer", "help"] = "trainer"


class AssistRequest(BaseModel):
    """The last ~30 s of the counter conversation, as text (JUN-98). Used for one answer, never stored or logged."""

    employee_id: str
    transcript: str = Field(max_length=20000)
    language: str | None = Field(default=None, max_length=10)


class AssistSource(BaseModel):
    doc: str
    section: str | None = None


class AssistAnswer(BaseModel):
    bullets: list[str]
    # The glasses do not speak a suggestion while the customer listens: bullets are for the display.
    say: str | None = None
    sources: list[AssistSource]
    unsure: bool


class AssistSign(BaseModel):
    """The text of the sign at the desk that tells customers Owl is listening."""

    text: str = Field(min_length=1, max_length=300)


class ShiftSet(BaseModel):
    """Studio sets who is the manager on shift at a company. null: no one."""

    company: str = Field(min_length=1, max_length=80)
    employee_id: str | None = None


class HelpAnswer(BaseModel):
    """The shift manager answers on their glasses (JUN-100)."""

    employee_id: str
