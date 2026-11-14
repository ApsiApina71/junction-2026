---
status: draft
tags: [app, ios, glasses, dat, prototype]
last-updated: 2026-11-14
---

# owl-glasses

The **Onboarding Owl** iPhone app for **Meta Ray-Ban Display** glasses ([JUN-29](https://linear.app/junction-2026-bossit/issue/JUN-29), spec [docs/specs/onboarding-owl.md](../../docs/specs/onboarding-owl.md)). Built on Meta's open-source DAT `DisplayAccess` sample (see `LICENSE-meta-sample`); it started as `bite-ios` ("Bite with Bo the bear", food tracking on `apps/glasses-api`), whose code is still in `DisplayAccess/Bite/` until the Owl flow replaces it.

What already works, in the simulator chain (iOS Simulator + MockDeviceKit + Chrome "Meta Ray-Ban Display Simulator"):

- A DAT display session with screens built from the Display DSL, buttons selectable with the Neural Band.
- `GlassesCamera`: a camera stream on the same session, the latest video frame, and `capturePhoto()`.
- Rich visuals drawn as images (`Bite/BearArt.swift`), since the display only has heading/body/meta text styles.
- Speech through the glasses (`AVSpeechSynthesizer`).
- An HTTP client for a local API, with the server address editable in the app.

Not yet tested on real Display glasses.

## Where things are

| Path | What |
|---|---|
| `DisplayAccess/Owl/` | Owl flow, voice, camera and owl-api client (folder-synced group) |
| `DisplayAccess/Owl/Display/` | Owl glasses screens and art (JUN-36) |
| `DisplayAccess/Bite/BiteDisplay.swift` | Glasses screens (Display DSL, no SwiftUI) |
| `DisplayAccess/Bite/BearArt.swift` | Mascot and cards drawn as images |
| `DisplayAccess/Bite/BiteViewModel.swift` | Flow, `GlassesCamera`, API client |
| `DisplayAccess/Views/SampleAppsView.swift` | Phone UI and simulator test hooks |
| `DisplayAccess/ViewModels/` | Meta's session, registration and mock-device code |

The simulator demo photo (`Assets.xcassets/demoMeal.imageset`) is [Lohikeitto.jpg](https://commons.wikimedia.org/wiki/File:Lohikeitto.jpg) from Wikimedia Commons; see the file page for its licence and author.
