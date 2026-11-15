---
status: active
tags: [app, web, owl, site, alternative]
last-updated: 2026-11-15
---

# owl-lens-site

The OwlBoarding launch page ([JUN-86](https://linear.app/junction-2026-bossit/issue/JUN-86)). `infra/build-site.sh` puts it at the root of owlboarding.com, with the public Owl Studio demo under `/studio/` (ADR-005). The earlier launch site, [`owl-site`](../owl-site/README.md), stays in the repo.

The page opens with the final glasses model from [JUN-88](https://linear.app/junction-2026-bossit/issue/JUN-88), the version with the Ray-Ban and Meta logos ([JUN-113](https://linear.app/junction-2026-bossit/issue/JUN-113)). Scrolling, or **See through Owl**, flies the camera round behind the glasses and into the right lens, where the Display sits. During the flight the video shows only through that lens. Inside, three real Display recordings from Junction 2026 play on a loop ([JUN-89](https://linear.app/junction-2026-bossit/issue/JUN-89)).

## Run

It is one static HTML file with no build step. Three.js r160 loads from jsDelivr.

```sh
cd apps/owl-lens-site
python3 -m http.server 4377
```

Open `http://localhost:4377/`. Opening the file directly does not work, because the browser blocks loading the model from `file://`.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Page, styles, scroll-driven camera path, lens portal and the clip playlist |
| `models/owl-glasses.glb` | The glasses model with logos, the same file as `owl-site/public/models/` |
| `media/*-wide.mp4` | 16:9 clips (1280 × 720), used on wide screens |
| `media/*-tall.mp4` | Original 3:4 Display recordings (720 × 956), used on tall screens |
| `media/*.jpg` | Poster frames |
| `img/logo-light.svg` | The owl mark from `shared/brand` |

The clips have no audio and are H.264, CRF 27, about 17 MB in total.

## Behaviour

- Drag turns the glasses before the flight. A click on a lens also flies in.
- The clip list, captions and order are in `CLIPS` at the top of the script.
- Without WebGL, the page shows the recordings directly.
- Reduced motion turns off the auto-spin and the camera lag.
