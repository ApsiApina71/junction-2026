"""In-memory state, seeded from fixtures/. Uploaded files go under DATA_DIR; everything else resets on restart."""

import json
import os
import secrets
import shutil
import threading
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from .models import Doc, Employee, HelpSession, Process, Recording

APP_DIR = Path(__file__).resolve().parent.parent
FIXTURES = APP_DIR / "fixtures"
DATA_DIR = Path(os.getenv("DATA_DIR", APP_DIR / "data"))
# The company for new workers without a task and for recordings. Defaults to the company of the demo worker.
COMPANY = os.getenv("OWL_COMPANY", "")
DEFAULT_EMPLOYEE = "emp-sami"
TIMEZONE = ZoneInfo(os.getenv("TIMEZONE", "Europe/Helsinki"))


def now_iso() -> str:
    return datetime.now(TIMEZONE).isoformat(timespec="seconds")


def load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def lang_key(language: str) -> str:
    """The primary subtag in lower case: "fi-FI" and "FI" are both "fi"."""
    return language.split("-")[0].lower()


def _doc_title(text: str, filename: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()[:80]
    return Path(filename).stem.replace("-", " ").replace("_", " ")[:80]


class Store:
    def __init__(self, data_dir: Path = DATA_DIR) -> None:
        self.lock = threading.RLock()  # re-entrant: a locked update may call a store method that locks again
        self.data_dir = data_dir
        self.media_dirs = [FIXTURES / "media", data_dir / "media"]
        self.employees: dict[str, Employee] = {}
        self.processes: dict[str, Process] = {}
        # (process id, lang_key) -> the process in another language. Same step ids as the original.
        self.translations: dict[tuple[str, str], Process] = {}
        self.docs: dict[str, tuple[Doc, str]] = {}
        self.help: dict[str, HelpSession] = {}
        # help session id -> its media folder. The folder name has a random part, so a frame URL cannot be guessed.
        self.help_dirs: dict[str, str] = {}
        self.recordings: dict[str, Recording] = {}
        # Employees whose welcome someone wrote by hand. Every other welcome is rewritten when the employee changes.
        self.custom_welcomes: set[str] = set()
        self._counter = 0

        for path in sorted(FIXTURES.glob("employee*.json")):
            employee = Employee.model_validate_json(path.read_text(encoding="utf-8"))
            self.employees[employee.id] = employee
        for path in sorted(FIXTURES.glob("process-*.json")):
            process = Process.model_validate_json(path.read_text(encoding="utf-8"))
            if "." in path.stem:  # process-<name>.<lang>.json is process-<name>.json in another language
                self.translations[(process.id, lang_key(process.language))] = process
            else:
                self.processes[process.id] = process
        for folder in (FIXTURES / "docs", data_dir / "docs"):
            for path in sorted(folder.glob("*")) if folder.is_dir() else []:
                if path.suffix.lower() in {".md", ".txt"}:
                    self._add_doc(path.name, path.read_text(encoding="utf-8"), path.stat().st_mtime)

    def company(self) -> str:
        """The company this owl-api runs for (one company per server; multi-company is out of scope)."""
        return COMPANY or next((e.company for e in self.employees.values() if e.id == DEFAULT_EMPLOYEE and e.company), "")

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

    def remove_doc(self, doc_id: str) -> bool:
        """Forgets a document and deletes its uploaded file. A fixture document comes back on restart."""
        with self.lock:
            entry = self.docs.pop(doc_id, None)
        if entry is None:
            return False
        uploaded = self.data_dir / "docs" / Path(entry[0].filename).name
        if uploaded.is_file():
            uploaded.unlink()
        return True

    def translated(self, process: Process, language: str) -> Process:
        """The process in this language when a translation is stored, otherwise the process as it is."""
        if not language or lang_key(language) == lang_key(process.language):
            return process
        found = self.translations.get((process.id, lang_key(language)))
        # Publishing happens on the original; a translation follows it.
        return found.model_copy(update={"status": process.status}) if found else process

    def drop_translations(self, process_id: str) -> None:
        for key in [k for k in self.translations if k[0] == process_id]:
            del self.translations[key]

    def help_dir(self, help_id: str) -> str:
        """The media folder of a help session, made on first use."""
        with self.lock:
            if help_id not in self.help_dirs:
                self.help_dirs[help_id] = f"help/{help_id}-{secrets.token_urlsafe(12)}"
            return self.help_dirs[help_id]

    def remove_help_media(self, help_id: str) -> None:
        """Deletes every frame of a help session from disk."""
        with self.lock:
            rel = self.help_dirs.pop(help_id, None)
        if rel:
            self._remove_media_dir(rel)

    def clear_help_media(self) -> None:
        """Deletes help frames left behind by an earlier run. Sessions live in memory, so nothing can still need them."""
        self._remove_media_dir("help")

    def _remove_media_dir(self, rel: str) -> None:
        root = (self.data_dir / "media").resolve()
        path = (root / rel).resolve()
        if path != root and path.is_relative_to(root):
            shutil.rmtree(path, ignore_errors=True)

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
