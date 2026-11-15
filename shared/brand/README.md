---
status: active
tags: [brand, owl, logo]
last-updated: 2026-11-15
---

# OwlBoarding logo

Shared mark for [Owl brand and screens (JUN-35)](https://linear.app/junction-2026-bossit/issue/JUN-35) and the [launch site (JUN-86)](https://linear.app/junction-2026-bossit/issue/JUN-86).

[`owl-mark.svg`](owl-mark.svg) is the editable master: one filled silhouette of a perched owl in side profile, facing right. It has no eyes, interior cutouts or outline strokes. The master is near-black (`#111111`) for light backgrounds; [`owl-mark-light.svg`](owl-mark-light.svg) is white (`#ffffff`) for dark backgrounds. The PNG exports are transparent, 1024 × 1024.

Run this from the repository root after editing the master:

```sh
node shared/brand/build-logo.mjs
```

It updates the white variant, both apps' `public/owl/logo*.svg` and their favicons. The favicons follow the browser color scheme; Studio tints the mark with its foreground text color. Runtime assets stay inside each app, so either app can build independently.

To refresh the PNG exports with librsvg installed:

```sh
rsvg-convert -w 1024 -h 1024 -o shared/brand/owl-mark.png shared/brand/owl-mark.svg
rsvg-convert -w 1024 -h 1024 -o shared/brand/owl-mark-light.png shared/brand/owl-mark-light.svg
```

Use the symbol beside **OwlBoarding**, with clear space of at least one sixth of its width. The logo is static; expressive mascot artwork belongs in task and help interfaces. Only the final approved mark and its exports are kept here.
