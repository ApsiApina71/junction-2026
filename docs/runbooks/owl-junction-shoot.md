# Junction shoot: the volunteer story (JUN-102)

How to set up the software for the demo video. Owl trains Sami, a new Junction volunteer. The script and the scenes are in [JUN-102](https://linear.app/junction-2026-bossit/issue/JUN-102).

**Rule:** no scripted demo mode in the filmed takes. Start owl-api with `OWL_STORY=junction` and **without** `OWL_DEMO`. The story changes only the data (people, the task, the handbook). Vision, the rules, Hint and Help are the real engine.

## What the story holds (JUN-105)

| | |
|---|---|
| Company | Junction 2026. The other demo companies are removed, so Studio shows only Junction |
| Laura (`emp-laura`) | Crew lead, the expert. No glasses until the Record scene |
| Sami (`emp-sami`) | Volunteer on `glasses-1`. Language `en`, so Owl's lines match the script word for word. His welcome is Finnish with the Finnish voice (`welcome_language: fi`). Camera and location consent given. Day 1 of 3 of training, with customer service mode |
| Mika (`emp-mika`) | Shift manager, on shift, answers Help on his phone (`answers_on: phone`, JUN-107) |
| Task | "Recycling round" (`proc-recycling`). Step 1 "Sort the cans" opens at the place "Recycling point" (the white sorting bin with the round CANS opening and the black square PLASTIC opening). If a can is over the PLASTIC opening, Owl says "That's a deposit can. It goes in the CANS hole." (JUN-106). Step 2 "Swap a full bag" is not in the video |
| Handbook | "Junction 2026: volunteer handbook" (`apps/owl-api/fixtures/stories/junction/`). It has the final deadline and the deposit rule, and nothing about lost devices, so Hint for the found device is honestly "Not in the handbook. Ask a colleague." |
| Areas | Recycling point, Info desk, Main hall |
| Desk sign | "Owl is listening during training. …" (Studio → Training → print the sign) |

## Start

```sh
cd apps/owl-api
# .env needs the real models: ANTHROPIC_API_KEY (Hint, Record, fallback) and, for Nemotron, VISION_BACKEND=nemotron + VERDA_INFERENCE_KEY
OWL_RESET=1 OWL_STORY=junction DATA_DIR=data/junction OWL_STAGE=1 \
  PUBLIC_BASE_URL=https://<tunnel>.trycloudflare.com \
  uv run --extra jepa --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- Without `ANTHROPIC_API_KEY`, set `ASSIST_BACKEND=nemotron`: Nemotron writes the Hint bullets from the handbook, and each one must quote it word for word (0.5–1.5 s; 10 of 11 info-desk questions right in the test, including both script lines). If Nemotron fails, the local search (BM25) answers. `OWL_MOCK_ASSIST=1` uses only the local search.
- `OWL_RESET=1` only for the first start. Without it, a restart keeps what Studio changed (Laura's recording, the place photo).
- `DATA_DIR=data/junction` keeps the story apart from the usual demo state.
- `--extra jepa` and `JEPA_BACKEND=vjepa21` are needed for V-JEPA. `vjepa21` is Meta's V-JEPA 2.1 (March 2026) with an attentive probe trained on Laura's clips and on clips of not doing the step (put them in `data/junction/jepa-other/`, e.g. walking or the info desk). On the venue footage it recognised "Sort the cans" on every held-out window and said "unsure" for other work. Without it, the VO line about V-JEPA is cut. VO wording that is true: "Meta's V-JEPA 2.1 recognises the step from Laura's clips".
- `GET /health` tells which models really run (`vision_model`, `step_recognition`). Screenshot it for Lauri.
- Tunnel and glasses: see [owl-demo.md](owl-demo.md).

## Before filming

1. **Photo of the recycling point:** Studio → Map → Recycling point, or the step's picture in the task editor. Take it at the real spot, from head height. Without a photo, the step cannot open by itself.
2. **Mika's phone:** open Owl Studio's Help view on the phone and keep it open.
3. **Print the desk sign** (Studio → Training).
4. **Props:** deposit cans and the white sorting bin at the venue's recycling point (round CANS opening, black square PLASTIC opening), and a device for the found item. The step's checks name exactly these; with other props, change the step in Studio first.

## Scene by scene

| # | Scene | What to do |
|---|---|---|
| 1 | Laura records | Studio → People: give `glasses-1` to Laura. On the glasses: Record, then agree (clips stored, faces blurred). Laura walks the round and says the deposit rule. Studio → Tasks: review the draft and Publish. Check that the deposit step got the warning line, then add the place "Recycling point" to it. Then give `glasses-1` back to Sami and put Laura's task on Sami (or keep the placeholder task). |
| 2 | Sami starts | "Hey Meta, start Owl". The welcome is in Finnish. Display: "Go to: Recycling point" |
| 3 | Deposit can | Sami holds a can over the black square PLASTIC opening. Owl warns after two looks in a row (about 2–4 s with Nemotron): "That's a deposit can. It goes in the CANS hole." He moves it over the round CANS opening and pinches Done **while the can is still over the opening** (once it has dropped in, the camera cannot see it): ✓ and a hoot. Tested with the venue footage: the warning, the ✓ and no warning while he walks up with the can |
| 4 | Stage view | `https://<tunnel>/stage?token=<API_TOKEN>` on a laptop, recorded for the split screen |
| 5 | Info desk | Customer service on. The hacker asks "When's the final deadline?" Hint pinch: Sun 10:00 · set to FINAL on Junction Platform · peer review 10:30 |
| 6 | Found device | "Found this under a table. Whose is it?" Hint: "Not in the handbook. Ask a colleague." Help pinch → "Calling Mika, shift manager…" → Mika answers on the phone → "Mika is watching your view". Mika talks, and Sami hears and reads it |
| 7 | Montage | Simulator: another language, captions-first, easy language (Studio → People → Sami). Pause camera with one pinch |

## What the VO may claim

- Check pictures are never saved.
- The vision model is what `/health` says: Nemotron 3.5 Super VL on Verda (`VISION_BACKEND=nemotron`), with Claude as the fallback, or Claude.
- The verifier is the rules, always. Jev joins only with `JEV_API_KEY`.
- V-JEPA 2 recognises steps only with `--extra jepa` and `JEPA_BACKEND=vjepa2`.
