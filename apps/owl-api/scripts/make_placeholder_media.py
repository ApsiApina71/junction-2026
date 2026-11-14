"""Makes the placeholder step images and clips in fixtures/media/ until real recorded media replaces them.

Run: uv run python scripts/make_placeholder_media.py
"""

import json
from fractions import Fraction
from pathlib import Path

import av
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
PROCESS = json.loads((ROOT / "fixtures/process-pick-pack.json").read_text(encoding="utf-8"))
OUT = ROOT / "fixtures/media/proc-pick-pack"

# DAT VideoPlayer: MP4, at most 400 px per side and 70 000 pixels in total.
CLIP_SIZE = (352, 198)
CLIP_SECONDS, FPS = 4, 15
IMAGE_SIZE = (600, 450)  # The display renders at 600x600.


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for name in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        if Path(name).exists():
            return ImageFont.truetype(name, size)
    return ImageFont.load_default()


def card(size: tuple[int, int], index: int, title: str, progress: float | None = None) -> Image.Image:
    w, h = size
    img = Image.new("RGB", size, (24, 32, 48))
    d = ImageDraw.Draw(img)
    s = w / 600
    d.rounded_rectangle((int(30 * s), int(30 * s), w - int(30 * s), h - int(30 * s)), radius=int(24 * s), outline=(255, 196, 64), width=max(2, int(6 * s)))
    d.text((int(60 * s), int(60 * s)), f"STEP {index}", font=font(int(40 * s)), fill=(255, 196, 64))
    d.text((int(60 * s), int(130 * s)), title, font=font(int(44 * s)), fill=(255, 255, 255))
    d.text((int(60 * s), h - int(100 * s)), "placeholder", font=font(int(28 * s)), fill=(140, 150, 170))
    if progress is not None:
        x = int(60 * s + (w - 120 * s) * progress)
        d.ellipse((x - int(14 * s), h - int(150 * s), x + int(14 * s), h - int(122 * s)), fill=(255, 196, 64))
    return img


def write_clip(path: Path, index: int, title: str) -> None:
    with av.open(str(path), "w", options={"movflags": "faststart"}) as container:
        stream = container.add_stream("libx264", rate=FPS, options={"preset": "veryfast", "crf": "28", "profile": "baseline"})
        stream.width, stream.height = CLIP_SIZE
        stream.pix_fmt = "yuv420p"
        stream.time_base = Fraction(1, FPS)
        frames = CLIP_SECONDS * FPS
        for i in range(frames):
            frame = av.VideoFrame.from_image(card(CLIP_SIZE, index, title, i / (frames - 1)))
            frame.pts = i
            container.mux(stream.encode(frame))
        container.mux(stream.encode())


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for step in PROCESS["steps"]:
        name = step["id"]
        card(IMAGE_SIZE, step["index"], step["title"]).save(OUT / f"{name}.jpg", quality=80)
        if step["clip_url"]:
            write_clip(OUT / f"{name}.mp4", step["index"], step["title"])
    print(f"Wrote {len(list(OUT.iterdir()))} files to {OUT}")


if __name__ == "__main__":
    main()
