---
status: tested
tags: [app, ios, glasses, dat, prototype]
last-updated: 2026-11-15
---

# owl-glasses

The **Owl Boarding** ([owlboarding.com](https://owlboarding.com)) iPhone app for **Meta Ray-Ban Display** glasses ([JUN-29](https://linear.app/junction-2026-bossit/issue/JUN-29), spec [docs/specs/onboarding-owl.md](../../docs/specs/onboarding-owl.md)). Built on Meta's open-source DAT `DisplayAccess` sample (see `LICENSE-meta-sample`); it started as `bite-ios` ("Bite with Bo the bear", food tracking on `apps/glasses-api`; that code is in git history before the Owl flow replaced it).

**Status:** run on real **Meta Ray-Ban Display** glasses with the **Neural Band** on 14–15 November 2026 (Junction 2026), with an iPhone 15 and owl-api over a Cloudflare tunnel. Seen working on the glasses: the display session and every pinch, the welcome and task list, recognising the place of a locked step from the camera, the expert's clip playing by itself, live checks with the step's own warning, step recognition (V-JEPA 2.1, 0.92 on the recycling step), "Looks right." and the ✓ without a Done pinch, the finished screen, customer service with Hint, the training result, and Help with the camera: Call Mika rang the shift manager, he answered on his phone, and his words were spoken on the glasses. (The filmed Help scene used a voice-only recording build that is not on main.) Everything below also runs in the simulator chain (iOS Simulator + MockDeviceKit + owl-api). To run it yourself, see [Run on your own glasses](#run-on-your-own-glasses).

What it does:

- **Phone stays in the pocket:** "Hey Meta, start Owl" (DAT voice invocations) opens Owl on the display; every invocation is answered once. It needs the app configured in Wearables Developer Center (see below); without that, **Open Owl on glasses** on the phone does the same.
- **The phone app (JUN-101)** in Owl Studio's look (Meta's UI toolkit tokens, dark first): who wears the glasses and their tasks, the server and the glasses as status rows, problem cards with the one fix each, and **Open Owl on glasses**. Permissions, Server, Record and Stage mirroring are under Setup; developer tools sit at the bottom; Settings has the Meta AI connection and the glasses. The phone's words follow the phone's language (English or Finnish).
- **Learn & Check:** task list → step cards with the expert's photo, the order lines or what Owl looks for, and where the worker is in the task. Owl Check sends camera **stream frames** (never photo capture) to `POST /check` while the worker works and on the Done pinch. Owl speaks a problem once, keeps watching while the correction is shown and notices the fix by itself.
- **A step is done only when verified (JUN-57):** Done runs a final check on a picture taken after the pinch, and only an answer that says `step_done` for this run, step and attempt counts (`Owl/OwlRunLog.swift`, tested by `Tests/run.sh`). When Owl cannot check (no camera, no network, server error, cannot see), the worker chooses between checking again and **Continue unverified**; when the worker switched the checks off, Done goes on. The last screen lists every step as verified, not verified or no check, and says "Well done" only when every check passed. An answer that arrives after the worker moved on (Ask, Help, a clip, Back, the next step) is dropped.
- **Ask:** glasses speech recognition (DAT Speech, restarted after its ~1 min stop) → `POST /ask` → answer and source on the display, spoken.
- **Help:** "Who can help?" with **Call Mika** (the worker's shift manager, JUN-100) or an expert in Owl Studio; stream frames go to `POST /help/frames` (about one a second while the manager watches), and the helper's messages are shown and spoken once. **Answer** sends one spoken sentence back.
- **The expert's clip plays by itself (JUN-102)** when a step opens in a task with `autoplay_clip`, once per run: Owl says "You are there" first, the clip plays with checks paused, then Owl says the step. A pinch skips it; Watch how replays it. The step card after it is clean: the title, the instruction and Owl's line, no photo and no list.
- **Owl marks a step done by itself (JUN-102)** when owl-api sees the step's `done_when` twice in a row: "Looks right." and the ✓, then the next step or the finished screen, with no Done pinch. Done still works.
- **Record:** pinch per step → H.264 clip of the stream, one reference frame and the narration → `POST /record/{id}/steps` → finish. No wait holds the expert (JUN-93): saving a step has Cancel, which takes the step back on owl-api as well (`DELETE /record/{id}/steps/{key}`), writing the steps has Back, and Back on the Record screen keeps the recording so Record opens it again. A step with nothing said is kept for a person to write in Owl Studio.
- **What the phone keeps (JUN-59):** the worker's tasks and their step pictures for working without a connection, the consent choice, and the server address. The whole data flow is in the spec under [Where the data goes](../../docs/specs/onboarding-owl.md#where-the-data-goes).
- **Nothing of the view stays on the phone (JUN-92):** a clip is deleted when its step is over, sent or not, and leftovers of a closed app are deleted at the next start.
- **Who wears the glasses:** the employer names the pair once in the app (Server → Glasses id, e.g. `glasses-1`); owl-api says which employee wears it (`GET /glasses/{id}/employee`), the worker sees only the published tasks assigned to them (`process_ids`), in their language when a translation exists.
- **Consent (JUN-80):** on the first start Owl explains on the display and aloud, in the worker's language, what the camera does (checks only during a step; each picture goes to the AI service that checks it and Owl does not save it; the camera can be paused), and the worker chooses with a pinch. Without consent Owl guides without checks. **Pause camera** on the step card stops checks with one pinch and really stops the camera. Record asks the expert to agree that clips are stored and to warn people nearby. **Forget me** on My progress erases the worker's learning data: it is a button without an icon, so it always shows its words, and it asks first, with Keep as the first choice (JUN-95). Every choice on the glasses is a real button: on the real glasses a pinch did not reach tappable rows. The choice is stored on owl-api and on the phone.
- **Inclusive profiles (JUN-81)** from `Employee.access`: **audio first** speaks everything on the display too (the instruction, what Owl checks, the ✓/✗ rows, the task list, the answer's source) and talks slower; **display first** shows every spoken line as a caption on the step card, and warnings stay until a pinch; **easy language** uses short plain sentences for the app's own lines (`OwlText`) and asks owl-api for the `-x-easy` process. On the designed screens (JUN-94): every sentence of `OwlStrings` that is not already short and plain has an easy version in English and Finnish ("Go on without a check", "At the end Owl says: this step was not checked."), and for an audio-first worker Owl also says what a pinch does and what the other choice is wherever there is a choice: the welcome, the task list, the buttons on the first step, a correction, "Owl can't check this step", the consent, a problem screen, and the summary step by step. A choice is named by its place ("the first choice is"), not by a gesture. Not tried with the people the profiles are for.
- **Stage view (JUN-79):** with **Stage mirroring** on under Setup (off by default), the app posts every screen change and spoken line to `POST /stage`, so the audience follows the glasses on owl-api's `/stage` page. It never sends camera pictures. Nothing is stored.
- **Step recognition (JUN-34):** on steps with an expert clip and no order check, with consent and the camera on, Owl sends a ~2 s clip (decoded from the stream and written as H.264, because the glasses send few key frames) to `POST /steps/recognize`. owl-api answers with V-JEPA 2.1 and an attentive probe per task. When it looks like the next step, the card says "Looks like step N. Pinch Done to go on." and Owl says it once; recognition never moves the worker on by itself.
- **Problems handled (JUN-42):** each has its own screen that says what happened and what still works, and the phone shows the same state with what the employer can do: glasses not assigned to anyone, camera or microphone not allowed (Owl never asks on the worker's glasses; the employer grants once with the phone's Permissions button), glasses taken off (pauses and stops sharing; comes back when put on), no network (saved tasks of this worker on these glasses only, with their step pictures; the task list says the tasks are saved ones and that Owl cannot check, a step says so from its first moment, steps go on unverified, and with nothing saved the screen says "No connection" and offers Try again), server errors, a clip that cannot play. Glasses that belong to no one use the phone's language.
- **Watch how (JUN-56):** the expert's clip plays on the display; afterwards the worker goes back to the step or watches again, and playback stops when they move on. The display's player reports nothing about a clip it cannot fetch, so before a clip's first play Owl asks for its first byte (once more with a longer wait if that fails), and it ends a player that has not started in 8 s. Either way the worker gets "The video can't play right now" and goes back to the step, which works without the clip.
- **Help (JUN-33, JUN-60):** the expert's or the manager's marked picture of the worker's own view is shown with their words. Sharing stops when Help ends or the glasses come off.
- **The worker's language:** the voice follows `Employee.language` (English when the phone has no voice for it), and the app's own sentences (spoken lines, the step status, errors) come from `Owl/OwlText.swift` (English and Finnish). Server texts already come in the worker's language.
- **Limitation:** the glasses recognise speech in the glasses' own language setting (DAT Speech reports it as `locale`; the app cannot choose it). Set the worker's glasses to their language in Meta AI. Ask still sends the worker's language, so answers come in it.
- DAT analytics and crash reporting opted out in `Info.plist`.


## Run on your own glasses

You need Meta Ray-Ban Display glasses (the Neural Band makes pinching easy), an iPhone with the Meta AI app where the glasses are paired, a Mac with Xcode 26.4 or later, and an owl-api the phone can reach (see [`apps/owl-api`](../owl-api/README.md); over the internet the glasses play clips only over https, so a Cloudflare tunnel is the simple way).

1. **Developer Mode.** On the iPhone: Settings → Privacy & Security → Developer Mode. In the Meta AI app: Settings → App Info, tap the version five times. In Developer Mode the app registers with the glasses without a Wearables Developer Center app id, and only one third-party app can be registered at a time.
2. **Build and sign** with your own Apple team (the bundle id is `fi.junction2026.bossit.owl`; change `PRODUCT_BUNDLE_IDENTIFIER` if your team cannot use it). Bake in the owl-api address and, if your owl-api has one, its token:

   ```sh
   cd apps/owl-glasses
   xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess -destination 'generic/platform=iOS' \
     -derivedDataPath /tmp/owl-dev -allowProvisioningUpdates DEVELOPMENT_TEAM=<your team id> \
     OWL_API_URL=https://<your-tunnel>.trycloudflare.com OWL_API_TOKEN=<token, or leave out> build
   xcrun devicectl device install app --device <iPhone UDID> /tmp/owl-dev/Build/Products/Debug-iphoneos/DisplayAccess.app
   ```

   `OWL_API_URL` and `OWL_API_TOKEN` are build settings that go into `Info.plist` (`OwlAPIURL`, `OwlAPIToken`). The address can also be changed on the phone: **Setup → Server** (address, glasses id, token). A build with a different `OWL_API_URL` forgets an address saved under the old build, so after a reinstall the new address is used.
3. **Connect the glasses.** Open Owl Boarding on the phone. The home screen shows **Connect the glasses** until the app is registered: tap **Connect in Meta AI** (also in Settings) and confirm in the Meta AI app, which returns to Owl Boarding through `owlglasses://`.
4. **Name the glasses.** The app asks owl-api who wears the glasses with `GET /glasses/{id}/employee`; the default id is `glasses-1`, which the Junction story assigns to its volunteer. Change it under **Setup → Server → Glasses id** to match a pair in Owl Studio (People).
5. **Camera and microphone.** Tap **Setup → Permissions** once and allow both in the Meta AI app. Owl never asks on the worker's glasses. The worker's own consent for camera checks is asked on the glasses at the first start.
6. **Open Owl.** Put the glasses on and tap **Open Owl on glasses**, or say "Hey Meta, start Owl" (needs step 7). Pinch to choose; on a card every choice is a button.
7. **"Hey Meta, start Owl" (optional).** Voice invocations reach the app only when it is configured in [Wearables Developer Center](https://wearables.developer.meta.com/devcenter/): add the iOS app with its bundle id, set the app name the voice service listens for ("Owl"), and create a new version, which carries the Voice Invocation permission. Outside Developer Mode the build also needs that project's `META_APP_ID` and `CLIENT_TOKEN` build settings and an https Universal Link as `AppLinkURLScheme`.
8. **Stage view (optional).** Turn on **Setup → Stage mirroring** and open owl-api's `/stage` page: it follows the glasses' screens and Owl's spoken lines.

## Known limits

- **Meta AI's own recording takes the camera.** "Record display" and other captures use the glasses camera, and DAT has no way to share it. While Meta AI records, Owl's camera does not start (`videoStreamingError` or a timeout in the log), so checks, place recognition and step recognition stop and the card says "Camera in use (recording?)". Stop the recording and open the step again.
- **The DAT app on the glasses may need an update.** If the display never opens and the log says `datAppOnTheGlassesUpdateRequired`, update it from the Meta AI app (App Connections; the phone's home and Settings show an **Update in Meta AI** card). The glasses need more than 10 % battery for that, and after a firmware update restart the glasses before the camera works.
- **Heat.** The glasses stop the camera when they get too warm (`thermalHot`; the phone shows "The glasses are too warm"). Higher resolutions and frame rates warm them faster, so the stream stays at low resolution and 7 fps; let them cool off the charger and out of the sun.
- **A dead tunnel looks like a dead camera.** When owl-api is unreachable, `/check` answers 502/530 and the card says Owl can't check, while the camera keeps streaming. Check the tunnel and owl-api first; the app recovers by itself.
- **Speech language** follows the glasses' own language setting (see above).

## Performance (JUN-82)

Owl looks only as often as the moment needs:

- **Stream:** low resolution (360×640) at 7 fps, HEVC; an expert's recording uses medium at 15 fps. On a busy Bluetooth link the glasses dropped to 360×640 by themselves anyway, and lower settings keep the glasses cooler.
- **One camera per display session:** on the real glasses the first stream of a session worked, while a camera added after a stop failed within seconds. So the camera opens once and rests between steps (no frames are sent); it is really stopped only when the worker pauses it, camera-check consent is off, the session ends or the stream stopped. A start that fails is retried up to three times within 30 s, each with a fresh camera.
- **Rate:** the next live frame waits for owl-api's `next_check_ms` (800 ms while a problem is being confirmed, 1.5 s after a warning or unsure, 3 s while the step looks right). `null` means no more frames until the next step or the Done pinch.
- **Steps without a check:** no frames are sent.
- **Logs:** every check logs `perf:` with the frame size, the round trip, the next delay and frames per minute; the stream start, every camera open and close, every pinch (with the source line of its button) and every stream error are logged too. Debug builds also write the log to `Library/Caches/owl-log.txt` on the phone, so a run started with "Hey Meta" can be read afterwards:

  ```sh
  xcrun devicectl device copy from --device <iPhone UDID> --domain-type appDataContainer \
    --domain-identifier fi.junction2026.bossit.owl --source Library/Caches/owl-log.txt --destination owl-log.txt
  ```

| Measured | Simulator (mock glasses, owl-api on the same Mac, demo mode) | Real glasses |
|---|---|---|
| Frames per minute, pick and pack | ~19 (every-second baseline: 60) | not measured |
| Frame size | 6–93 KB JPEG (longest side ≤ 1024 px) | 360×640 stream; JPEG or a short clip per check |
| Round trip | 4–17 ms (local) | not measured (owl-api over a Cloudflare tunnel) |
| Stream start | 8 ms (mock) | 0.7–1.5 s |
| Battery over 15 min | n/a | not measured |

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
| `DisplayAccess/Owl/Phone/OwlPhoneTheme.swift` | The phone app's look (Owl Studio's tokens), its building blocks and its English/Finnish words |
| `DisplayAccess/Owl/OwlLogFile.swift` | Debug builds: the log also goes to `Library/Caches/owl-log.txt` |
| `Tests/` | Tests of the flow rules that run on the Mac |
| `DisplayAccess/Views/SampleAppsView.swift` | The phone's home screen and simulator test hooks |
| `DisplayAccess/Views/SettingsView.swift` | Settings: the Meta AI connection and the glasses |
| `DisplayAccess/ViewModels/` | Meta's session, registration and mock-device code |

## Screens (JUN-36)

Built for the 600×600 additive display, following Meta's guidance:

- **Nothing scrolls.** The step, the instruction and what Owl knows fit together above the buttons, in English and Finnish, at the longest copy the contract allows. A long title or instruction takes its room from the photo.
- **The evidence leads.** The expert's photo with the order lines or what Owl looks for; in a correction, what the order says large beside what Owl saw, and a headline that is the action ("Use Oat drink 1 l"), taken from the result.
- **One primary action, and it keeps its meaning.** The step card's primary is always Done. On "Owl can't check this step" the card says what going on means, and **Continue** is a button without an icon, so its word always shows. Every screen has a button, because without one a tap on the touchpad pauses the session, and every choice is a button: a pinch did not reach tappable rows on the real glasses.
- **The owl follows the real state.** Small in the corner during work, large only on welcome. Happy only after a passed final check; green and "Verified" likewise.
- **Colour never carries a meaning alone:** verified is a filled green disc with a tick and the word, not verified a dashed ring and the word.

Look at any screen in the simulator with `OWL_PREVIEW_SCREEN=<name>` (names in `OwlScreenGallery.names`; add `-fi` for Finnish and `-long` for the longest copy).

The owl and the simulator's first-person photo (`Assets.xcassets/owl*.imageset`) were made at the event with an image model. The simulator demo photo (`Assets.xcassets/demoMeal.imageset`) is [Lohikeitto.jpg](https://commons.wikimedia.org/wiki/File:Lohikeitto.jpg) from Wikimedia Commons; see the file page for its licence and author.
