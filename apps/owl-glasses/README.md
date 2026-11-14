---
status: draft
tags: [app, ios, glasses, dat, prototype]
last-updated: 2026-11-14
---

# owl-glasses

The **Onboarding Owl** iPhone app for **Meta Ray-Ban Display** glasses ([JUN-29](https://linear.app/junction-2026-bossit/issue/JUN-29), spec [docs/specs/onboarding-owl.md](../../docs/specs/onboarding-owl.md)). Built on Meta's open-source DAT `DisplayAccess` sample (see `LICENSE-meta-sample`); it started as `bite-ios` ("Bite with Bo the bear", food tracking on `apps/glasses-api`; that code is in git history before the Owl flow replaced it).

What works in the simulator chain (iOS Simulator + MockDeviceKit + mock owl-api), not yet on real Display glasses:

- **Phone stays in the pocket:** "Hey Meta, start Owl" (DAT voice invocations) opens Owl on the display; every invocation is answered once.
- **Learn & Check:** task list → step cards with the expert's photo, the order lines or what Owl looks for, and where the worker is in the task. Owl Check sends camera **stream frames** (never photo capture) to `POST /check` while the worker works and on the Done pinch. Owl speaks a problem once, keeps watching while the correction is shown and notices the fix by itself.
- **A step is done only when verified (JUN-57):** Done runs a final check on a picture taken after the pinch, and only an answer that says `step_done` for this run, step and attempt counts (`Owl/OwlRunLog.swift`, tested by `Tests/run.sh`). When Owl cannot check (no camera, no network, server error, cannot see), the worker chooses between checking again and **Continue unverified**; when the worker switched the checks off, Done goes on. The last screen lists every step as verified, not verified or no check, and says "Well done" only when every check passed. An answer that arrives after the worker moved on (Ask, Help, a clip, Back, the next step) is dropped.
- **Ask:** glasses speech recognition (DAT Speech, restarted after its ~1 min stop) → `POST /ask` → answer and source on the display, spoken.
- **Help:** stream frames to `POST /help/frames` every 2 s, expert messages spoken once.
- **Record:** pinch per step → H.264 clip of the stream, one reference frame and the narration → `POST /record/{id}/steps` → finish. No wait holds the expert (JUN-93): saving a step has Cancel, which takes the step back on owl-api as well (`DELETE /record/{id}/steps/{key}`), writing the steps has Back, and Back on the Record screen keeps the recording so Record opens it again. A step with nothing said is kept for a person to write in Owl Studio.
- **Nothing of the view stays on the phone (JUN-92):** a clip is deleted when its step is over, sent or not, and leftovers of a closed app are deleted at the next start.
- **Who wears the glasses:** the employer names the pair once in the app (Server → Glasses id, e.g. `glasses-1`); owl-api says which employee wears it (`GET /glasses/{id}/employee`), the worker sees only the published tasks assigned to them (`process_ids`), in their language when a translation exists.
- **Consent (JUN-80):** on the first start Owl explains on the display and aloud, in the worker's language, what the camera does (checks only during a step; each picture goes to the AI service that checks it and Owl does not save it; the camera can be paused), and the worker chooses with a pinch. Without consent Owl guides without checks. **Pause camera** on the step card stops checks with one pinch. Record asks the expert to agree that clips are stored and to warn people nearby. **Forget me** on My progress erases the worker's learning data. The choice is stored on owl-api and on the phone.
- **Inclusive profiles (JUN-81)** from `Employee.access`: **audio first** speaks everything on the display too (the instruction, what Owl checks, the ✓/✗ rows, the task list, the answer's source) and talks slower; **display first** shows every spoken line as a caption on the step card, and warnings stay until a pinch; **easy language** uses short plain sentences for the app's own lines (`OwlText`) and asks owl-api for the `-x-easy` process.
- **Stage view (JUN-79):** with **Stage mirroring** on in the phone's Owl panel (off by default), the app posts every screen change and spoken line to `POST /stage` and one camera frame a second to `POST /stage/frame`, so the audience sees the glasses on owl-api's `/stage` page. Nothing is stored.
- **Step recognition (JUN-34):** on steps with an expert clip and no order check, with consent and the camera on, Owl sends a ~2 s HEVC clip to `POST /steps/recognize` every ~8 s. When it looks like the next step, the card says "Looks like step N. Pinch Done to go on." and Owl says it once. Owl never moves on by itself (V-JEPA 2: 60 % top-1 on real clips, so a hint only).
- **Problems handled (JUN-42):** each has its own screen that says what happened and what still works, and the phone shows the same state with what the employer can do: glasses not assigned to anyone, camera or microphone not allowed (Owl never asks on the worker's glasses; the employer grants once with the phone's Permissions button), glasses taken off (pauses and stops sharing; comes back when put on), no network (saved tasks of this worker on these glasses only, with their step pictures; the task list says the tasks are saved ones and that Owl cannot check, a step says so from its first moment, steps go on unverified, and with nothing saved the screen says "No connection" and offers Try again), server errors, a clip that cannot play. Glasses that belong to no one use the phone's language.
- **Watch how (JUN-56):** the expert's clip plays on the display; afterwards the worker goes back to the step or watches again, and playback stops when they move on. The display's player reports nothing about a clip it cannot fetch, so Owl asks for the clip's first byte before it sends the player and ends a player that has not started in 8 s. Either way the worker gets "The video can't play right now" and goes back to the step, which works without the clip.
- **Help (JUN-33, JUN-60):** the expert's marked picture of the worker's own view is shown with their words. Sharing stops when Help ends or the glasses come off.
- **The worker's language:** the voice follows `Employee.language` (English when the phone has no voice for it), and the app's own sentences (spoken lines, the step status, errors) come from `Owl/OwlText.swift` (English and Finnish). Server texts already come in the worker's language.
- **Limitation:** the glasses recognise speech in the glasses' own language setting (DAT Speech reports it as `locale`; the app cannot choose it). Set the worker's glasses to their language in Meta AI. Ask still sends the worker's language, so answers come in it.
- DAT analytics and crash reporting opted out in `Info.plist`.

## Performance (JUN-82)

Owl looks only as often as the moment needs:

- **Rate:** the next live frame waits for owl-api's `next_check_ms` (800 ms while a problem is being confirmed, 1.5 s after a warning or unsure, 3 s while the step looks right). `null` means no more frames until the next step or the Done pinch.
- **Steps without a check:** no frames, and the camera stream is closed.
- **Between steps with checks:** the stream stays on. The DAT docs give no start latency, and restarting would delay the first check of the next step.
- **Logs:** every check logs `perf:` with the frame size, the round trip, the next delay and frames per minute. The stream start time is logged too.

| Measured | Simulator (mock glasses, owl-api on the same Mac, demo mode) | Real glasses |
|---|---|---|
| Frames per minute, pick and pack | ~19 (every-second baseline: 60) | JUN-53 |
| Frame size | 6–93 KB JPEG (longest side ≤ 1024 px) | JUN-53 |
| Round trip | 4–17 ms (local) | JUN-53, on the hotspot |
| Stream start | 8 ms (mock) | JUN-53 |
| Battery over 15 min | n/a | JUN-53 |

## Where things are

| Path | What |
|---|---|
| `DisplayAccess/Owl/OwlViewModel.swift` | The Owl flow on the glasses |
| `DisplayAccess/Owl/OwlVoice.swift` | Voice invocations and glasses speech |
| `DisplayAccess/Owl/OwlCamera.swift` | HEVC stream (keeps working in the background), on-demand decode, clip recording |
| `DisplayAccess/Owl/OwlHEVC.swift` | Which stream frame is a key frame, read from the video data (JUN-91) |
| `DisplayAccess/Owl/OwlAPI.swift`, `OwlModels.swift` | owl-api client and contract shapes |
| `DisplayAccess/Owl/OwlRunLog.swift` | The rule for a verified step and what a run knows about each step (JUN-57) |
| `DisplayAccess/Owl/Display/OwlScreens.swift` | Every glasses screen, Display DSL only (JUN-36) |
| `DisplayAccess/Owl/Display/OwlArt.swift` | The owl and the drawn evidence: step picture, correction, summary |
| `DisplayAccess/Owl/Display/OwlStrings.swift` | The screens' own words, English and Finnish |
| `DisplayAccess/Owl/Display/OwlScreenGallery.swift` | Every screen with sample data, for `OWL_PREVIEW_SCREEN` |
| `DisplayAccess/Owl/OwlPhoneStatus.swift` | The phone's view of what is in the way (JUN-42) |
| `Tests/` | Tests of the flow rules that run on the Mac |
| `DisplayAccess/Views/SampleAppsView.swift` | Phone UI and simulator test hooks |
| `DisplayAccess/ViewModels/` | Meta's session, registration and mock-device code |

## Screens (JUN-36)

Built for the 600×600 additive display, following Meta's guidance:

- **Nothing scrolls.** The step, the instruction and what Owl knows fit together above the buttons, in English and Finnish, at the longest copy the contract allows. A long title or instruction takes its room from the photo.
- **The evidence leads.** The expert's photo with the order lines or what Owl looks for; in a correction, what the order says large beside what Owl saw, and a headline that is the action ("Use Oat drink 1 l"), taken from the result.
- **One primary action, and it keeps its meaning.** The step card's primary is always Done. "Continue unverified" is a row that shows its words and its consequence before it is chosen. Every screen has a button, because without one a tap on the touchpad pauses the session.
- **The owl follows the real state.** Small in the corner during work, large only on welcome. Happy only after a passed final check; green and "Verified" likewise.
- **Colour never carries a meaning alone:** verified is a filled green disc with a tick and the word, not verified a dashed ring and the word.

Look at any screen in the simulator with `OWL_PREVIEW_SCREEN=<name>` (names in `OwlScreenGallery.names`; add `-fi` for Finnish and `-long` for the longest copy).

The owl and the simulator's first-person photo (`Assets.xcassets/owl*.imageset`) were made at the event with an image model. The simulator demo photo (`Assets.xcassets/demoMeal.imageset`) is [Lohikeitto.jpg](https://commons.wikimedia.org/wiki/File:Lohikeitto.jpg) from Wikimedia Commons; see the file page for its licence and author.
