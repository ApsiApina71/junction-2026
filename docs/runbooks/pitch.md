---
status: draft
tags: [runbook, pitch, video, submission]
last-updated: 2026-11-13
---

# Pitch, video and submission copy

Working material for the Linear projects [Demo Video](https://linear.app/junction-2026-bossit/project/demo-video-32ee7efc2fe7), [Pitch Deck](https://linear.app/junction-2026-bossit/project/pitch-deck-a6caa29caa5c) and [Submission](https://linear.app/junction-2026-bossit/project/submission-bafb47e71313). Deadlines and the checklist are in [demo-day.md](demo-day.md). The brief is in [../context/challenge.md](../context/challenge.md).

Every figure quoted below is from the demo customer "Mikko" (`CUST00028`) on the dataset's last day, 30 Sep 2026. Re-check them in the app before recording: `/app/?c=CUST00028&lang=en`.

## One line

**Kolme koria: know your three baskets.** An AI money coach that lets people talk with their own bank account, and never guesses a number.

## Submission fields

- **Project name:** Kolme koria
- **Punchline:** Know your three baskets. Talk with your own money, and check every answer.
- **Challenge:** S-Bank. Also "Best use of Verda" if the demo runs on Verda (see ADR-002).
- **Description:**
  Kolme koria ("three baskets") is a mobile-first AI money coach built for S-mobiili. People ask their own account anything, from "how much did I spend on taxis last month?" to "what is safe for me to spend this week?", and every answer arrives with a live card they can open, drag and question.
  It teaches one idea: all spending falls into three baskets. Regular essentials, unexpected necessities, and everyday spending that slips through your fingers. The split is a starting point; the customer can move anything to the basket where it belongs for them, and every figure follows.
  What makes it trustworthy is the architecture. A tested finance engine computes every number. The language model only chooses which calculation to run and explains the result in plain Finnish or English. It never does arithmetic, each conversation is sealed to one customer's data, and safe-to-spend opens into the full sum behind it.
  Benchmarks come from open data: Statistics Finland's Household Budget Survey, the consumer price index and Paavo postal code area incomes, next to peers of the same age in the dataset.
- **Technologies:** Python, FastAPI, Strands Agents, SQLite, React, TypeScript, Vite, Statistics Finland PxWeb API. Model: TODO(team) once chosen (Claude, or an open-weight model on Verda).
- **Demo link:** TODO(team) after hosting is decided.
- **Source:** https://github.com/ApsiApina71/junction-2026

## How we score on the criteria

| Criterion | Our answer |
|---|---|
| Innovation | The model never does maths: an engine computes, the model talks. Labels belong to the customer. The marketing page is the live product. To S-Bank's knowledge no Finnish bank lets customers chat with their own data yet. |
| Impact | Built for S-mobiili's audience (3.5 million customers; one in three Finnish adults weekly, per the brief). One number for the week, one idea to learn, in Finnish, for young adults especially. |
| Implementation | Working end to end on the full 3.6 million-row dataset. Unit-tested engine, CI on every push, per-customer isolation, a 1 MB demo database for cheap hosting, model swappable by one setting. |
| S-Bank: pedagogy | The three baskets are the product, not a chart in it. |
| S-Bank: MyData spirit | Free exploration by basket, type, month, weekday, hour, merchant; free-form questions; customer-owned labels. |
| S-Bank: open data | Statistics Finland, with source and year shown next to each comparison. |
| S-Bank: PSD2 bonus | The coach detects salary moving to another bank, says its view is partial and offers to link the other account. |

## Video script (2:00 maximum, aim for 1:55)

Voice-over is about 270 words. Captions carry the same lines for viewers without sound.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00 | Black. A transaction list scrolls, greyed out. Then the three bars of the logo draw in. | Your bank knows every euro you spend. Ask it where your money goes, and it hands you a list. |
| 0:10 | Title: Kolme koria. Know your three baskets. | This is Kolme koria. Three baskets. A money coach you can talk to. |
| 0:17 | App opens as Mikko. Hero: safe to spend this week. | Mikko opens it and sees one number: what he can safely spend this week. |
| 0:25 | Tap "How is this calculated?". The two limits open, one outlined. | No black box. Two limits, what his balance allows and what this pay cycle allows. The lower one wins, and every line is there to check. |
| 0:38 | Ask "Where did my money go?". Baskets card, then month by month. | Where does it all go? Three baskets. Regular essentials. Unexpected necessities. And everyday spending, the part that slips through your fingers. |
| 0:52 | Open a basket, move one type to another basket. Bars shift. | It is his data, so they are his labels. Move something, and every figure follows. |
| 1:00 | Ask "What if I cut dining out by 20%?". Drag the slider. Tap "Make it a challenge". | What if he ate out a little less? He drags, and sees the euros, the visits, and what it does to his week. One tap turns it into a four-week challenge. |
| 1:15 | Type a free question (taxis last month). Answer streams with a card. Then the spender type and the benchmark card. | He can ask anything, in Finnish or English. What kind of spender is he? How does he compare with people his age, and with Statistics Finland's figures? |
| 1:30 | Diagram: transactions, engine, model, answer. | Here is why a bank can trust it. A tested engine computes every number. The language model only chooses and explains. It never does the maths, and it only ever sees one customer. |
| 1:43 | Line: model of your choice, hosted in Europe. | So the model is swappable, down to open models on European infrastructure. |
| 1:50 | Numbers: 3.5 million customers. One in three Finnish adults. Logo and address. | Built for the app one in three Finnish adults already use. Kolme koria. Know your three baskets. |

## Stage pitch (3:00, mic cut at 3:00)

1. **0:00 Problem (25 s).** Ask the room: who knows what they spent on eating out last month? Banks hand over lists, not answers.
2. **0:25 Demo (95 s).** Live from the laptop at `/` so the audience sees the story and the phone together: safe-to-spend and its sum; three baskets; move a label; what-if slider into a challenge; one free question.
3. **2:00 Why it can be trusted (30 s).** The engine computes, the model talks. Tests, isolation, shows its working.
4. **2:30 Why it matters (20 s).** S-mobiili's reach; financial literacy for young adults; Finnish first.
5. **2:50 Close (10 s).** Know your three baskets.

Fallback if the network or the model fails: the question shortcuts answer without a model, from the same engine. Keep `/app/?c=CUST00028` open in a second tab.

## Likely judge questions

- **What if the model invents a number?** It is instructed to state only figures a tool returned, and the cards beside the text are rendered straight from the engine, so the customer always sees the computed figure. Honest limit: the instruction is a prompt rule, not a hard guarantee; a production version would verify figures in the text against tool results before showing them.
- **How do you classify the baskets?** Rules on category and merchant code: housing, bills, groceries and commuting are regular; health and large home purchases are unexpected necessities; the rest is everyday. It is deliberately simple and the customer can override it.
- **Is safe-to-spend advice?** It is guidance with its assumptions shown. It keeps a cushion, reserves for the unexpected, and never recommends products.
- **Privacy?** Each request is bound to one customer. Free-form queries run on a private in-memory copy of that customer's rows with a read-only authorizer. The model can be hosted in Europe.
- **How would this go into S-mobiili?** `/app/` is a web view. The customer comes from the bank session instead of a demo picker; the engine reads from the bank's transaction store.
- **What is not done?** PSD2 linking is a prompt and a consent stub, not a real connection. Challenges are stored on the device and not yet tracked against new transactions. Open-weight models are untested in Finnish.
