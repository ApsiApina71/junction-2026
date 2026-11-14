---
status: active
tags: [app, web, owl, studio]
last-updated: 2026-11-14
---

# owl-studio

Owl Studio is the company's side of **Owl Boarding** ([spec](../../docs/specs/onboarding-owl.md)): the web app where a shift lead adds the company's own instructions, reviews the tasks an expert recorded on the glasses, adds new workers and answers them when they ask for help. Linear project: [Software](https://linear.app/junction-2026-bossit/project/software-e68385965606).

It talks to [`apps/owl-api`](../owl-api/README.md) through the [Owl contract](../../docs/specs/owl-contract.md). The shapes are in `src/lib/types.ts`, and every call Studio makes is in `src/lib/api.ts`.

## Views

| View | What it does | Ticket |
|---|---|---|
| Tasks | Every task, drafts first, one short line each: the badge carries the status, and a published task says who learns it or that no one is assigned. Recordings still on their way show above with "Owl is writing the steps". | [JUN-38](https://linear.app/junction-2026-bossit/issue/JUN-38) |
| Task editor | Review a recorded task step by step: the title, the instruction and what Owl says, beside everything the expert said, the photo and the clip. Mark each step reviewed, reorder or remove steps (drag or arrow buttons, Undo for a removal), set what Owl checks, publish, then choose who learns it. A live preview shows the step on the 600×600 display. The name, the summary and the language are folded away until asked for. | [JUN-39](https://linear.app/junction-2026-bossit/issue/JUN-39) |
| Documents | Add `.md`, `.txt` or `.pdf` instructions, delete them, and try a question to see Owl's answer and its source. | [JUN-38](https://linear.app/junction-2026-bossit/issue/JUN-38) |
| People | Add a new worker with a language, tasks and a pair of glasses. Shows the welcome as it is shown and spoken; it can be rewritten by hand or handed back to Owl. Marks shift managers and sets who is on shift: a worker's Help call rings that manager's own glasses first (JUN-100). | [JUN-41](https://linear.app/junction-2026-bossit/issue/JUN-41) |
| Training | Who is in training and which day it is, the target level per role (steps to verify without help, how many times), and at the end Owl's suggestion with its evidence, shown only after the worker has seen it, for a person to confirm. Customer service mode per role and the sign at the desk. | [JUN-96](https://linear.app/junction-2026-bossit/issue/JUN-96), [JUN-98](https://linear.app/junction-2026-bossit/issue/JUN-98) |
| Map | The workplace's areas, drawn on a map, with each trainee's current area live. Where each step happens (a checkpoint, saved on the task) and photos of the place from more angles. No markers: during training Owl recognises the place in the camera picture. A step can be opened by hand when Owl does not recognise it. | [JUN-97](https://linear.app/junction-2026-bossit/issue/JUN-97) |
| Help | Open requests, then the console: the worker's live view with an honest freshness line, the conversation and quick replies under it, the step they are on beside it, dictation, and a click on the picture to point at something. | [JUN-40](https://linear.app/junction-2026-bossit/issue/JUN-40), [JUN-33](https://linear.app/junction-2026-bossit/issue/JUN-33), [JUN-60](https://linear.app/junction-2026-bossit/issue/JUN-60) |
| Data | Where the company's data goes, in two parts that are kept apart: what Owl's own server stores and deletes, and what is sent to the model provider and to Meta, where their terms apply. Then what stays on the worker's phone, the limits, and the learning totals for everyone together. The same list is in the spec under "Where the data goes"; change both together. | [JUN-59](https://linear.app/junction-2026-bossit/issue/JUN-59) |

## Rules the code keeps

- **Review is something a person says.** A step Owl wrote from a recording arrives with `reviewed: false`. The reviewer reads its three texts against the whole narration and presses "Mark step reviewed". Editing a field never does that. Publish is blocked while any step is not reviewed, the list of what is left goes into the page, and the cursor goes to the first field. If the server still answers `422`, its sentence is shown.
- **Cut text is a hint that names the field.** A title or instruction that ends in `…` was cut by the server; it cannot be marked reviewed or published until it is rewritten. What Owl says is flagged when it is word for word the start of a longer narration. A draft can always be saved.
- **Published is not assigned.** After publishing, the editor asks who learns the task, and a worker gets it the next time they open Owl. Nothing says "on the glasses" until someone is assigned.
- **A visual check needs something to look for.** The contract says a visual step without criteria can never pass, so the editor does not save one.
- **One lamp.** Amber means a person is needed: a worker asking for help, a draft waiting for review, a step to review. Nothing else is amber. Every state is a word and a shape as well as a colour.
- **The owl's expression matches the data.** `public/owl/states/<state>.png` and `public/owl/full/<state>.png` (alert, done, listening, resting, thinking, unsure, watching, welcome). The mapping lives in `activity()` in `src/lib/studio.ts` and next to each use. No pleased owl on a draft.
- **Studio shows one worker's result only at the end of training (JUN-96).** During training the Training view says who is in training and which day it is. Owl's suggestion and its counts show only after the worker has seen them on the glasses, and a person confirms the result.
- **The Data view says only what the code does.** It is written from `apps/owl-api` (`main.py`, `media.py`, `record.py`, `ask.py`, `verifier.py`, `progress.py`) and the glasses app's `Info.plist`. It does not promise what the model provider or Meta do with what they receive, and it says that one worker's progress can be read from the server by anyone with the access token. Change it when the code changes.
- **Studio shows learning as totals only** (`GET /stats`). It never calls `GET /employees/{id}/progress`. That is a choice of these screens, not an access restriction.
- **Studio saves a task with a plain `PUT /processes/{id}`**, never with `?language=`, which would store a translation.

## Where things are

| Path | What |
|---|---|
| `src/App.tsx` | The shell: sidebar or tab bar, the live line under the owl, moving between views, the unsaved-changes guard |
| `src/StudioProvider.tsx`, `src/lib/studio.ts` | Tasks, people and help requests kept in step with the server |
| `src/lib/` | The client and the pure logic, each with tests: steps, time, marks, documents, languages, addresses |
| `src/views/` | One file per view, plus the glasses preview and Settings |
| `src/ui/` | Icons, the owl, status tags, the dialog and toasts |
| `src/index.css` | The design tokens (Junction Base names, light and dark) and every style |
| `src/test/` | Sample data and a stubbed server for the tests |

## Not built yet

- The time a help request began is not in the contract, so "Waiting 40 s" counts from when Studio first saw the request, or from the worker's first words.
- Studio cannot add a step, upload a photo, delete a recorded task, or see and edit a task's translations. Changing a task's words drops its stored translations on the server, and Studio does not warn about it.
- The server does not say whether it runs in demo mode (`OWL_DEMO=1`), so Studio cannot show it.
- There is no sign-in. The access token in Settings is the only gate, and it is one token for everything.
