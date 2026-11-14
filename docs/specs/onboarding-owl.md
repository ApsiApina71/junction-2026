---
status: active
tags: [spec, meta, glasses, onboarding]
last-updated: 2026-11-14
---

# Spec: Onboarding Owl

Onboarding for all physical work, on Meta Ray-Ban Display glasses. Working title; the owl is the mascot, a wise teacher.

- **Ticket(s):** [JUN-43](https://linear.app/junction-2026-bossit/issue/JUN-43) (this spec). Data model and API: [owl-contract.md](owl-contract.md) ([JUN-27](https://linear.app/junction-2026-bossit/issue/JUN-27)). Build tickets JUN-27…JUN-42 and JUN-56 in the Software and Prototyping projects.
- **Design:** Owl brand and screens, [JUN-35](https://linear.app/junction-2026-bossit/issue/JUN-35)
- **Challenge:** Meta, "AI Glasses for Everyone, Everyday" (`docs/context/challenge.md`)

## Problem

White-collar onboarding has a hundred SaaS tools. Blue-collar work has none: warehouses, restaurants, bakeries, construction sites and customer service are learned next to an experienced worker. The knowledge is tacit ("this lever", "this dough consistency"), onboarding is slow and expensive, and so companies prefer to hire people who already know the job.

**Why now:** smart glasses bring together what the person sees, a phone and AI.

**Why glasses, not a phone:** the hands stay on the work, and learning and checking happen from the worker's own view.

**Why not Meta AI:** it does not know the company's tacit knowledge; companies will not hand that knowledge to Meta, so the data stays with the company; and Owl teaches and checks a task, it does not only answer questions.

## Three levels of company knowledge

Plug and play for a non-technical company:

1. **Written:** the company's own instructions (md, pdf), searched locally.
2. **Visual:** an expert films and narrates a working day from their own view.
3. **Both:** each step is an instruction, a reference image or clip, and a check.

## Features

| Feature | What happens |
|---|---|
| **Record** | An experienced worker does the task with the glasses on and narrates. The AI turns it into a guided process: steps, reference images, short video clips and check criteria. |
| **Learn & Check** | A new worker follows the process on their glasses. **Watch how** plays the expert's clip for the step on the display. **Owl Check** compares what the camera sees with the step and the order and warns about a wrong product or quantity. |
| **Ask** | The worker asks out loud and gets an answer from the company's own documents, with the source. |
| **Help** | When stuck, the worker shares the glasses view with a remote expert, who sees the current step and guides by voice. |

Plus a personal welcome for each new employee, in their own language.

## The phone stays in the pocket

The new worker never takes out the phone or opens the Meta AI app.

- **Once, by the employer:** pair the glasses, register Owl in Meta AI, grant permissions, install Owl and assign the worker.
- **At work:** "Hey Meta, start Owl" (DAT voice invocations) opens Owl. Steps and videos on the display, choices with the Neural Band, questions spoken into the glasses (DAT speech on the glasses mic), answers on the display and in the glasses speakers. The phone in the pocket only does the computing.
- **Platform notes (Meta known issues):** use camera stream frames for checks, not photo capture, together with the display; restart glasses speech recognition after about a minute; test that Owl keeps working with the phone locked.

## AI engine

- **Vision LLM (Claude):** describes what the camera sees as structured data: products, quantities, whether a step matches its reference.
- **Jev (TypeSafe):** decides whether the step or order is correct (`ok | wrong_item | missing | too_many | unsure`) with a probability; Owl warns only above a threshold. A deterministic compare of the order lines is the fallback.
- **V-JEPA 2 (Meta), spike:** recognise which step the worker is on from video. Kept only if the 3-hour spike works.

## Users and inclusion

"Hire anyone": immigrants (instructions in their own language), supported employment for people with intellectual disabilities, people with dyslexia (learning from images and video, not text), and everyone on their first day.

## Example story (not the demo)

A bakery: exact instructions and the bakery's own way of handling its ovens, levers and food safety. An expert films one working day; that becomes the training set; a new worker starts on day one with confidence, and Owl checks that things are done right.

The demo task is decided in [JUN-44](https://linear.app/junction-2026-bossit/issue/JUN-44) (suggestion: warehouse order picking and packing at our table).

## Goal and success check

- On real Meta Ray-Ban Display glasses, a first-time user completes a recorded task with step cards, a "Watch how" clip, at least one Owl Check warning and its fix, one Ask answer and one Help request.
- Owl Check never marks a wrong order as done in the demo set.
- The glasses app handles: camera permission denied, no network (cached process still works), server error, glasses taken off.

## Scope

- **In:** Display glasses app (DAT iOS), owl-api, Owl Studio web (documents, process review, Help console), one recorded demo process, one company handbook.
- **Out:** production identity and permissions, full video recording of a whole day, Android, multi-company admin.

## Safety and privacy

- A learning aid, not monitoring: the EU AI Act treats AI used to monitor workers as high-risk. Owl does not score people; results are not shared with managers without the worker's consent.
- Check photos are not stored. Faces in recorded material are blurred before storing.
- Company data stays with the company. DAT analytics are opted out.

## Pilot and business

- **Pilot:** one bakery or warehouse, 3 new hires. Metrics: time until working alone, errors Owl caught.
- **Business model:** SaaS per site or per worker, paid by the employer.

## Open questions

Write assumptions on the ticket as `Assumption: ...`.
