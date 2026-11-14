---
status: active
tags: [runbook, demo, owl, glasses]
last-updated: 2026-11-14
---

# Owl demo: start the stack and rehearse on the glasses

How to bring up Onboarding Owl on demo day: owl-api, the https tunnel, the glasses app on the iPhone, and the simulator chain as a backup. The last section is the checklist for the rehearsal on real Meta Ray-Ban Display glasses ([JUN-53](https://linear.app/junction-2026-bossit/issue/JUN-53)).

- Spec: [specs/onboarding-owl.md](../specs/onboarding-owl.md). API shapes: [specs/owl-contract.md](../specs/owl-contract.md).
- App details: [`apps/owl-api/CLAUDE.md`](../../apps/owl-api/CLAUDE.md), [`apps/owl-glasses/CLAUDE.md`](../../apps/owl-glasses/CLAUDE.md).
- Submission checklist: [demo-day.md](demo-day.md).

## 1. Network

Put the Mac on the iPhone's Personal Hotspot. The venue Wi-Fi may block traffic between devices, and the hotspot keeps the address stable.

```sh
ipconfig getifaddr en0        # the Mac's address, e.g. 172.20.10.10
```

## 2. owl-api

```sh
cd apps/owl-api
cp .env.example .env          # once; a human fills in ANTHROPIC_API_KEY
```

Without an API key, run on mock data. Every flag makes that feature answer from `fixtures/`:

```sh
OWL_MOCK_CHECK=1 OWL_MOCK_ASK=1 OWL_MOCK_RECORD=1 \
PUBLIC_BASE_URL=https://<name>.trycloudflare.com \
uv run --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8000
```

With a key, leave out the `OWL_MOCK_*` flags so Check, Ask and Record use the models. Set `API_TOKEN=<token>` when the tunnel is public, and give the same token to the glasses app (step 4).

Run it without `--reload` during the demo: help sessions and recordings live in memory, and a restart drops them.

Check:

```sh
curl http://<mac ip>:8000/health                       # {"status": "ok", ...}
curl http://<mac ip>:8000/glasses/glasses-1/employee   # the worker who wears glasses-1
```

## 3. https tunnel (video)

The DAT `VideoPlayer` plays https URLs only, so "Watch how" clips need the tunnel.

```sh
brew install cloudflared                          # once
cloudflared tunnel --url http://localhost:8000    # prints https://<name>.trycloudflare.com
```

Start owl-api with that address as `PUBLIC_BASE_URL` (step 2). The quick-tunnel address changes every time cloudflared restarts. Then restart owl-api with the new address, and update the glasses app's Server sheet if it uses the tunnel.

## 4. Glasses app on the iPhone

Build and install from the Mac with the iPhone connected by cable:

```sh
xcrun devicectl list devices                      # the iPhone's UDID
cd apps/owl-glasses
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess -destination 'id=<iPhone UDID>' \
  -derivedDataPath /tmp/owl-dev -allowProvisioningUpdates DEVELOPMENT_TEAM=<team id> \
  OWL_API_URL=http://<mac ip>:8000 build
xcrun devicectl device install app --device <iPhone UDID> /tmp/owl-dev/Build/Products/Debug-iphoneos/DisplayAccess.app
```

Use your own Apple ID team as `<team id>` (Aapo's personal team: `7CH55JWQFH`). Add `OWL_API_TOKEN=<token>` when owl-api has `API_TOKEN`.

Once, by the employer, on the phone:

1. Meta AI app: pair the glasses. Turn on Developer Mode: Settings → App Info → tap the version 5 times.
2. Owl → **Settings** tab → **Connect**. Approve Owl in Meta AI.
3. Owl tab → **Permissions**. Allow the camera and the microphone.
4. Owl tab → **Server**. Fill in the owl-api address (LAN or the tunnel), the glasses id (`glasses-1`, the name in Owl Studio) and the API token. Leave the employee id empty, because owl-api says who wears the glasses.

Then the phone goes into the pocket. Owl starts from **Open Owl on glasses**. "Hey Meta, start Owl" needs Owl registered in Wearables Developer Center, which is not done yet.

## 5. Simulator chain (backup, no glasses)

```sh
cd apps/owl-glasses
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath /tmp/owl-dd \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= OWL_API_URL=http://127.0.0.1:8000 build
xcrun simctl install "iPhone 17" /tmp/owl-dd/Build/Products/Debug-iphonesimulator/DisplayAccess.app
SIMCTL_CHILD_OWL_AUTO_PREVIEW=inApp xcrun simctl launch "iPhone 17" fi.junction2026.bossit.owl
```

Open the simulator window with **DeviceHub** (`/Applications/Xcode.app/Contents/Applications/DeviceHub.app`; Xcode 27 has no Simulator.app). The black square in the Developer preview sheet is the glasses display; click its buttons as Neural Band pinches.

Under the preview there are test buttons:

| Button | Does |
|---|---|
| Hey Meta, start Owl | Sends a voice invocation from the mock glasses |
| Take off / Put on | Takes the mock glasses off and puts them back on |
| Speak | Sends the typed question as glasses speech, while Owl shows "Listening…" |
| Real · OK · Warning · Unsure | Picks the answer of the mock Owl Check |

For the Chrome simulator, launch with `SIMCTL_CHILD_OWL_AUTO_PREVIEW=chrome`, open `http://127.0.0.1:9000` in Chrome and turn on the "Meta Ray-Ban Display Simulator" extension. More launch hooks are in [`apps/owl-glasses/CLAUDE.md`](../../apps/owl-glasses/CLAUDE.md).

## 6. Rehearsal on real glasses (JUN-53)

Test the three unknowns first. They decide the demo plan:

- [ ] **Phone locked in a pocket:** start a task, lock the phone, put it in a pocket. Owl Check still updates the step card, a Done pinch moves to the next step, and Owl still speaks.
- [ ] **Camera and display together:** on an order step, the status line changes ("Owl is watching." → "✓ Looks right" or a warning) while the step card stays responsive.
- [ ] **Video clip:** on step 2, **Watch** plays the expert's clip from the tunnel, then returns to the step card.

Then run the full demo twice in a row:

- [ ] Open Owl → personal welcome (shown and spoken) → task list.
- [ ] Step card with the reference image → Owl Check warning (wrong product or quantity) → fix → **Check again** → ✓.
- [ ] Ask: a spoken question → answer with its source, on the display and spoken. Needs glasses Speech; if it is not enabled for Owl in Developer Center yet, show Ask from the simulator.
- [ ] Help: the expert answers in Owl Studio, the glasses speak it and show the marked frame.
- [ ] Finish the task → "Well done".

Backup plan:

- [ ] **No network:** Owl keeps the last loaded tasks. Steps still work and the worker confirms them with the pinch, without the check.
- [ ] **Model or server down:** Owl says it can't check right now and keeps going.
- [ ] **Glasses fail:** run the simulator chain (step 5) on the laptop, and use the recorded demo video.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "These glasses are not assigned to anyone yet" | Assign the glasses id to the worker in Owl Studio, or set the right id in the Server sheet |
| "No connection to Owl's server" | Mac and iPhone on the same hotspot? `curl http://<mac ip>:8000/health`, and check the address in the Server sheet |
| Watch does nothing / "Video needs the https server" | Start the tunnel and owl-api with `PUBLIC_BASE_URL` (step 3) |
| "Owl's server said no" | The token in the Server sheet does not match `API_TOKEN` |
| Camera or microphone "not allowed" | Owl tab → Permissions (step 4) |
| Display stays empty | Settings tab: the glasses connected and Owl registered? Restart Owl |
