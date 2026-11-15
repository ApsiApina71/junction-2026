---
status: active
tags: [site, assets, models]
last-updated: 2026-11-15
---

`owl-glasses.glb` is Antti's Blender model from [JUN-88](https://linear.app/junction-2026-bossit/issue/JUN-88). The launch page loads this versioned asset through `src/three/useGlasses.ts`, which fits it at runtime without changing the file.

The earlier hardware preview can also load an optional `neural-band.glb`; the current landing-page walk does not require it. See the [app README](../../README.md).
