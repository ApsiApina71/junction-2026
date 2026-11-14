"""In-memory state, seeded from fixtures/. Uploaded files go under DATA_DIR; everything else resets on restart."""

import json
import os
import threading
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .models import Doc, Employee, HelpSession, Process, Recording

APP_DIR = Path(__file__).resolve().parent.parent
FIXTURES = APP_DIR / "fixtures"
DATA_DIR = Path(os.getenv("DATA_DIR", APP_DIR / "data"))
TIMEZONE = ZoneInfo(os.getenv("TIMEZONE", "Europe/Helsinki"))


def now_iso() -> str:
    return datetime.now(TIMEZONE).isoformat(timespec="seconds")


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def _doc_title(text: str, filename: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()[:80]
    return Path(filename).stem.replace("-", " ").replace("_", " ")[:80]


class Store:
    def __init__(self, data_dir: Path = DATA_DIR) -> None:
        self.lock = threading.Lock()
        self.data_dir = data_dir
        self.media_dirs = [FIXTURES / "media", data_dir / "media"]
        self.employees: dict[str, Employee] = {}
        self.processes: dict[str, Process] = {}
        self.docs: dict[str, tuple[Doc, str]] = {}
        self.help: dict[str, HelpSession] = {}
        self.recordings: dict[str, Recording] = {}
        self._counter = 0

        for path in sorted(FIXTURES.glob("employee*.json")):
            employee = Employee.model_validate_json(path.read_text(encoding="utf-8"))
            self.employees[employee.id] = employee
        for path in sorted(FIXTURES.glob("process-*.json")):
            process = Process.model_validate_json(path.read_text(encoding="utf-8"))
            self.processes[process.id] = process
        for folder in (FIXTURES / "docs", data_dir / "docs"):
            for path in sorted(folder.glob("*")) if folder.is_dir() else []:
                if path.suffix.lower() in {".md", ".txt"}:
                    self._add_doc(path.name, path.read_text(encoding="utf-8"), path.stat().st_mtime)

    def next_id(self, prefix: str) -> str:
        with self.lock:
            self._counter += 1
            return f"{prefix}-{self._counter}"

    def _add_doc(self, filename: str, text: str, mtime: float | None = None) -> Doc:
        uploaded = datetime.fromtimestamp(mtime, TIMEZONE).isoformat(timespec="seconds") if mtime else now_iso()
        doc = Doc(id=f"doc-{Path(filename).stem}", title=_doc_title(text, filename), filename=filename, chars=len(text), uploaded_at=uploaded)
        self.docs[doc.id] = (doc, text)
        return doc

    def add_doc(self, filename: str, text: str) -> Doc:
        folder = self.data_dir / "docs"
        folder.mkdir(parents=True, exist_ok=True)
        (folder / filename).write_text(text, encoding="utf-8")
        with self.lock:
            return self._add_doc(filename, text)

    def media_path(self, rel: str) -> Path | None:
        """The file behind /media/<rel>, or None. Never resolves outside the media folders."""
        for root in self.media_dirs:
            root = root.resolve()
            candidate = (root / rel).resolve()
            if candidate.is_relative_to(root) and candidate.is_file():
                return candidate
        return None

    def save_media(self, rel: str, data: bytes) -> str:
        """Writes a file under DATA_DIR/media and returns its /media path."""
        root = (self.data_dir / "media").resolve()
        path = (root / rel).resolve()
        if not path.is_relative_to(root):
            raise ValueError("bad media path")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return f"/media/{rel}"
