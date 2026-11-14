---
status: draft
tags: [app, ios, glasses, dat, prototype]
last-updated: 2026-11-14
---

# owl-glasses

The **Onboarding Owl** iPhone app for **Meta Ray-Ban Display** glasses ([JUN-29](https://linear.app/junction-2026-bossit/issue/JUN-29), spec [docs/specs/onboarding-owl.md](../../docs/specs/onboarding-owl.md)). Built on Meta's open-source DAT `DisplayAccess` sample (see `LICENSE-meta-sample`); it started as `bite-ios` ("Bite with Bo the bear", food tracking on `apps/glasses-api`; that code is in git history before the Owl flow replaced it).

What works in the simulator chain (iOS Simulator + MockDeviceKit + mock owl-api), not yet on real Display glasses:

- **Phone stays in the pocket:** "Hey Meta, start Owl" (DAT voice invocations) opens Owl on the display; every invocation is answered once.
- **Learn & Check:** task list → step cards with the expert's reference image; Owl Check sends camera **stream frames** (never photo capture) to `POST /check` every 1.5 s and on the Done pinch, shows ✓/✗ per order line and speaks the server's `say` through the glasses speakers.
- **Ask:** glasses speech recognition (DAT Speech, restarted after its ~1 min stop) → `POST /ask` → answer and source on the display, spoken.
- **Help:** stream frames to `POST /help/frames` every 2 s, expert messages spoken once.
- **Record:** pinch per step → H.264 clip of the stream, one reference frame and the narration → `POST /record/{id}/steps` → finish.
- **Who wears the glasses:** the employer names the pair once in the app (Server → Glasses id, e.g. `glasses-1`); owl-api says which employee wears it (`GET /glasses/{id}/employee`), and tasks come in that employee's language when a translation exists.
- **Problems handled:** glasses not assigned to anyone, camera or microphone not allowed (Owl never asks on the worker's glasses; the employer grants once with the phone's Permissions button), glasses taken off (pauses, comes back when put on), no network (cached tasks, steps work without the check), server errors (keeps going without the check).
- DAT analytics and crash reporting opted out in `Info.plist`.

## Where things are

| Path | What |
|---|---|
| `DisplayAccess/Owl/OwlViewModel.swift` | The Owl flow on the glasses |
| `DisplayAccess/Owl/OwlVoice.swift` | Voice invocations and glasses speech |
| `DisplayAccess/Owl/OwlCamera.swift` | HEVC stream (keeps working in the background), on-demand decode, clip recording |
| `DisplayAccess/Owl/OwlAPI.swift`, `OwlModels.swift` | owl-api client and contract shapes |
| `DisplayAccess/Owl/OwlBasicScreens.swift` | Plain screens until JUN-36 lands |
| `DisplayAccess/Owl/Display/` | Owl glasses screens and art (JUN-36) |
| `DisplayAccess/Views/SampleAppsView.swift` | Phone UI and simulator test hooks |
| `DisplayAccess/ViewModels/` | Meta's session, registration and mock-device code |

The simulator demo photo (`Assets.xcassets/demoMeal.imageset`) is [Lohikeitto.jpg](https://commons.wikimedia.org/wiki/File:Lohikeitto.jpg) from Wikimedia Commons; see the file page for its licence and author.
