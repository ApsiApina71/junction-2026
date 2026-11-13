"""Look at one photo from the glasses and judge it against the shopping list."""

import base64
import os
from typing import Literal

import anthropic
from pydantic import BaseModel, Field

MODEL_ID = os.getenv("MODEL_ID", "claude-opus-5-5")

SYSTEM_PROMPT = """You are a grocery copilot speaking through smart glasses while the user shops.
You get one photo from the glasses camera, the user's shopping list and their preferences.

Identify the main product the user is looking at or holding. Then decide:
- on_list: true if it matches an item on the shopping list (brand does not matter).
- verdict: "ok" if it is a good pick for the list, "swap" if a clearly better option for the
  user's preferences is visible in the photo, "warning" if it conflicts with an allergy or diet,
  "unknown" if you cannot tell what the product is.
- speech: what the glasses say in the user's ear. One or two short sentences, at most 20 words,
  friendly and concrete. No markdown, no emojis. Write it in the requested language.

Only describe what is visible. Never invent prices you cannot read in the photo."""


class ProductCheck(BaseModel):
    identified: bool = Field(description="True if a product could be recognized")
    product_name: str = Field(description="Short product name, empty if not identified")
    on_list: bool
    list_item: str | None = Field(description="The matching shopping-list item, if any")
    verdict: Literal["ok", "swap", "warning", "unknown"]
    speech: str = Field(description="What to say in the user's ear, at most 20 words")


class CheckError(Exception):
    """The model could not produce a usable answer."""


_client = anthropic.Anthropic()


def check_product(
    image: bytes,
    media_type: str,
    shopping_list: list[str],
    preferences: str,
    language: str,
) -> ProductCheck:
    image_b64 = base64.standard_b64encode(image).decode("utf-8")
    items = "\n".join(f"- {item}" for item in shopping_list) or "- (empty)"
    request_text = (
        f"Shopping list:\n{items}\n\n"
        f"Preferences: {preferences or 'none given'}\n"
        f"Language for speech: {language}"
    )

    response = _client.beta.messages.parse(
        model=MODEL_ID,
        max_tokens=4000,
        # Low effort keeps the in-store answer fast; raise it if answers get sloppy.
        output_config={"effort": "low"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        system=SYSTEM_PROMPT,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_b64,
                        },
                    },
                    {"type": "text", "text": request_text},
                ],
            }
        ],
        output_format=ProductCheck,
    )

    if response.stop_reason == "refusal" or response.parsed_output is None:
        raise CheckError(f"No usable answer (stop_reason={response.stop_reason})")
    return response.parsed_output
