---
status: active
tags: [adr, studio, web, meta, design]
last-updated: 2026-11-14
---

# ADR-004: Owl Studio on Meta's UI Toolkit for Meta Ray-Ban Display

- **Decision status:** accepted
- **Ticket:** [JUN-101](https://linear.app/junction-2026-bossit/issue/JUN-101/owl-studio-on-metas-ui-toolkit-the-admin-panel-speaks-the-glasses)
- **Date:** 2026-11-14

## Context

Owl Studio is the admin panel for the glasses: the company reviews recorded tasks, adds workers and glasses, runs training and answers Help calls there. It had its own design system (Figtree, teal accent, hand-drawn icons, light and dark themes).

John asked for Studio at Meta's level of UI and UX, built from Meta's own components. Meta publishes them as [UI Toolkit for Meta Ray-Ban Display](https://github.com/meta/meta-ray-ban-display-ui-toolkit-web): React components, tokens, materials, motion and focus navigation for web apps on the glasses (`@wearables-ui-toolkit/mrbd`, Apache 2.0; icons in `@wearables-ui-toolkit/icons` under the Meta Wearables Developer Terms). Four of Meta's six challenge mentors are Web Apps engineers.

The toolkit is drawn for a 600 x 600 additive display seen close to the eye, with a D-pad, not for a desktop with a mouse and a keyboard.

## Options

1. **Keep Studio's own design system.** Works, but it is our look, not Meta's, and Studio and the glasses read as two products.
2. **Restyle Studio to look like Meta's toolkit.** Fast, but it imitates the components, which the toolkit's own guidance forbids, and every state, focus and motion detail would be ours, not Meta's.
3. **Build Studio from the toolkit itself, adapted to a desktop.** Every surface is a toolkit component; the few desktop needs it does not cover are named and kept small.

## Decision

Option 3.

- Studio renders inside the toolkit's `App`. Colour, type, spacing, corners and materials come from its `--uit-` tokens. It is dark only, like the toolkit.
- **Desktop density.** The whole app is scaled with CSS `zoom` (0.58 to 0.72 by window width), so every component keeps its designed proportions at a desktop reading distance. Percent sizes are not scaled by zoom, so the root stays exactly the window's size.
- **Components.** Lists are `VerticalList` and `ListItem` (switch, radio and slider rows for settings), actions `Button`, `ButtonGroup`, `ButtonRail` and `QuickReplyButton`, tasks and help requests `Card`, informational regions `Panel`, status `Chip` and words in the toolkit's status colours, identity `Avatar` and `ContainerHeader`, the Help chat `StaticContainer` with the inbound and outbound message materials and tail shapes, confirmations `Modal`, feedback `Toast`, waits `IndeterminateLoader`, and every icon a filled toolkit icon, imported file by file (`src/ui/icons.ts`).
- **Single choices** use the toolkit's pattern: a row that says the current answer and opens a radio list (`ChoiceRow`, `ChoiceDialog` in `src/ui/meta.tsx`).
- **The glasses preview** in the task editor is drawn with the toolkit itself in a 600-pixel square: what a Meta Ray-Ban Display web app would show.

Where the toolkit does not fit a desktop, Studio does the smallest thing and says why in the code:

| Need | Why the toolkit does not cover it | What Studio does |
|---|---|---|
| Editing existing text | `InputTextView` is built for the glasses, where the host owns text entry: no caret, the cursor starts at the beginning, the arrow keys move focus. In Chrome, typing into a filled field went to the front. | Edit fields are native inputs drawn with the toolkit's input tokens and type (`EditInput`). `InputTextView` stays where text is written and sent: the Help message and a question to Owl, with the caret shown and left/right kept in the field. |
| A blocking dialog | The toolkit's `Modal` is a panel, not a presenter: no shade, no focus trap. Its panels are translucent. | A near-black, blurred shade portalled to the toolkit App's root, a focus trap, Escape to close; the `Modal` or a `Panel` inside. |
| Masked secret, date, file | No toolkit component. | Native fields drawn with the same tokens. |
| Drawing areas on a floor | No toolkit component. | An SVG on the toolkit's surfaces, accents and type. |
| Fonts | The toolkit ships no font files and loads Noto Sans from Google Fonts. | `@fontsource/noto-sans` is bundled, and `index.html` marks the font as present so the toolkit adds no Google Fonts link: Studio makes no request outside the company's server. |

## Consequences

- Studio, the glasses and the launch page now share one design language, and every interaction state, material and motion is Meta's.
- The build is larger (about 730 kB of JavaScript before gzip, mostly the toolkit).
- **Meta's own checker** (`validate-app-structure.mjs` from the toolkit's agent skills) reports 186 findings. It is written for 600 x 600 display apps. What remains is mostly what makes Studio a desktop app: several columns that each scroll (the Help console, the editor), widths in pixels for desktop layouts, a type size for the map's SVG labels, and large view files. Those were kept on purpose; findings that applied to Studio (body-size headings, token insets, counted words, root colour) were fixed. Studio is not a glasses app and must not be published as one.
- The light theme and its setting are gone.
- To check: the toolkit's focus navigation still owns arrow keys outside text fields, so keyboard users move between controls with Tab and the arrows. Not tried with a screen reader.
