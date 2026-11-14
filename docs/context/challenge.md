---
status: active
tags: [context, challenge]
last-updated: 2026-11-14
---

# Challenge

Junction 2026, Hype Areena, Espoo, 13–15.11.2026. Theme: **European Tech Renaissance**.

We submit to **Meta, "AI Glasses for Everyone, Everyday"**. On the first night we also tried the S-Bank challenge (a money coach) and a calorie tracker for camera glasses. We dropped both, and their code was removed from the repo in [JUN-52](https://linear.app/junction-2026-bossit/issue/JUN-52); it is still in git history.

## Brief: Meta, "AI Glasses for Everyone, Everyday"

- **The challenge:** demonstrate how a first-person field of view enables new or better interactions in everyday scenarios, beyond mirroring a phone screen. Turn a clear everyday need into an intuitive, inclusive experience for people with all abilities.
- **Judged on:** creativity, technical execution, real-world impact, and inclusive interaction design for people with all abilities. Display and audio-first experiences count equally, as do Web Apps and Device Access Toolkit (DAT) mobile integrations.
- **Must show:** a clear problem and audience, a functional prototype and a deck; a clear wearable benefit; a focused, plausible path to adoption or a pilot; a prototype that handles permissions, errors, performance trade-offs, connectivity and device state changes; appropriate consent and safe data practices.
- **Resources:** shared Meta Ray-Ban Display and Ray-Ban Meta Gen 2 glasses at the Meta booth; mentors for Web Apps and DAT (iOS, Android).
- **Our idea:** Owl Boarding, onboarding for all physical work on Meta Ray-Ban Display glasses. See [the spec](../specs/onboarding-owl.md).
- **Platform facts:** only DAT (phone app) can use the glasses camera; Web Apps get the display only. Docs: https://wearables.developer.meta.com/. Simulator: Chrome "Meta Ray-Ban Display Simulator".

## Judging criteria

The challenge partner picks the challenge winners with its own criteria. The top 5 overall come from peer review, then 7 judges vote after the pitches.

| Criterion | Source | What it asks | How we score on it |
|---|---|---|---|
| Innovation | Junction | Is it new or different from what others present? | Owl teaches and checks a task from the worker's own view. An expert's recorded working day becomes the training, and V-JEPA 2 recognises which step the worker is on. |
| Impact | Junction | Does it solve a real problem for most of the people who have it? | Physical work has no onboarding tools. "Hire anyone": immigrants, supported employment, people with dyslexia. Research: [JUN-99](https://linear.app/junction-2026-bossit/issue/JUN-99). |
| Implementation | Junction | Is it realistic, viable and feasible to build? | A working DAT iOS app, owl-api and Owl Studio. Demo mode runs without a model key. Rehearsal on real glasses: [JUN-53](https://linear.app/junction-2026-bossit/issue/JUN-53). |
| Creativity, technical execution, real-world impact, inclusive interaction design | Meta | See the brief above. | Audio-first, display-first and easy-language profiles. Consent and the data flow are built into the product, not only the deck. |

## Rules (prize eligibility)

- No code written before the event. All code outside open-source libraries is written at the event. See the note in `README.md`.
- Team size 1–4.
- Take part in at least one challenge. Several are allowed.
- The **whole team** takes part in live peer review on Sun 10:30–13:00. Otherwise we are not eligible for the main prize.
- The submission has a pitch video of at most 2:00 and a link to the source. Organizers must be able to read the source, and it is licensed MIT.

## Deadlines

| When | What |
|---|---|
| Fri 13.11 19:30 | Hacking starts |
| Fri 13.11 23:59 | **Pre-submission**: draft project on Junction Platform with the chosen challenge |
| Sat 14.11 12:00 | Submissions open |
| Sun 15.11 10:00 | **Final submission**, set to FINAL. No late submissions. |
| Sun 15.11 10:30–13:00 | Peer review, whole team present |
| Sun 15.11 14:15–15:10 | Top 5 pitches: 3 min pitch + 3 min questions |

## Links

- Challenge page: TODO(team)
- Junction Platform: https://hackjunction.app/
- Organizers: hello@hackjunction.com, Discord #announcements
