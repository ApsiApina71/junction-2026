---
status: active
tags: [spec, meta, glasses, onboarding]
last-updated: 2026-11-14
---

# Spec: Owl Boarding

Onboarding for all physical work, on Meta Ray-Ban Display glasses. The product is **Owl Boarding**, at [owlboarding.com](https://owlboarding.com); the owl is the mascot, a wise teacher.

- **Ticket(s):** [JUN-43](https://linear.app/junction-2026-bossit/issue/JUN-43) (this spec). Data model and API: [owl-contract.md](owl-contract.md) ([JUN-27](https://linear.app/junction-2026-bossit/issue/JUN-27)). Build tickets JUN-27…JUN-42 and JUN-56 in the Software and Prototyping projects.
- **Design:** Owl brand and screens, [JUN-35](https://linear.app/junction-2026-bossit/issue/JUN-35)
- **Challenge:** Meta, "AI Glasses for Everyone, Everyday" (`docs/context/challenge.md`)

## Problem

White-collar onboarding has a hundred SaaS tools. For physical work there are connected-worker platforms such as Augmentir and Tulip, mostly in manufacturing. A warehouse team, a restaurant, a bakery or a construction site still learns the job next to an experienced worker. The knowledge is tacit ("this lever", "this dough consistency"), onboarding is slow and expensive, and so companies prefer to hire people who already know the job.

**Why now:** smart glasses bring together what the person sees, a phone and AI.

**Why glasses, not a phone:** the hands stay on the work, and learning and checking happen from the worker's own view.

**Why not Meta AI:** it does not know the company's tacit knowledge; the company keeps that knowledge on its own Owl server and decides which AI model reads it (today Anthropic's API; see [Where the data goes](#where-the-data-goes)); and Owl teaches and checks a task, it does not only answer questions.

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

"Hire anyone" is the aim, not a promise: Owl is designed for the people an employer would otherwise pass over. Immigrants (a task is translated into the worker's language the first time it is needed, and Owl speaks it), supported employment for people with intellectual disabilities and people with dyslexia (pictures, video and speech before text, and an easy-language profile with short plain sentences), people with low vision (an audio-first profile: everything on the display is also spoken), Deaf and hard-of-hearing people and loud workplaces (a display-first profile: every spoken line is also shown), and everyone on their first day. None of this has been tried with these groups yet; that is what a pilot is for.

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

- **A learning aid, not monitoring.** The EU AI Act treats AI used to monitor workers as high-risk. Owl does not score people. The worker sees their own progress on the glasses and can erase it ("Forget me"); Owl Studio shows only totals for everyone together.
- **The end of training: Owl gives evidence, a person decides (JUN-96).** The company sets a training length and a target level made of its own steps ("Packing: verified 3 times without help"), and the worker sees the level from day one. At the end Owl suggests "Ready" or "More practice: steps X and Y". Only verified steps count, and a fixed mistake is learning, not a minus point. The worker sees the suggestion on the glasses first; only then does Studio show it, and a trainer confirms it. This end result and its counts are the only thing Studio shows about one worker: no camera images, no location and no timing go into it.
- **Location only during training (JUN-97).** In a big warehouse a step opens when the worker reaches its place. No markers: Owl recognises the place in the camera picture, on its own server, from the expert's photo of the step. Owl keeps the worker's current area and today's areas only during the training period and only after the worker agreed; the glasses show when it is on, and the trainer sees the current area on Studio's map. The pictures are never stored, and the history is never written to disk and goes when training ends.
- **Help from the shift manager's own glasses (JUN-100).** A stuck worker can call the manager on shift, who answers on their own glasses, sees the worker's live view and talks them through it. Only the manager on shift at that company gets the call. The worker's glasses show who is watching for the whole call. The live view is not recorded: its frames are deleted when the call ends. If nobody answers in 30 seconds, the request goes to the Studio Help console.
- **Listening only to help, never kept (JUN-98).** In customer service mode the glasses listen at the counter only during training and only while the worker has turned the mode on; the display shows that Owl is listening and a sign at the desk tells customers. The transcript is used for one suggestion and dropped: no audio and no text is stored or logged. Suggestions come only from the company's documents; when they do not have the answer, Owl says "Not in the handbook, ask a colleague".
- **The worker chooses.** On the first start Owl says what the camera does, on the display and aloud in the worker's language, and the worker allows or refuses checks with a pinch. Without a yes, Owl guides without looking, and owl-api refuses the pictures. The camera can be paused on any step. An expert agrees before anything is recorded.
- **Honest about what a check is.** A step counts as verified only when a check passed for it. When Owl could not check, the summary says so.

### Where the data goes

What the code does today. Owl Studio shows the same list to the company ("Where your data goes"); change both together.

| Data | Owl's own server (owl-api) | Sent to the AI model |
|---|---|---|
| Picture for a check | Never saved | One picture, with the step and the expert's photo of it |
| Short clip for knowing which step it is | Never saved. Compared with the expert's clips on the server itself. A look the worker confirmed is kept as numbers (no video, not linked to the worker) | Never |
| The company's documents | Kept until deleted in Owl Studio | With a question: all of them while they fit, otherwise the parts that match best. One document when a task is written from it |
| A worker's question | Not saved | The question, the task and the step |
| A recording | Photos and clips kept with the task, faces blurred first, clips cut to 10 s without sound | What the expert said and the blurred photos, to write the steps |
| A task's words | Kept | The first time a worker needs the task in another language |
| A worker's view during Help | Kept only while the request is open, then deleted. Seen by the Studio expert, or by the manager on shift on their own glasses (JUN-100); not recorded by either | Never |
| Learning progress | Per run: start, finish, task, steps done, problems caught and fixed. Linked to the worker, saved in a file, erased by "Forget me" | Never |
| The end-of-training result (JUN-96) | Per step of the level, how many times it was verified without help; Owl's suggestion; who confirmed it. Shown in Studio only after the worker has seen it. Dropped by "Forget me" | Never |
| Where a trainee is (JUN-97) | Only during training and with consent: the current area and today's areas, in memory only, never saved; deleted when training ends or consent is taken back. The camera pictures used to recognise the place are never saved | Never: recognised on the server itself |
| A customer service hint (JUN-98) | Not saved, not logged | The last ~30 s of the conversation as text, and the company's documents |
| What a worker agreed to | Saved, with the time | Never |
| The stage view (off by default) | The current screen, Owl's last sentence and the newest camera picture, held in memory and replaced, never saved | Never |

- **The model provider's terms apply to what is sent.** Today owl-api calls Anthropic's API with the model named in `MODEL_ID`. With `VISION_BACKEND=nemotron`, check pictures go instead to NVIDIA's open-weight Nemotron 3.5 Super VL on a Verda GPU server (Verda is a Finnish GPU cloud), and the rest still goes to `MODEL_ID`. What a provider does with the data afterwards follows its terms and is not Owl's to promise. Because the weights are open, a company could also run the check model on its own GPU; that is not built.
- **If Jev is switched on,** a written description of what the camera saw and the order goes to TypeSafe's decision model through OpenRouter. No picture.
- **On the worker's phone:** the worker's tasks and the photo of each step, so a task works without a connection. No picture or clip from the glasses camera stays on the phone.
- **Meta:** Owl does not send task data, pictures or documents to a Meta model, and the DAT toolkit's analytics and crash reporting are opted out. "Hey Meta, start Owl" and the worker's speech are turned into text by Meta's software, and the glasses connect through Meta's app: those follow Meta's terms.

**Limits of this prototype**

- owl-api has one access token for everything. Hiding one worker's progress from Owl Studio is how the screens are made, not a lock.
- Photos and clips are loaded by address without a login, because the glasses' display fetches them. Recorded media and Help pictures sit in folders with random names; whoever is given an address can open it.
- Face blurring uses a detector and can miss a face. A recorded task is looked through by a person before it is published.
- Pictures for a check and for Help are not blurred.
- A recorded task cannot be deleted from Owl Studio yet.

## Pilot and business

- **Pilot:** one bakery or warehouse, 3 new hires. Metrics: time until working alone, errors Owl caught.
- **Business model:** SaaS per site or per worker, paid by the employer.

## Open questions

Write assumptions on the ticket as `Assumption: ...`.
