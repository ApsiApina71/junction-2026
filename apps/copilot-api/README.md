---
status: draft
tags: [app, api, prototype]
last-updated: 2026-11-13
---

# copilot-api

Prototype backend for the grocery copilot (Junction 2026, Meta challenge). The phone app sends one photo from the glasses camera; Claude identifies the product and judges it against the shopping list.

- `GET /health`
- `GET /list`: the demo shopping list
- `POST /check`: multipart `image` (JPEG/PNG/WebP, max 5 MB), optional `shopping_list` (JSON array), `preferences`, `language`. Returns `identified`, `product_name`, `on_list`, `list_item`, `verdict` (`ok` | `swap` | `warning` | `unknown`) and `speech`.

Uses `claude-opus-5-5` at low effort with server-side refusal fallbacks. Linear project: [Software](https://linear.app/junction-2026-bossit/project/software-e68385965606).
