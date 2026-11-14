---
status: active
tags: [app, web, launch-page, onboarding-owl]
last-updated: 2026-11-14
---

# owl-site

The one-page launch site for Owl Boarding ([JUN-86](https://linear.app/junction-2026-bossit/issue/JUN-86)), Linear project [Launch Page](https://linear.app/junction-2026-bossit/project/launch-page-5e64dd64e4ff). Peer reviewers can't put on the glasses, so this page shows the product and how it feels to wear it.

- **Hero:** the Meta Ray-Ban Display glasses and the Neural Band in 3D (three.js via React Three Fiber). Visitors drag to turn them.
- **See through Owl:** the camera flies into the right lens and the page becomes the wearer's view, with the POV video on a loop.
- **Story:** the problem, Record → Learn & Check → Ask → Help, hands-free, hire anyone, trust, pilot.

Static site with no backend. It builds with relative paths (`base: './'`), so it works from any host or sub-path. Hosting: [JUN-87](https://linear.app/junction-2026-bossit/issue/JUN-87).

## Assets from Lauri

Drop these into `public/` with exactly these names. The page detects them at load time and replaces its built-in placeholders without code changes:

| File | Ticket | Placeholder until then |
|---|---|---|
| `public/models/owl-glasses.glb` | [JUN-88](https://linear.app/junction-2026-bossit/issue/JUN-88) | Glasses drawn in code (`src/three/placeholder.tsx`) |
| `public/models/neural-band.glb` | JUN-88 | Band drawn in code |
| `public/video/pov-loop.mp4` (+ `pov-loop.webm`, `pov-poster.jpg`) | [JUN-89](https://linear.app/junction-2026-bossit/issue/JUN-89) | A simulated display (`src/lib/hud.ts`), labelled as simulated |
| `public/og-image.png` (1200×630) | [JUN-90](https://linear.app/junction-2026-bossit/issue/JUN-90) | None |

Models are scaled to fit and centred automatically. The page flies into the node named `lens_right` and plays the POV video on the node named `display_area`. Draco and Meshopt compression are supported.

## Notes

- `prefers-reduced-motion` turns off auto-rotation, the flight and the scroll reveals.
- Without WebGL, the hero shows the logo and "See through Owl" opens the wearer's view directly.
- The footer says the project is independent and not affiliated with Meta. Keep it.
