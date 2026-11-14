---
status: active
tags: [adr, ios, glasses, meta]
last-updated: 2026-11-14
---

# ADR-003: Glasses app on Meta DAT iOS, with copilot-api

- **Decision status:** accepted
- **Ticket:** [JUN-18](https://linear.app/junction-2026-bossit/issue/JUN-18/decide-glasses-app-on-meta-dat-ios-copilot-api-adr-002)
- **Date:** 2026-11-13

> **Update 2026-11-14:** the decision stands, the names changed. The glasses app is now [`apps/owl-glasses`](../../apps/owl-glasses/README.md) and the backend [`apps/owl-api`](../../apps/owl-api/README.md). `glasses-ios` and `copilot-api` were early prototypes and were removed in [JUN-52](https://linear.app/junction-2026-bossit/issue/JUN-52); they are in git history.

## Context

We picked the Meta challenge and build a grocery copilot for Meta Ray-Ban and Meta Ray-Ban Display glasses. The core feature needs the glasses camera.

Meta offers two ways to build:

- **Web Apps** run in the browser on Display glasses. They cannot use the camera or record audio.
- **Device Access Toolkit (DAT)** is an iOS/Android SDK inside a phone app. It can stream the camera, capture photos, use the microphones and speakers, and draw on the Display glasses.

`/new-app` covers only web and api apps.

## Decision

| Part | Choice |
|---|---|
| Glasses app | `apps/glasses-ios`: Swift iPhone app built on Meta's open-source DAT `CameraAccess` sample (DAT 1.0.1, Xcode 26.4+). |
| AI backend | `apps/copilot-api`: FastAPI + Anthropic SDK (`claude-opus-5-5`, low effort, structured output). The phone sends a photo; the API key never leaves the server. |
| Display UI | `MWDATDisplay` components, tested with MockDeviceKit and the Chrome "Meta Ray-Ban Display Simulator". |
| Android | Not now. The DAT Android SDK exists if a teammate needs it. |

## Consequences

- iOS builds need a Mac with Xcode and an Apple ID. Free personal teams cannot sign the Hotspot and Wi-Fi Info entitlements, so they are removed; camera streaming uses Bluetooth.
- Unsigned simulator builds crash in `Wearables.configure()`; use ad-hoc signing (`CODE_SIGN_IDENTITY=-`).
- The phone must reach `copilot-api`. Locally that is the Mac over the iPhone hotspot; for the demo it needs hosting (a later ADR).
- CI checks `copilot-api` only. `glasses-ios` has no CI job yet (it needs a macOS runner with Xcode 26.4+).
- Neural Band and glasses button input (DAT Inputs) must be enabled for the app in Wearables Developer Center.
