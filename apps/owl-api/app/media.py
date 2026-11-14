"""Video and photo work for Record (JUN-32) and for check frames sent as a short clip.

- transcode_clip: any clip from the glasses (HEVC or H.264, .mp4 or .mov) to a small H.264 MP4 that the DAT
  VideoPlayer on Meta Ray-Ban Display plays: MP4, at most 400 px per side and 70 000 pixels, faststart.
- blur_faces: faces in recorded photos and clips are blurred before they are stored.
- last_frame: the newest frame of a short clip as a JPEG, for /check and /help/frames when the phone could not decode
  the hvc1 stream itself (iOS can refuse hardware decoding in the background).
"""

import io
import math
import tempfile
import threading
from fractions import Fraction
from pathlib import Path

import av
import cv2
import numpy as np
from PIL import Image

MAX_SIDE, MAX_PIXELS = 400, 70_000  # DAT VideoPlayer limits
CLIP_FPS = 15
MAX_CLIP_SECONDS = 10.0
FACE_MODEL = Path(__file__).parent / "assets" / "face_detection_yunet_2023mar.onnx"  # OpenCV Zoo, MIT


class MediaError(Exception):
    """The upload is not a video this server can read."""


def fit_size(width: int, height: int, max_side: int = MAX_SIDE, max_pixels: int = MAX_PIXELS) -> tuple[int, int]:
    """The largest even size with the same aspect ratio inside the display limits."""
    scale = min(1.0, max_side / max(width, height), math.sqrt(max_pixels / (width * height)))
    w, h = int(width * scale) // 2 * 2, int(height * scale) // 2 * 2
    while w * h > max_pixels:
        w, h = w - 2, max(2, round(h * (w - 2) / w) // 2 * 2)
    return max(2, w), max(2, h)


# Faces

_detector_lock = threading.Lock()
_detector = None


def _faces(bgr: np.ndarray) -> list[tuple[int, int, int, int]]:
    global _detector
    h, w = bgr.shape[:2]
    with _detector_lock:
        if _detector is None:
            _detector = cv2.FaceDetectorYN.create(str(FACE_MODEL), "", (w, h), score_threshold=0.6)
        _detector.setInputSize((w, h))
        _, found = _detector.detect(bgr)
    return [] if found is None else [tuple(int(v) for v in row[:4]) for row in found]


def blur_faces_rgb(rgb: np.ndarray) -> tuple[np.ndarray, int]:
    """Blurs every detected face (with a margin) beyond recognition. Returns the image and the number of faces."""
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    boxes = _faces(bgr)
    h, w = bgr.shape[:2]
    for x, y, bw, bh in boxes:
        mx, my = int(bw * 0.25), int(bh * 0.3)
        x0, y0, x1, y1 = max(0, x - mx), max(0, y - my), min(w, x + bw + mx), min(h, y + bh + my)
        if x1 <= x0 or y1 <= y0:
            continue
        region = bgr[y0:y1, x0:x1]
        # Pixelate, then blur: no detail of the face survives.
        small = cv2.resize(region, (max(1, (x1 - x0) // 12), max(1, (y1 - y0) // 12)), interpolation=cv2.INTER_LINEAR)
        bgr[y0:y1, x0:x1] = cv2.GaussianBlur(cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST), (0, 0), 6)
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB), len(boxes)


def blur_faces(jpeg: bytes) -> bytes:
    with Image.open(io.BytesIO(jpeg)) as img:
        rgb = np.asarray(img.convert("RGB")).copy()
    blurred, count = blur_faces_rgb(rgb)
    if not count:
        return jpeg
    out = io.BytesIO()
    Image.fromarray(blurred).save(out, format="JPEG", quality=82)
    return out.getvalue()


# Video


def _open(data: bytes) -> av.container.InputContainer:
    try:
        container = av.open(io.BytesIO(data), mode="r")
    except (av.FFmpegError, ValueError) as e:
        raise MediaError("Not a video this server can read. Send MP4 or MOV.") from e
    if not container.streams.video:
        container.close()
        raise MediaError("The file has no video.")
    return container


def _frames(data: bytes):
    container = _open(data)
    try:
        stream = container.streams.video[0]
        stream.thread_type = "AUTO"
        yield from container.decode(stream)
    except av.FFmpegError as e:
        raise MediaError("The video could not be decoded.") from e
    finally:
        container.close()


def last_frame(data: bytes) -> bytes:
    """The newest frame of a short clip, as a JPEG."""
    last = None
    for frame in _frames(data):
        last = frame
    if last is None:
        raise MediaError("The clip has no frames.")
    out = io.BytesIO()
    last.to_image().save(out, format="JPEG", quality=85)
    return out.getvalue()


def transcode_clip(data: bytes, max_seconds: float = MAX_CLIP_SECONDS, blur: bool = True) -> bytes:
    """A display-sized H.264 MP4 (faststart, no audio, CLIP_FPS) with faces blurred."""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "clip.mp4"
        written = 0
        with av.open(str(path), "w", options={"movflags": "faststart"}) as out:
            stream = None
            next_t = 0.0
            for frame in _frames(data):
                t = float(frame.time) if frame.time is not None else written / CLIP_FPS
                if t > max_seconds:
                    break
                if t + 1e-6 < next_t:  # drop frames to reach CLIP_FPS
                    continue
                while next_t <= t + 1e-6:  # the next slot on an even CLIP_FPS grid
                    next_t += 1.0 / CLIP_FPS
                if stream is None:
                    w, h = fit_size(frame.width, frame.height)
                    stream = out.add_stream("libx264", rate=CLIP_FPS, options={"preset": "veryfast", "crf": "26", "profile": "baseline"})
                    stream.width, stream.height, stream.pix_fmt = w, h, "yuv420p"
                    stream.time_base = Fraction(1, CLIP_FPS)
                rgb = frame.to_ndarray(format="rgb24", width=stream.width, height=stream.height)
                if blur:
                    rgb, _ = blur_faces_rgb(rgb)
                video = av.VideoFrame.from_ndarray(rgb, format="rgb24")
                video.pts = written
                out.mux(stream.encode(video))
                written += 1
            if stream is None:
                raise MediaError("The clip has no frames.")
            out.mux(stream.encode())
        return path.read_bytes()
