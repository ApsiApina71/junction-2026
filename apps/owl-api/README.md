---
status: active
tags: [app, api, owl, glasses]
last-updated: 2026-11-14
---

# owl-api

The engine of **Onboarding Owl** ([spec](../../docs/specs/onboarding-owl.md)). The glasses app ([`apps/owl-glasses`](../owl-glasses/README.md)) and Owl Studio talk to it. Linear project: [Software](https://linear.app/junction-2026-bossit/project/software-e68385965606).

- **Contract:** [`docs/specs/owl-contract.md`](../../docs/specs/owl-contract.md) ([JUN-27](https://linear.app/junction-2026-bossit/issue/JUN-27)). Models in `app/models.py`.
- **Scaffold:** [JUN-28](https://linear.app/junction-2026-bossit/issue/JUN-28). Every endpoint answers from `fixtures/`, and the real engine replaces them one by one:

| Endpoint | Now | Real engine |
|---|---|---|
| `GET/PUT /processes` | fixtures, in memory. `?language=fi` answers with the stored translation (and on `PUT` stores one); `PUT` renumbers the steps | |
| `GET/POST /employees`, `GET/PUT /employees/{id}`, `GET /glasses/{glasses_id}/employee` | real, in memory, seeded from fixtures (`app/people.py`) | [JUN-41](https://linear.app/junction-2026-bossit/issue/JUN-41) |
| `POST /check` | **real**: Claude vision → rules → Jev gate → two-frames rule. `mock` form field or `OWL_MOCK_CHECK=1` for fixtures | [JUN-30](https://linear.app/junction-2026-bossit/issue/JUN-30), [JUN-37](https://linear.app/junction-2026-bossit/issue/JUN-37) |
| `POST /ask` | **real** (local section search above `ASK_MAX_CHARS`, JUN-71): every document in the cached system prompt, sources checked word for word. `OWL_MOCK_ASK=1` for the fixture | [JUN-31](https://linear.app/junction-2026-bossit/issue/JUN-31) |
| `/training`, `/employees/{id}/training` | real: plans per role, the target level from verified runs without help, suggestion seen first by the worker, confirmed by a person. Demo: Sami on the last day | [JUN-96](https://linear.app/junction-2026-bossit/issue/JUN-96) |
| `/location`, `/zones`, `/markers`, `/employees/{id}/location` | real, in memory and today only: QR markers, checkpoints that unlock steps, the live map. Only in training, with consent | [JUN-97](https://linear.app/junction-2026-bossit/issue/JUN-97) |
| `POST /assist` | **real**: Claude suggests 2–3 bullets from the company's documents, sources checked word for word. Transcript never stored or logged. `OWL_MOCK_ASSIST=1` or demo mode: local search | [JUN-98](https://linear.app/junction-2026-bossit/issue/JUN-98) |
| `GET/POST /docs`, `DELETE /docs/{id}` | real: stores `.md`, `.txt`, `.pdf` text, and deletes it again | |
| `/record` | **real**: clips converted for the display, faces blurred, Claude writes a draft process. `OWL_MOCK_RECORD=1` writes it from the narration without the model | [JUN-32](https://linear.app/junction-2026-bossit/issue/JUN-32) |
| `/help` | real, in memory. Frames in a folder with a random name, deleted when the session ends; the expert's `mark` becomes a ring on the frame | [JUN-33](https://linear.app/junction-2026-bossit/issue/JUN-33), [JUN-60](https://linear.app/junction-2026-bossit/issue/JUN-60) |
| `/media` | fixtures and uploads | |

## Owl Check

1. `app/vision.py`: Claude (`claude-opus-5-5`, low effort, structured output) describes the camera frame: which products and how many for order steps, and for visual steps an answer per numbered criterion. The expert's reference photo goes along as context. Vision never judges.
2. `app/verifier.py`, `compare()`: the deterministic decision from that description: `ok`, `wrong_item`, `missing`, `too_many`, `not_matching` or `unsure`. It abstains rather than passes what vision did not map (JUN-58): an item with an unknown line id counts as something extra, each criterion is matched by its number and exact text so one repeated answer cannot cover the others, an unanswered criterion gives `unsure`, and the reference photo never decides on its own.
3. **Jev** (TypeSafe's decision model, `typesafe/jev-1.13` through `JEV_URL`) answers the same question from the same description. Owl acts only when Jev agrees above `JEV_THRESHOLD`; otherwise it looks again (`unsure`). Without `JEV_API_KEY` the rules decide alone (`decided_by: "rules"`, `confidence: null`), so the demo never depends on one external API.
4. A problem becomes a warning only when the same problem is seen in two frames in a row. The Done pinch (`final=true`) answers at once, and **a step is only done when the rules say ok**: a wrong order is never marked done.

**What this is and is not.** Jev is a second opinion on the decision, from the same observation: it cannot catch an item that vision missed or misread. Two frames in a row are consistency over time from the same model, with correlated errors: not an independent confirmation, and not calibrated confidence. `confidence` is Jev's reported probability, never a percentage for the worker. A passed check covers only the criteria and products that were visible and reviewed, and the apps say no more than that.

Speech is in English or Finnish (`TEXTS` in `app/verifier.py`); other languages fall back to English.

## Ask

`app/ask.py` puts every company document whole into the system prompt (cached; the handbooks are small, so no retrieval index) and asks Claude for a structured answer in the worker's language. Every source quote is checked word for word against the documents: an answer whose sources cannot be found is replaced with "That's not in our instructions. Ask your shift lead." Company documents never leave this server except in the model call.

## Record and media

`app/media.py` converts every recorded clip (HEVC or H.264, MP4 or MOV) to what the DAT `VideoPlayer` plays: H.264 MP4, faststart, within 400 px per side and 70 000 pixels, 15 fps, at most 10 s. Faces in recorded photos and clips are blurred with OpenCV's YuNet detector (`app/assets/face_detection_yunet_2023mar.onnx`, from [OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet), MIT). It also takes the last frame of a short clip, for `/check` and `/help/frames` when the phone sends `clip` instead of `image`.

`app/record.py` turns a finished recording into a draft process: Claude (medium effort) rewrites each step's narration into a title, instruction, spoken sentence and check criteria, keeping the photo and clip. On a model error it falls back to the narration as it is.

On macOS, PyAV and OpenCV each bundle FFmpeg's `libavdevice`, and the Objective-C runtime prints a warning about duplicate `AVF*Receiver` classes at start-up. Those classes are for camera capture, which owl-api does not use.

## Process from documents

`app/docs_process.py` (JUN-70): `POST /processes/from-docs` turns a company document into a draft process. Claude writes the steps with word-for-word quotes (quotes not in the document are dropped); without a model, the document's numbered list or sections become the steps. Recorded steps also get `Step.rule`: the handbook sentence that backs each step, found with the local search.

## Translation

`app/translate.py` (JUN-72): `POST /processes/{id}/translate` has Claude write the process in the worker's language and stores it as the process's translation (the same store as `PUT /processes/{id}?language=`). Step ids, media, checks and order line names are kept; a translation that does not keep the steps is refused. Needs the model.

## Step recognition (V-JEPA 2)

`app/jepa.py` (JUN-34): `POST /steps/recognize` tells which step the worker is doing by comparing a 2 s clip from the glasses with the expert's clip of each step. Embeddings come from Meta's **V-JEPA 2** when the optional extra is installed, using the attentive pooler of its Something-Something v2 checkpoint (`facebook/vjepa2-vitl-fpc16-256-ssv2`, trained on hand-object actions, MIT), and from a small appearance-and-motion baseline otherwise (tests, CI, and machines without the model).

What makes it work, all measured on real video clips (see JUN-34): the SSv2 pooler instead of the plain encoder's mean; the expert's clip looked at in 2 s windows like the worker's; the last three looks of a run together; and **learning from confirmations** (`POST /steps/confirm`): every step the worker confirms adds an example, and more examples is what helps most. Prototypes and examples are embeddings only, cached in `data/jepa/`.

```sh
uv sync --extra jepa                      # torch + transformers; the model downloads from Hugging Face on first use, no login
JEPA_BACKEND=vjepa2 uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
uv run python scripts/jepa_eval.py --expert <dir> --trainee <dir> --backend vjepa2   # go/no-go on real clips
```

## Stage view

`GET /stage` (JUN-79) is a full-screen page for the projector, the peer-review table and the video: the glasses screen as the wearer sees it, the live camera view, and a timeline of Owl's checks, answers and spoken lines with who decided (`demo`, `rules`, `jev`). The glasses post their state to `POST /stage` when "Stage mirroring" is on; owl-api adds its own decisions. Everything is in memory; frames expire after 30 s and never touch the disk. Open `https://<tunnel>/stage?token=<API_TOKEN>` on any laptop.

## Demo mode

`OWL_DEMO=1` plays the demo story without models (JUN-69). `app/demo.py` replaces only the vision call with a scripted observation from `fixtures/demo-script.json`; the rules, the two-frames rule, the Done pinch and speech are the real engine, and every check says `decided_by: "demo"`. Ask answers with the best sentence of the best handbook section from the local index, and Record writes drafts from the narration. Edit the script, not the code, to change the story.

## Search

`app/search.py` splits the documents into sections by heading and ranks them with BM25, all on this server (JUN-71). Ask uses it when the documents are larger than `ASK_MAX_CHARS`, and demo mode answers from it.

## Learning progress

`app/progress.py` keeps each run of a task from its `/check` answers (JUN-73): steps done, warnings caught (once per spoken warning) and fixed, and the time to finish. Runs are linked to the worker and saved with the rest of the state. The worker reads their own with `GET /employees/{id}/progress` and erases them with `DELETE /employees/{id}/progress` ("Forget me"); `GET /stats` gives anonymous totals for the pilot. A learning aid, not monitoring: Studio never shows one person's results. That is how the screens are made, not a lock: one `API_TOKEN` opens every endpoint.

## Data

- State is seeded from `fixtures/` and saved to `data/state.json` after every change, so a restart keeps workers, processes, translations, recordings, consents and learning runs (JUN-78). `OWL_RESET=1` starts clean from the fixtures. Help sessions stay in memory on purpose: their frames are deleted when the session ends. Uploads (documents, recorded photos and clips) go to `data/` (gitignored).
- The API key stays on the server. `API_TOKEN` keeps others on the venue Wi-Fi out.
- Check frames are not stored. Help frames are deleted when the session ends, and leftovers when the server starts. Company documents stay on this server until someone deletes them.
- What leaves this server (JUN-59): each check picture, the documents with a question, a recording's narration and blurred photos, a task's words for a translation and a document a task is written from go to the model (`MODEL_ID`, Anthropic's API), and with Jev on, a written description of the view goes to TypeSafe through OpenRouter. Step-recognition clips never leave it. The whole list, with the limits, is in the spec under [Where the data goes](../../docs/specs/onboarding-owl.md#where-the-data-goes), and Owl Studio shows it to the company. Change all three together.
- `/media/*` is served without a token, because the glasses' display loads pictures and clips by address. Recorded media (`rec-<n>-<random>/`) and Help frames (`help/help-<n>-<random>/`) sit in folders with random names. Recordings made before 14 Nov 10:00 keep their plain `rec-<n>/` folder.

The step pictures in `fixtures/media/` are sample pictures for the two example tasks, made with an image model from the worker's point of view (JUN-35). They are not photos of a real workplace, and "Laura" and "Helena" are made-up experts. The step clips are still placeholders, drawn by `scripts/make_placeholder_media.py` until real ones are recorded with Owl Record (JUN-66); the script leaves existing pictures alone.
