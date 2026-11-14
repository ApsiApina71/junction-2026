# Owl Boarding 🦉

**Onboarding for all physical work, on Meta Ray-Ban Display glasses.** [owlboarding.com](https://owlboarding.com) · Our entry to the Meta challenge "AI Glasses for Everyone, Everyday" at Junction 2026.

White-collar onboarding has a hundred SaaS tools. Physical work has none. In a warehouse, a restaurant, a bakery or on a building site, the knowledge is tacit and onboarding is slow, so companies prefer to hire people who already know the job. Owl lets an expert record a working day once. Every new worker then learns it from their own view, with their hands free, and Owl checks the work as they go.

Owl is a learning aid, not a monitoring tool. The full product spec is [docs/specs/onboarding-owl.md](docs/specs/onboarding-owl.md).

## What it does

| Feature | What happens |
|---|---|
| **Record** | An experienced worker does the task with the glasses on and narrates. Owl turns it into a guided process: steps, reference pictures, short clips and check criteria. |
| **Learn & Check** | A new worker follows the process on the display. **Owl Check** compares what the camera sees with the step and warns about a wrong product or quantity. A step counts as done only when Owl verified it. |
| **Watch how** | The expert's own clip for the step plays on the glasses display. |
| **Ask** | The worker asks out loud and gets an answer from the company's own documents, with the source. |
| **Help** | When stuck, the worker shares their live view. The shift manager answers on their own glasses, or an expert in Owl Studio. They guide by voice and can point at the picture. |
| **Training period** | The company sets the length (for example a week) and the target level. At the end Owl suggests "Ready" or "More practice", the worker sees it first, and a person confirms it. |
| **Location** | During training Owl recognises where the worker is from the camera picture, and the next part opens at the right spot. |
| **Customer service** | During training Owl listens at the counter, and a Hint pinch shows two or three points from the company's handbook. |

Every new worker gets a personal welcome in their own language. Easy-language, audio-first and display-first profiles make Owl usable for immigrants, people in supported employment, people with dyslexia and people with low vision or hearing. The phone stays in the pocket: "Hey Meta, start Owl" opens it, and the Neural Band does the rest.

## Apps

| App | What it is |
|---|---|
| [`apps/owl-glasses`](apps/owl-glasses/README.md) | The iPhone app for Meta Ray-Ban Display glasses, built on Meta's Wearables Device Access Toolkit (DAT): display, camera, Neural Band, speech, voice invocations |
| [`apps/owl-api`](apps/owl-api/README.md) | The engine: processes, Owl Check, Ask, Record, Help, training, location and customer service |
| [`apps/owl-studio`](apps/owl-studio/README.md) | The company's web app: documents, recorded tasks, workers, training, the map, the Help console and where the data goes |
| [`apps/owl-site`](apps/owl-site/README.md) | The one-page launch site with the glasses in 3D and a view through the lens |

**AI engine:** Claude (Anthropic API) reads the camera picture and the company's documents. Jev (TypeSafe) decides whether a step or an order is right and warns only above a threshold. Meta's V-JEPA 2 recognises which step the worker is on from short video clips.

## Run it

Without a model key, demo mode plays the whole pick-and-pack story: a wrong 0.5 l carton is caught, then the fixed box passes.

```sh
# 1. owl-api (Python 3.13+, uv)
cd apps/owl-api
cp .env.example .env            # a human adds ANTHROPIC_API_KEY for the real models
OWL_DEMO=1 uv run --env-file .env uvicorn app.main:app --host 0.0.0.0 --port 8000

# 2. Owl Studio (Node 22.12+), in another terminal
cd apps/owl-studio && npm ci && npm run dev

# 3. The glasses app: Xcode, the iOS Simulator and Meta's MockDeviceKit
#    see apps/owl-glasses/CLAUDE.md
```

On real glasses the iPhone reaches owl-api through a tunnel. The demo-day steps are in [docs/runbooks/owl-demo.md](docs/runbooks/owl-demo.md).

## Data and consent

The worker agrees on the glasses before the camera checks anything, and can pause the camera at any time. Check pictures are not stored. Faces in recorded clips are blurred. Help views are deleted when the call ends. The worker's progress belongs to the worker, and **Forget me** erases it. What goes where, including what goes to the model provider, is listed in the spec under [Where the data goes](docs/specs/onboarding-owl.md#where-the-data-goes) and in Owl Studio's Data view.

## What existed before the event

Junction rules allow no code written before the event. Before hacking started (Fri 13.11 19:30) this repo held only generic, idea-agnostic tooling: agent instructions, Claude Code skills, CI workflows, doc templates and the tech-stack ADR. There was no product code, spec or idea-specific content. Everything under `apps/`, `docs/specs/` and `design/JUN-<n>/` was written at the event. The one exception is open-source code: `apps/owl-glasses` started from Meta's open-source DAT `DisplayAccess` sample (licence in `apps/owl-glasses/LICENSE-meta-sample`).

On the first night we also tried a money coach for the S-Bank challenge and a calorie tracker for camera glasses. They are not part of this submission. Their code was removed and is only in git history.

## How we work

AI agents do most of the work from Linear tickets (team `JUN`).

- **Agents:** start with [AGENTS.md](AGENTS.md).
- **Humans:** start with [docs/runbooks/agent-onboarding.md](docs/runbooks/agent-onboarding.md) and [docs/runbooks/local-dev.md](docs/runbooks/local-dev.md).
- **Doc index:** [docs/MAP.md](docs/MAP.md).

**Stack:** Swift and Meta DAT for the glasses app, Python with FastAPI for the API, Vite, React and TypeScript for the web apps. See [ADR-001](docs/architecture/adr-001-tech-stack.md) and [ADR-003](docs/architecture/adr-003-glasses-app-dat-ios.md).

## Team

TODO(team): names and GitHub handles.

## License

[MIT](LICENSE). Junction licenses every project submission under MIT.
