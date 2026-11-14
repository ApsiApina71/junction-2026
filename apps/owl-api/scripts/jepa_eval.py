"""JEPA go/no-go (JUN-34): does the embedder tell the steps apart on real clips?

    uv run python scripts/jepa_eval.py --expert <dir> --trainee <dir> [--backend baseline|vjepa2]

The expert folder has one clip per step, named like the step (step-1.mp4, step-2.mp4, ...). The trainee folder has any
number of clips whose name starts with the step they show (step-2-take1.mp4). Prints the similarity matrix, top-1
accuracy and the margin, and says go or no-go. The same command runs on the Mac (CPU or MPS) or on a Verda GPU.
"""

import argparse
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import jepa

GO_ACCURACY = 0.8


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--expert", type=Path, required=True)
    parser.add_argument("--trainee", type=Path, required=True)
    parser.add_argument("--backend", choices=["baseline", "vjepa2"], default="baseline")
    args = parser.parse_args()

    embedder = jepa.VJepa2Embedder() if args.backend == "vjepa2" else jepa.BaselineEmbedder()
    expert = {p.stem: p for p in sorted(args.expert.glob("*.mp4")) + sorted(args.expert.glob("*.mov"))}
    trainee = sorted(args.trainee.glob("*.mp4")) + sorted(args.trainee.glob("*.mov"))
    if not expert or not trainee:
        print("Need clips in both folders.")
        return 2

    def embed(path: Path) -> tuple[np.ndarray, float]:
        start = time.perf_counter()
        vec = embedder.embed(jepa.decode_frames(path.read_bytes()))
        return vec, time.perf_counter() - start

    protos, seconds = {}, []
    for step, path in expert.items():
        protos[step], t = embed(path)
        seconds.append(t)
    steps = list(protos)
    correct, margins = 0, []
    print(f"backend: {embedder.name}\n")
    print("trainee clip".ljust(28) + "".join(s[:10].rjust(11) for s in steps) + "   guess")
    for path in trainee:
        vec, t = embed(path)
        seconds.append(t)
        centred = jepa.centred_similarities(vec, protos)
        sims = np.array([centred[s] for s in steps])
        order = np.argsort(-sims)
        guess, truth = steps[order[0]], next((s for s in steps if path.stem.startswith(s)), None)
        correct += guess == truth
        margins.append(sims[order[0]] - (sims[order[1]] if len(sims) > 1 else -1))
        mark = "✓" if guess == truth else "✗"
        print(path.stem[:27].ljust(28) + "".join(f"{v:11.3f}" for v in sims) + f"   {guess} {mark}")
    accuracy = correct / len(trainee)
    print(f"\ntop-1 accuracy: {accuracy:.0%} ({correct}/{len(trainee)})")
    print(f"median margin: {np.median(margins):.3f}")
    print(f"embedding time: median {np.median(seconds):.2f} s per clip")
    print("GO" if accuracy >= GO_ACCURACY else "NO-GO", f"(go means top-1 accuracy of at least {GO_ACCURACY:.0%})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
