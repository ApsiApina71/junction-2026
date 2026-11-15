"""V-JEPA 2.1 step recognition, measured on the Junction story's own videos (leave one video out).

    uv run --extra jepa python scripts/jepa_probe_eval.py [--story junction]

The server recognises the recycling step with V-JEPA 2.1 ViT-B (frozen) and a small attentive probe trained per task
on the expert's clip, the step's extra takes and "other" clips (not doing the step). This script measures that set-up
honestly: each take or "other" video is held out in turn, the probe is trained on everything else exactly as the server
does (app/jepa.py, Recognizer.probe_for), and every 2 s window of the held-out video is classified the way a look from
the glasses is: the step counts when its probability is at least JEPA_MIN_PROB (0.6), otherwise the answer is "not the
step". The expert's clip is always in training, since the server cannot run without it.

The weights download once from Meta (see app/jepa.py). Runs on Apple silicon (MPS), CUDA or CPU.
"""

import argparse
import shutil
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import jepa
from app.models import Process
from app.store import FIXTURES


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--story", default="junction")
    args = parser.parse_args()

    story = FIXTURES / "stories" / args.story
    process = Process.model_validate_json((story / "process-recycling.json").read_text(encoding="utf-8"))
    step = process.steps[0]
    expert = FIXTURES / "media" / step.clip_url.removeprefix("/media/")
    takes = sorted((story / "jepa" / "steps" / process.id / step.id).glob("*.mp4"))
    others = sorted((story / "jepa" / "other").glob("*.mp4")) + sorted((story / "jepa" / "eval").glob("*.mp4"))
    videos = [(p, step.id) for p in takes] + [(p, "other") for p in others]

    import torch

    embedder = jepa.VJepa21Embedder()
    torch.manual_seed(0)
    print(f"V-JEPA 2.1 ({embedder.name}) + attentive probe, {process.title}: {step.title}")
    print(f"Expert clip {expert.name}, {len(takes)} takes, {len(others)} other videos. Step counts at p >= {jepa.JEPA_MIN_PROB}.\n")
    print(f"{'held out':28s} {'truth':8s} {'windows':>7s} {'right':>6s}  p(step) min / mean / max")

    right_all = total_all = 0
    for held, truth in videos:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            steps_dir = root / "jepa-steps" / process.id / step.id
            other_dir = root / "jepa-other"
            steps_dir.mkdir(parents=True)
            other_dir.mkdir(parents=True)
            for p in takes:
                if p != held:
                    shutil.copyfile(p, steps_dir / p.name)
            for p in others:
                if p != held:
                    shutil.copyfile(p, other_dir / p.name)
            recognizer = jepa.Recognizer(root / "jepa", embedder)
            start = time.monotonic()
            model, classes = recognizer.probe_for(process, {step.id: expert})
            trained = time.monotonic() - start

            frames, fps = jepa.decode_timed(held.read_bytes())
            ps = []
            for window in jepa.clip_windows(frames, fps):
                with torch.no_grad():
                    probs = torch.softmax(model(embedder.tokens(window)[None]), -1)[0].float().cpu()
                ps.append(float(probs[classes.index(step.id)]))
        said_step = [p >= jepa.JEPA_MIN_PROB for p in ps]
        right = sum(s == (truth == step.id) for s in said_step)
        right_all += right
        total_all += len(ps)
        print(f"{held.name:28s} {truth:8s} {len(ps):7d} {right:6d}  {min(ps):.2f} / {sum(ps) / len(ps):.2f} / {max(ps):.2f}   (probe {trained:.0f} s)")

    print(f"\nAll held-out windows: {right_all} of {total_all} right ({right_all / total_all:.0%}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
