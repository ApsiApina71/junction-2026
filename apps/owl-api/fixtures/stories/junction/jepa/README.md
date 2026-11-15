# Junction story: V-JEPA 2.1 training and test videos

These are the videos that Owl's step recognition ran on at Junction 2026, for the task "Recycling round", step 1 "Sort the cans". With `OWL_STORY=junction`, owl-api copies `steps/` and `other/` into `DATA_DIR/jepa-steps` and `DATA_DIR/jepa-other` on start (`app/story.py`), and `app/jepa.py` trains the task's attentive probe on them.

## The videos

| File | Class | Length | Used for |
|---|---|---|---|
| `../../../media/proc-recycling/step-1.mp4` | step-1 | 9.2 s, 196×354 | The expert's clip: the glasses play it, and the probe trains on it |
| `steps/proc-recycling/step-1/take-sorting-1.mp4` | step-1 | 10.0 s, 464×832 | Extra take of the step: cans into the round CANS opening |
| `steps/proc-recycling/step-1/take-sorting-2.mp4` | step-1 | 13.0 s, 464×832 | Extra take: later cans, same bin |
| `steps/proc-recycling/step-1/take-other-angle.mp4` | step-1 | 7.2 s, 480×848 | Extra take from another angle |
| `other/packing.mp4` | other | 19.0 s, 464×832 | Not doing the step: packing chocolate bars into a box |
| `eval/other-packing-test.mp4` | other | 11.8 s, 464×832 | Held out for the evaluation only; the server never trains on it |

All are first-person phone videos at 30 fps (the expert's clip at 15 fps), filmed by a team member during Junction 2026 (14 November 2026) at the venue's white sorting bin and at a snack table. They show hands, cans, the bin, feet and boxes, no faces and no sound. The expert's clip went through owl-api's own upload path (`POST /processes/{id}/steps/{step_id}/clip`: faces blurred, sound removed, 10 s, rounded card for the display).

## Measurement

```sh
cd apps/owl-api
uv run --extra jepa python scripts/jepa_probe_eval.py
```

Leave one video out: each take and each "other" video is held out in turn, the probe trains on everything else exactly as the server does, and every 2 s window (1 s stride) of the held-out video is classified like one look from the glasses. The step counts when its probability is at least `JEPA_MIN_PROB` (0.6). Result on a MacBook (Apple silicon, MPS), V-JEPA 2.1 ViT-B frozen:

| Held out | Truth | Windows | Right | p(step) min / mean / max |
|---|---|---|---|---|
| take-other-angle | step-1 | 6 | 6 | 0.96 / 0.97 / 0.98 |
| take-sorting-1 | step-1 | 9 | 9 | 0.89 / 0.92 / 0.95 |
| take-sorting-2 | step-1 | 12 | 12 | 0.84 / 0.88 / 0.92 |
| packing | other | 18 | 18 | 0.06 / 0.11 / 0.20 |
| other-packing-test | other | 10 | 10 | 0.04 / 0.10 / 0.29 |

**55 of 55 held-out windows right.** On the real glasses, during the filmed runs, every V-JEPA answer at the bin was "Sort the cans" (the stage view showed 92 %).

## What this does and does not show

- The held-out videos are separate recordings, but close ones: the expert's clip and `take-other-angle` were filmed minutes apart with the same blue can (in `take-other-angle` the can goes toward PLASTIC first, then into CANS), and the two sorting takes come from one longer video.
- Two classes, one bin, one person, one evening. It shows that a frozen V-JEPA 2.1 with a probe trained in about 35 s on a handful of clips tells this step apart from other hand work at the same event. It does not show how it generalises to other people, places or many similar steps.
- Owl never acts on V-JEPA alone. Owl Check (Nemotron 3.5 Super VL on one picture) and the deterministic rules decide right, wrong and done; V-JEPA says which step the worker is on.

## Licence

Filmed for this entry by the team; MIT like the rest of the repository.
