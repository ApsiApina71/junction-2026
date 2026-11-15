---
status: active
tags: [runbook, demo, owl, glasses, reproduce]
last-updated: 2026-11-15
---

# The Junction demo: run it yourself

This runbook sets up exactly what our demo video shows, on your own machine: Owl trains Jose, a new Junction 2026 volunteer, on Meta Ray-Ban Display glasses. Sami, the crew lead, is the expert whose clip Jose learns from, and Mika, the shift manager, answers Help on his phone. Everything the demo ran on is in this repository: the people, the task, the handbook, the expert's clip, the place photos and the V-JEPA training videos. Only the model keys are yours to bring.

There is **no scripted demo mode** in this setup. `OWL_STORY=junction` changes only the data. Vision, the rules, Hint and Help are the real engine, and the video was filmed on it.

## What you need

| For | You need |
|---|---|
| The server (owl-api) | A Mac with Apple silicon (V-JEPA runs on MPS), or Linux with CUDA, or any CPU (slower). Python 3.13+ and [uv](https://docs.astral.sh/uv/). About 2 GB of disk for the V-JEPA 2.1 weights, which download from Meta on the first start |
| The models | An OpenAI-compatible endpoint serving **NVIDIA Nemotron 3.5 Super VL** (we ran `NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4` on vLLM in a Verda container) and its key. **Or** an Anthropic key with `LLM_BACKEND=claude`. Our own Verda endpoint is closed after the event |
| Owl Studio | Node 22.12+ |
| The glasses | Meta Ray-Ban Display glasses with the Neural Band, an iPhone with the Meta AI app in developer mode, a Mac with Xcode. See [apps/owl-glasses/README.md](../../apps/owl-glasses/README.md) |
| Reaching the server from the glasses | An https tunnel, for example `cloudflared` (the glasses' video player refuses http), and a **stable network** on the Mac |

Without glasses you can still run the server, Studio and the glasses app in the iOS Simulator with Meta's MockDeviceKit (`apps/owl-glasses/CLAUDE.md`).

## What the story holds

| | |
|---|---|
| Company | Junction 2026. The other demo companies are removed, so Studio shows only Junction |
| Jose (`emp-jose`) | The volunteer in training, on `glasses-1`. English. Camera and location consent given. Day 1 of 3 of training, with customer service mode |
| Sami (`emp-sami`) | Crew lead, the expert |
| Mika (`emp-mika`) | Shift manager, on shift, answers Help on his phone (`answers_on: phone`) |
| Task | "Recycling round" (`proc-recycling`), one step: **Sort the cans**. It opens at the place "Recycling point", the white sorting bin with the round CANS opening and the black square PLASTIC opening. The expert's clip plays by itself when the step opens. A can over the PLASTIC opening: "That's a deposit can. It goes in the CANS hole." A can going into CANS: Owl marks the step done by itself (`done_when`), no Done pinch |
| Handbook | "Junction 2026: volunteer handbook". It has the final deadline and the deposit rule, and nothing about lost devices, so a found device is honestly "Not in the handbook. Ask a colleague." |
| Areas | Recycling point, Info desk, Main hall |
| Files | `apps/owl-api/fixtures/stories/junction/` (story, task, handbook, V-JEPA videos and their [data card](../../apps/owl-api/fixtures/stories/junction/jepa/README.md)) and `apps/owl-api/fixtures/media/proc-recycling/` (the expert's clip, the step picture, five place photos) |

The task, the clip and the photos fit **our** bin. On your own bin, record the step again (Studio or the glasses' Record) or replace the clip and the place photos in Studio.

## 1. Start owl-api

```sh
cd apps/owl-api
cp .env.example .env
```

Put the key in `.env` yourself (agents never read `.env`):

```sh
# Nemotron, as in the demo
VERDA_INFERENCE_KEY=<your key>
NEMOTRON_URL=https://<your endpoint>/v1      # default: our closed Verda container
NEMOTRON_MODEL=<served model name>            # default: nemotron-3.5-super-vl
# or Claude instead: ANTHROPIC_API_KEY=<your key>, and LLM_BACKEND=claude below
```

Open the tunnel first, so the server knows its public address:

```sh
cloudflared tunnel --url http://localhost:8000      # prints https://<name>.trycloudflare.com
```

Then start the server exactly as in the demo:

```sh
OWL_RESET=1 OWL_STORY=junction DATA_DIR=data/junction OWL_STAGE=1 \
  LLM_BACKEND=nemotron JEPA_BACKEND=vjepa21 \
  PUBLIC_BASE_URL=https://<name>.trycloudflare.com \
  uv run --extra jepa --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8000
```

- `OWL_RESET=1` only on the first start. Later starts keep what Studio changed (a new recording, a place photo, Jose's progress).
- `DATA_DIR=data/junction` keeps the story apart from other demo state. The story copies its V-JEPA videos there on start.
- `--extra jepa` and `JEPA_BACKEND=vjepa21` load Meta's V-JEPA 2.1 (the first start downloads it, about 1.6 GB, and keeps its 350 MB encoder in `~/.cache/owl/`) and train the task's probe on the story's videos in about half a minute.
- `OWL_STAGE=1` turns on the stage page.
- Set `API_TOKEN=<token>` when the tunnel is public, and give the same token to the glasses app and Studio.

**Check that the real models run:**

```sh
curl https://<name>.trycloudflare.com/health
# "model_id": "nemotron-3.5-super-vl", "vision_model": "nemotron-3.5-super-vl",
# "step_recognition": "vjepa21 (V-JEPA 2.1 ViT-B + attentive probe, ...)"
```

`baseline` in `step_recognition` means the `jepa` extra is missing: start again with `uv run --extra jepa`.

## 2. Owl Studio (Mika's phone and the company view)

```sh
cd apps/owl-studio
npm ci
VITE_API_URL=https://<name>.trycloudflare.com npm run build
npx vite preview --host     # or serve dist/ from any static server, behind its own tunnel for a phone
```

Open `/#/help` on Mika's phone and keep it open: a Help call from Jose rings there. With `API_TOKEN` set, enter the token under Settings.

## 3. The glasses

Set up developer mode, signing and the Meta AI connection once, as in [apps/owl-glasses/README.md](../../apps/owl-glasses/README.md#run-on-your-own-glasses). Then build with your server address baked in and install:

```sh
cd apps/owl-glasses
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/owl-dev -allowProvisioningUpdates DEVELOPMENT_TEAM=<team id> \
  OWL_API_URL=https://<name>.trycloudflare.com [OWL_API_TOKEN=<token>] build
xcrun devicectl device install app --device <iPhone UDID> /tmp/owl-dev/Build/Products/Debug-iphoneos/DisplayAccess.app
```

The address, the token and the glasses id can also be changed on the phone: Owl Boarding → Setup → Server. The glasses id `glasses-1` (the default) is Jose's in the story. Allow the camera under Setup → Permissions. Then, wearing the glasses with the phone unlocked: **Open Owl on glasses** in the phone app. "Hey Meta, start Owl" needs the app registered in Meta's Wearables Developer Center (see the glasses README).

## 4. The scenes, and what you should see

| # | Scene | What to do | What Owl does |
|---|---|---|---|
| 1 | Jose starts | Open Owl | "Welcome to Junction, Jose!" and the task list |
| 2 | To the bin | Recycling round. Walk to the bin and **look down at it** | "Go to: Recycling point" with the place photo. At the bin the camera matches the place: "You are there. The step is open." The expert's clip plays by itself |
| 3 | Wrong opening | Hold a deposit can over the black square PLASTIC opening, hand and can in view | Two looks in a row (2–4 s), then the warning card and "That's a deposit can. It goes in the CANS hole." |
| 4 | Right opening | Put the can into the round CANS opening, keep it in view | "Looks right.", then about 3 s later ✓ "Well done. Step done." and the finished screen, without a pinch |
| 5 | Info desk | Customer service on. Someone asks "When's the final deadline?" and goes quiet | A Hint from the handbook: Sunday 10:00, set to FINAL on the Junction platform, peer review 10:30 |
| 6 | Found device | "Found this under a table. Whose is it?" | "Not in the handbook. Ask a colleague." |
| 7 | Help | Help → Call Mika | "Calling Mika, shift manager…". Mika answers on his phone and sees Jose's view; "Mika is watching your view". His words are spoken on the glasses |

Timings from our run on real glasses (server log, 15 November 2026): place match to the step opening in about 2 s, a Nemotron check in 0.6–0.8 s, V-JEPA "Sort the cans" with 0.85–0.93 margin over "other", warning to ✓ in about 30 s of handling.

**Watch Owl decide:** `https://<name>.trycloudflare.com/stage` (with `?token=<API_TOKEN>` when set; Stage mirroring on in the phone app) shows what the glasses display and say, each V-JEPA answer ("Step 1: Sort the cans, 92 %"), and each check as "seen by Nemotron 3.5 VL · decided by rules".

**Before another run:** reset Jose's progress, so the task starts from the beginning.

```sh
curl -X DELETE https://<name>.trycloudflare.com/employees/emp-jose/progress
```

## 5. Measure V-JEPA yourself

```sh
cd apps/owl-api
uv run --extra jepa python scripts/jepa_probe_eval.py
```

Leave-one-video-out on the story's videos. Ours: 55 of 55 held-out 2 s windows right. Method, numbers and limits: [the data card](../../apps/owl-api/fixtures/stories/junction/jepa/README.md).

## Known limits

- **Meta AI's "Record display" takes the glasses camera.** Camera clients on the glasses do not share the camera (DAT has no API for it), so while the glasses record, Owl's checks, place match and step recognition stop ("Owl can't check this step"). Film the display some other way (the stage page) or film without Owl's camera.
- **The tunnel needs a stable network.** When the Mac's network dropped, every request from the glasses got 502/530 and Owl said it could not check, although the camera kept running. Owl recovers by itself when the tunnel answers again.
- **Heat.** Keep takes short and let the glasses cool between them. The camera runs at low resolution (360×640, 7 fps).
- **Look at the work.** The checks see only what the glasses camera sees: look down at the bin with the can in view.

## What the video may claim

- Check pictures are never saved. Help views are deleted when the call ends.
- Owl Check sees the step with NVIDIA Nemotron 3.5 Super VL on Verda, as `/health` says. Right, wrong and done are decided by deterministic rules (two looks in a row).
- Meta's V-JEPA 2.1 recognises the step from the expert's clips (with `--extra jepa` and `JEPA_BACKEND=vjepa21`).
- Hint answers only with sentences found word for word in the handbook.
