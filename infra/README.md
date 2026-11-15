---
status: active
tags: [infra, hosting]
last-updated: 2026-11-15
---

# Infra

**owlboarding.com is published from main by the Site workflow** ([ADR-005](../docs/architecture/adr-005-site-cd-from-main.md)). Other hosting and CD (owl-api, preview deploys per PR) are still undecided. We will not use AWS.

## owlboarding.com

| Path | What |
|---|---|
| `.github/workflows/site.yml` | On a push to main that changes `apps/owl-site`, `apps/owl-studio` or `shared`: both apps' lint and tests, the build, the publish to Netlify, a check of the live pages |
| `infra/build-site.sh` | Builds the launch site (`/`) and the public Owl Studio demo (`/studio/`) into one folder. Runs locally too: `infra/build-site.sh /tmp/site` |
| `infra/site-publish` | The switch: the workflow publishes only when its first line is `on` |

Publishing also needs two repository secrets, which only the repository owner can add: `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID`. Until the switch is on and the secrets are there, the workflow checks and builds and says it did not publish. The order for switching it on is in ADR-005.

## What runs where for the demo

Apart from owlboarding.com, owl-api and Owl Studio can run on a Verda GPU machine with fixed https addresses: [verda/README.md](verda/README.md) (JUN-114). Otherwise everything runs on one Mac, and the glasses app reaches owl-api through a Cloudflare quick tunnel. The steps are in [owl-demo.md](../docs/runbooks/owl-demo.md).

| Part | Where it runs | Notes |
|---|---|---|
| `apps/owl-api` | the Mac, `uvicorn` on port 8000, behind `cloudflared tunnel` | Python 3.13+, no database server: state in `data/state.json`. Secrets: `ANTHROPIC_API_KEY`, the Jev key, `API_TOKEN` when the tunnel is public |
| `apps/owl-studio` | the Mac, `npm run dev`, or any static host | Talks to owl-api at `VITE_API_URL` |
| `apps/owl-glasses` | the iPhone paired with the glasses | Built with Xcode; the server address is set in the app |
| `apps/owl-site` | Netlify, owlboarding.com, with the Studio demo at `/studio/` | Published from main by the Site workflow once it is switched on (ADR-005); [JUN-87](https://linear.app/junction-2026-bossit/issue/JUN-87) |
