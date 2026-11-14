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
- **Who wears the glasses:** the employer names the pair once in the app (Server → Glasses id, e.g. `glasses-1`); owl-api says which employee wears it (`GET /glasses/{id}/employee`), the worker sees only the published tasks assigned to them (`process_ids`), in their language when a translation exists.
- **Consent (JUN-80):** on the first start Owl explains on the display and aloud, in the worker's language, what the camera does (checks only during a step, pictures not saved, nothing goes to Meta), and the worker chooses with a pinch. Without consent Owl guides without checks. **Pause camera** on the step card stops checks with one pinch. Record asks the expert to agree that clips are stored and to warn people nearby. **Forget me** on My progress erases the worker's learning data. The choice is stored on owl-api and on the phone.
- **Inclusive profiles (JUN-81)** from `Employee.access`: **audio first** speaks everything on the display too (the instruction, what Owl checks, the ✓/✗ rows, the task list, the answer's source) and talks slower; **display first** shows every spoken line as a caption on the step card, and warnings stay until a pinch; **easy language** uses short plain sentences for the app's own lines (`OwlText`) and asks owl-api for the `-x-easy` process.
- **Problems handled:** glasses not assigned to anyone, camera or microphone not allowed (Owl never asks on the worker's glasses; the employer grants once with the phone's Permissions button), glasses taken off (pauses, comes back when put on), no network (cached tasks, steps work without the check), server errors (keeps going without the check).
- **The worker's language:** the voice follows `Employee.language` (English when the phone has no voice for it), and the app's own sentences (spoken lines, the step status, errors) come from `Owl/OwlText.swift` (English and Finnish). Server texts already come in the worker's language.
- **Limitation:** the glasses recognise speech in the glasses' own language setting (DAT Speech reports it as `locale`; the app cannot choose it). Set the worker's glasses to their language in Meta AI. Ask still sends the worker's language, so answers come in it.
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
