"""Does training on our own clips beat Meta's models as they come? V-JEPA, four ways, on the Junction story's videos.

    uv run --extra jepa python scripts/jepa_compare.py [--story junction]

The question each 2 s window asks is the one the server asks on the glasses: is the worker sorting the cans (step 1),
or doing something else? Every variant sees the same videos and is scored the same way, leaving one video out at a
time (the expert's clip always stays in, since the server cannot run without it):

  A  V-JEPA 2 (ViT-L, Meta's SSv2 action model), frozen, no training: nearest prototype. The step's prototype is the
     mean embedding of the clips of the step, the "other" prototype the mean of the other clips; a window goes to the
     closer one. Nothing is learned.
  B  V-JEPA 2.1 (ViT-B, March 2026), frozen, no training: the same nearest prototype.
  B1 The same as B, but the step's prototype is the expert's clip alone (what one recording gives without training).
  C  V-JEPA 2.1 + an attentive probe trained on the expert's clip and the other clips only (what a company gets from
     one recording).
  D  V-JEPA 2.1 + the attentive probe trained on the expert's clip, the step's extra takes and the other clips: what
     owl-api runs (app/jepa.py, Recognizer.probe_for).

For the probes the step counts when its probability is at least JEPA_MIN_PROB (0.6), as on the server. Reported per
variant: right windows, false alarms (other work taken for the step: Owl would say a step is being done when it is
not), misses, and d′: how far apart the step's and the other windows' scores are, in standard deviations
(scale-free, so the cosine of A and B and the probabilities of C and D compare). A small d′ means a few unlucky
windows, light or angle cross the line; a large one means a wide safety margin around the threshold.
"""

import argparse
import shutil
import sys
import tempfile
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import jepa
from app.models import Process
from app.store import FIXTURES


def windows_of(path: Path) -> list:
    frames, fps = jepa.decode_timed(path.read_bytes())
    return jepa.clip_windows(frames, fps)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--story", default="junction")
    args = parser.parse_args()

    import torch

    story = FIXTURES / "stories" / args.story
    process = Process.model_validate_json((story / "process-recycling.json").read_text(encoding="utf-8"))
    step = process.steps[0]
    expert = FIXTURES / "media" / step.clip_url.removeprefix("/media/")
    takes = sorted((story / "jepa" / "steps" / process.id / step.id).glob("*.mp4"))
    others = sorted((story / "jepa" / "other").glob("*.mp4")) + sorted((story / "jepa" / "eval").glob("*.mp4"))
    held_out = [(p, True) for p in takes] + [(p, False) for p in others]
    win = {p: windows_of(p) for p in [expert, *takes, *others]}

    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"{process.title}: {step.title}. Expert clip, {len(takes)} takes, {len(others)} other videos; device {device}.")
    print(f"Held-out windows: {sum(len(win[p]) for p, _ in held_out)} (2 s, 1 s apart). Leave one video out.\n")

    results = {}

    # A and B: frozen embeddings, nearest prototype, nothing learned.
    for name, make in (("A  V-JEPA 2 SSv2, no training", lambda: jepa.VJepa2Embedder()), ("B  V-JEPA 2.1, no training", lambda: jepa.VJepa21Embedder())):
        t0 = time.monotonic()
        emb = make()
        vec = {p: [emb.embed(w) for w in ws] for p, ws in win.items()}
        per_window = (time.monotonic() - t0) / sum(len(ws) for ws in win.values())
        for label, step_clips in ((name, [expert, *takes]), ("B1 V-JEPA 2.1, no training, expert clip only", [expert])):
            if label.startswith("B1") and not name.startswith("B"):
                continue
            rows = []
            for held, is_step in held_out:
                step_proto = jepa._unit(np.mean([v for p in step_clips if p != held for v in vec[p]], axis=0))
                other_proto = jepa._unit(np.mean([v for p in others if p != held for v in vec[p]], axis=0))
                for v in vec[held]:
                    score = float(np.dot(v, step_proto) - np.dot(v, other_proto))  # > 0: closer to the step
                    rows.append((is_step, score > 0, score))
            results[label] = (rows, per_window)
        del emb
        if device == "cuda":
            torch.cuda.empty_cache()

    # C and D: V-JEPA 2.1 tokens and the attentive probe, trained the server's way in each fold.
    emb = jepa.VJepa21Embedder()
    for name, use_takes in (("C  V-JEPA 2.1 + probe, expert clip only", False), ("D  V-JEPA 2.1 + probe, our clips (owl-api)", True)):
        rows, t_train = [], []
        for held, is_step in held_out:
            torch.manual_seed(0)
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / "jepa-steps" / process.id / step.id).mkdir(parents=True)
                (root / "jepa-other").mkdir(parents=True)
                for p in takes if use_takes else []:
                    if p != held:
                        shutil.copyfile(p, root / "jepa-steps" / process.id / step.id / p.name)
                for p in others:
                    if p != held:
                        shutil.copyfile(p, root / "jepa-other" / p.name)
                t0 = time.monotonic()
                model, classes = jepa.Recognizer(root / "jepa", emb).probe_for(process, {step.id: expert})
                t_train.append(time.monotonic() - t0)
            for w in win[held]:
                with torch.no_grad():
                    p_step = float(torch.softmax(model(emb.tokens(w)[None]), -1)[0, classes.index(step.id)])
                rows.append((is_step, p_step >= jepa.JEPA_MIN_PROB, p_step - 0.5))
        results[name] = (rows, sum(t_train) / len(t_train))

    print(f"{'variant':46s} {'right':>9s} {'false alarms':>13s} {'misses':>7s} {'d′':>6s}")
    for name, (rows, _) in results.items():
        right = sum(truth == said for truth, said, _ in rows)
        other_rows = [r for r in rows if not r[0]]
        step_rows = [r for r in rows if r[0]]
        false_alarms = sum(said for _, said, _ in other_rows)
        misses = sum(not said for _, said, _ in step_rows)
        # Separation: the step windows' lowest score minus the other windows' highest. Above 0: one threshold splits
        # them all.
        a, b = np.array([s for *_, s in step_rows]), np.array([s for *_, s in other_rows])
        d_prime = (a.mean() - b.mean()) / np.sqrt((a.var() + b.var()) / 2)
        print(
            f"{name:46s} {right:3d}/{len(rows):<3d} {right / len(rows):4.0%} {false_alarms:5d}/{len(other_rows):<3d}     {misses:3d}/{len(step_rows):<3d} {d_prime:6.1f}"
        )
    print("\nScores: A and B, cosine to the step's prototype minus cosine to the other prototype; C and D, p(step) − 0.5.")
    print("d′ = (mean step score − mean other score) / pooled standard deviation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
