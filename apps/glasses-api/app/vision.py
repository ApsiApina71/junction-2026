"""One model call per camera frame: is the wearer eating something, and what is on the plate."""

import base64
import os
from typing import Literal

import anthropic
from pydantic import BaseModel

MODEL_ID = os.getenv("MODEL_ID", "claude-sonnet-5-5")
# Frames arrive every few seconds, so the answer has to be quick. Raise for better portion estimates.
VISION_EFFORT = os.getenv("VISION_EFFORT", "low")
# en or fi. Not called LANGUAGE because Linux shells already set a variable with that name.
SPEECH_LANGUAGE = os.getenv("SPEECH_LANGUAGE", "en")


class FoodItem(BaseModel):
    name: str
    grams: float
    kcal: float
    protein_g: float
    carbs_g: float
    fat_g: float


class Sighting(BaseModel):
    """What one frame shows."""

    scene: Literal["my_food", "other_food", "no_food"]
    title: str
    items: list[FoodItem]
    same_as_open_meal: bool
    portion_left: float


class VisionError(RuntimeError):
    """The model could not be reached or did not answer."""


SYSTEM = """You are the eyes of an automatic calorie tracker that runs on camera glasses. Every image is what the wearer sees right now, from their own point of view. Nobody asks you anything: the tracker logs meals by itself from what you report, so a wrong "my_food" puts calories into the wearer's day that they never ate.

Decide the scene:
- "my_food": food or a drink the wearer is eating, drinking, or clearly about to. Typical signs: a plate, bowl, tray or cup directly in front of them at their own place at a table, food or a drink in their own hand, cutlery in their hand over the plate.
- "other_food": food is visible but it is not something the wearer is consuming now. Shop shelves and counters, the inside of a fridge, raw ingredients being prepared, a pan on the stove, someone else's plate across the table, sealed packages being carried, and any picture of food on a screen, menu or advert.
- "no_food": no food or drink in view.
If you cannot tell whether the wearer will eat it, answer "other_food". The tracker sees a new frame every few seconds, so a real meal gets many more chances.

For "my_food", list each distinct food and drink as one item with a realistic estimate of the portion in grams and the energy and macronutrients of that portion, as served. Judge portion size from the plate, cutlery and hands. If a package label with nutrition values is readable, use it. Leave out plain water. Give "title" as a short name for the whole meal, a few words. For the other scenes, return an empty item list and an empty title.

Sometimes you also get the meal the tracker already has open: its item list and a reference image of how it looked when it was first logged. Then:
- "same_as_open_meal" is true when the current view shows that same meal, at any stage of being eaten, including a nearly empty plate. It is false when the food in view is a different dish or a clearly new serving.
- "portion_left" is the share of the open meal that is still uneaten, from 1.0 (untouched) to 0.0 (finished), judged by comparing the current view with the reference image.
With no open meal, set "same_as_open_meal" to false and "portion_left" to 1.0.

Write "title" and the item names in {language}."""

_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic(timeout=30.0, max_retries=1)
    return _client


def _image(jpeg: bytes) -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.standard_b64encode(jpeg).decode("ascii")}}


def analyse(frame: bytes, open_meal: dict | None = None) -> Sighting:
    """Ask the model what the frame shows. `open_meal` is {"title", "items", "reference": jpeg bytes} or None."""
    content: list[dict] = []
    if open_meal:
        items = "; ".join(f"{i['name']} {round(i['grams'])} g" for i in open_meal["items"])
        content.append({"type": "text", "text": f"Open meal: {open_meal['title']} ({items}). Reference image, as first logged:"})
        content.append(_image(open_meal["reference"]))
        content.append({"type": "text", "text": "Current view:"})
    else:
        content.append({"type": "text", "text": "No open meal. Current view:"})
    content.append(_image(frame))

    try:
        response = _get_client().messages.parse(
            model=MODEL_ID,
            max_tokens=4000,
            system=SYSTEM.replace("{language}", "Finnish" if SPEECH_LANGUAGE == "fi" else "English"),
            messages=[{"role": "user", "content": content}],
            output_config={"effort": VISION_EFFORT},
            output_format=Sighting,
        )
    except anthropic.AuthenticationError as e:
        raise VisionError("The model rejected the API key. Check ANTHROPIC_API_KEY in .env.") from e
    except anthropic.RateLimitError as e:
        raise VisionError("The model is rate limited. Send frames less often.") from e
    except anthropic.APIStatusError as e:
        raise VisionError(f"The model returned an error ({e.status_code}): {e.message}") from e
    except anthropic.APIConnectionError as e:
        raise VisionError("Could not reach the model. Check the network connection.") from e
    except anthropic.AnthropicError as e:
        raise VisionError(f"The model call failed: {e}") from e

    sighting = response.parsed_output
    if response.stop_reason != "end_turn" or sighting is None:
        # A refusal or a cut-off answer: treat the frame as showing nothing rather than guess.
        return Sighting(scene="no_food", title="", items=[], same_as_open_meal=False, portion_left=1.0)
    return sighting
