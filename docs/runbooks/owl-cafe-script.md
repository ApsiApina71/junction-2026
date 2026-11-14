# Café demo: customer service mode (JUN-98)

A one-minute scene for the stage or the video. Noa is on day 2 of 5 of training at Café Kide. A customer asks things Noa does not know yet; on a Hint pinch, Owl shows two or three points from the café's own handbook.

## Set up

- owl-api with `OWL_DEMO=1` (or `OWL_MOCK_ASSIST=1`): no model is needed, the suggestions come from the local handbook search. See [owl-demo.md](owl-demo.md) for starting the server and the tunnel.
- Glasses: `glasses-6` is Noa's. Noa's training plan (`plan-cafe-counter`) has customer service mode, so the glasses offer it.
- The knowledge base is `apps/owl-api/fixtures/docs/cafe-handbook.md` (in Studio under Documents as "Café Kide: counter handbook").
- Print the sign at the desk: Studio → Training → "Customer service: the sign at the desk" → Print the sign.

## The scene

Noa turns customer service mode on. The glasses show that Owl is listening. One teammate plays the customer, and Noa pinches Hint after each question.

| The customer says | Owl shows (from the handbook section) |
|---|---|
| "Hi! One latte please. With oat milk, is that extra?" | Oat milk or soy milk costs nothing extra. · Cappuccino and latte 4.50 €. (Prices) |
| "Oh, and these coffee beans I bought yesterday, can I still return them? They're unopened." | Unopened coffee beans can be returned within 14 days with the receipt. · Opened coffee beans cannot be returned. (Returns and refunds) |
| "Is there gluten in the cinnamon bun? My son has an allergy." | The cinnamon buns contain gluten, milk and egg. · The allergen list for every product is in the blue folder next to the till. · The rye sandwich contains gluten. (Allergens) |
| "And are you open on Sunday?" | Sunday closed. · On public holidays we open at 10:00 and close at 15:00. (Opening hours) |
| "Who won the football match last night?" | Not in the handbook, ask a colleague |

Noa answers in their own words. The last line shows that Owl does not guess.

Between the questions Noa answers ("No, oat milk is free.", "Yes, with the receipt.", "Let me check."). The search looks at the newest sentence first, so an earlier question that was already answered does not come back. `tests/test_assist.py::test_the_newest_question_wins` plays the same conversation.

## What to say about it

- Owl listens only during training, only while Noa has the mode on, and the sign tells customers.
- No sound and no text is kept: the last half minute is used for one suggestion and dropped.
- The points come only from the café's own documents, and each one names its section.
