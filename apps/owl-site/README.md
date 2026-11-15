---
status: active
tags: [app, web, owl, site]
last-updated: 2026-11-15
---

# owl-site

The [OwlBoarding launch site](https://owlboarding.com/): a scroll-driven walk through a Junction crew member's first task, seen through Meta Ray-Ban Display glasses. [Launch page: JUN-86](https://linear.app/junction-2026-bossit/issue/JUN-86). [Hosting: JUN-87](https://linear.app/junction-2026-bossit/issue/JUN-87).

The opening shows Antti's glasses model, explains the Junction example and brings the workers' handbook into the lens. The glasses go on, then ten stops follow the worker through finding Fridge 2, restocking it, asking for help and giving a hacker directions. The final view reveals the owl-pillow presenter on stage. The ending links to the [public Owl Studio dashboard](https://owlboarding.com/studio/) and this repository.

## Run and verify

Requires Node 22.12 or newer; CI uses Node 24. From `apps/owl-site/`:

```sh
npm ci
npm run dev
```

The verification commands, also listed in [CLAUDE.md](CLAUDE.md), are:

```sh
npm ci
npm run lint
npm test
npm run build
```

`npm run preview` serves the production landing-page build. Its Studio link needs the combined build below. The site is hosted at the domain root; the public dashboard uses `/studio/`.

## Build the complete website

From the repository root:

```sh
infra/build-site.sh
python3 -m http.server 4323 --directory site-dist
```

Open `http://localhost:4323/` and `http://localhost:4323/studio/`. The script builds Studio's sample-data preview and assembles it with the launch page, now [`apps/owl-lens-site`](../owl-lens-site/README.md), in `site-dist/`; this app is no longer part of the build. It requires a fresh output directory; pass a different path for another release. Use `SKIP_INSTALL=1` only after `npm ci` has run in both apps.

Studio's preview keeps fictional data in memory for each tab and does not connect to owl-api. Its source, images and clips are versioned in [`apps/owl-studio`](../owl-studio/README.md#public-demo). The connected Studio app has its own build and hosting.

Publishing uses the existing Netlify site in Johannes's account. Follow [`infra/README.md`](../../infra/README.md) and [ADR-005](../../docs/architecture/adr-005-site-cd-from-main.md): the Site workflow checks and builds both apps, and publishes only when its repository switch and secrets are configured. A manual release uploads the **combined** `site-dist/`, never this app's standalone `dist/`:

```sh
netlify deploy --prod --no-build --dir site-dist --site 2efd0ad7-3d5d-4556-9115-0107b9103073
```

Build output, dependencies, local design-tool state and Netlify account state are ignored by Git. No credentials are needed to build or preview either public page.

## Source and assets

| Path | Purpose |
|---|---|
| `src/App.tsx`, `src/index.css` | Intro, scrolling, captions, ending, responsive layout and the no-WebGL fallback |
| `src/intro.ts`, `src/walk.ts` | Handbook content, intro timing, ten stops and their camera positions |
| `src/LensCard.tsx`, `src/lens.ts` | In-lens cards and copy based on the glasses app's screens |
| `src/three/PutOn.tsx`, `src/three/useGlasses.ts` | Glasses opening, fit and transition into the lens |
| `src/three/World.tsx`, `src/three/parts.tsx`, `src/three/drinks.tsx` | Junction hall, people, furniture, fridges and drink trays |
| `src/three/Presenter.tsx` | The costumed presenter, visible only at the final stop |
| `src/three/tray.ts`, `src/three/show.ts` | Reversible tray animation and scene timing |
| `src/three/Grade.tsx`, `src/three/air.tsx`, `src/three/beam.ts` | Lighting, atmosphere and postprocessing |
| `public/models/owl-glasses.glb` | Antti's Blender glasses model from [JUN-88](https://linear.app/junction-2026-bossit/issue/JUN-88); runtime fit leaves the source asset intact |
| `public/owl/lens/` | Owl expressions used by the lens cards |
| `public/owl/logo*.svg`, `public/favicon.svg` | Static brand mark, generated from [`shared/brand`](../../shared/brand/README.md) |
| `public/fonts/` | Self-hosted Outfit variable font and its OFL license |
| `public/og-image.png` | Link-sharing image |
| `public/demo/`, `src/TaskPreview.tsx`, `src/Pov.tsx` | Earlier standalone task and POV previews retained with their supporting assets |
| `src/mascot/`, `scripts/build-owl.mjs` | Editable vector mascot and optional Lottie companion; regenerate with `npm run mascot:build` |

The current entry uses `src/index.css`. The retained `base.css` and `tokens.css` belong to the earlier preview design. The live treatment uses dark surfaces, Outfit, cyan guidance and softly translucent lens cards. Keep the static owl silhouette for branding and the expressive owls for task states.

## Rendering checks

Check the opening, example, handbook, all ten stops, backward scrolling and the final presenter on desktop and phone. The stage stays empty during the walk. Reverse scrolling reverses the trays; reduced motion uses the current stop without a timed transition. The intro headline returns when scrolling back to the top.

With WebGL unavailable, the page shows a readable explanation, task preview and dashboard link. Reduced-motion preferences are respected. For rendering comparisons, `?fx=off` disables the optional effects and `?fx=all` enables them all; normal touch-screen rendering skips postprocessing. The unit tests cover the intro, walk, lens copy, effects policy and reversible animation timing.
