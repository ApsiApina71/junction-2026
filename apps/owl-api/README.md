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
| `POST /ask` | **real**: every document in the cached system prompt, sources checked word for word. `OWL_MOCK_ASK=1` for the fixture | [JUN-31](https://linear.app/junction-2026-bossit/issue/JUN-31) |
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

## Data

- State lives in memory, seeded from `fixtures/`. Uploads (documents, recorded photos and clips, help frames) go to `data/` (gitignored).
- The API key stays on the server. `API_TOKEN` keeps others on the venue Wi-Fi out.
- Check frames are not stored. Help frames are deleted when the session ends, and leftovers when the server starts. Company documents stay on this server until someone deletes them.

The placeholder images and clips in `fixtures/media/` are generated by `scripts/make_placeholder_media.py`.
