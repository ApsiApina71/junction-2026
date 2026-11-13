---
status: active
tags: [app, web, coach]
last-updated: 2026-11-13
---

# coach-web (Kolme koria)

The mobile-first web app of the S-Bank money coach (Junction 2026, S-Pankki challenge). Linear project: [Software](https://linear.app/junction-2026-bossit/project/software-e68385965606).

A chat-first experience: the customer talks with their own money and every answer arrives with a live card (safe-to-spend, the three baskets, an interactive what-if, benchmarks). It is built to be embedded in a mobile app as a web view. The backend is `apps/coach-api`.

Two pages are built: the marketing site at `/` (`index.html`, `src/site/`) with the live app embedded in a phone frame, and the coach itself at `/app/` (`app/index.html`, `src/App.tsx`), which is the part meant for a web view. `/app/?c=CUST00028&lang=fi` opens straight into a demo customer.

The pitch deck is a third page, `/deck/` (`deck/index.html`), exported to `public/kolme-koria-deck.pdf` by printing it from Chrome at 1280 by 720. Product screenshots for it live in `public/shots/`.
