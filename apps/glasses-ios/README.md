---
status: draft
tags: [app, ios, glasses, prototype]
last-updated: 2026-11-13
---

# glasses-ios

Prototype iPhone app for the grocery copilot. Based on Meta's open-source DAT `CameraAccess` sample (see `LICENSE-meta-sample`); our additions are `ViewModels/CopilotService.swift`, the Copilot section of `CameraViewModel.swift` and the Copilot panel in `Views/CameraView.swift`.

Flow: Start session → Preview → **Check product**. The glasses take a photo, `copilot-api` on the Mac answers, the app shows a card and speaks the answer through the glasses' speakers.

Works with Ray-Ban Meta (camera + audio) and Meta Ray-Ban Display. The display UI is not built yet.

Prototype shortcuts: ATS allows plain HTTP (`NSAllowsArbitraryLoads`) to reach the Mac on the local network.
