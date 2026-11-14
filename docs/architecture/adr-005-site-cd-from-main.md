---
status: active
tags: [adr, infra, hosting, site, studio]
last-updated: 2026-11-15
---

# ADR-005: owlboarding.com is published from main by a GitHub Actions workflow

- **Decision status:** accepted, not switched on yet (see "Switching it on")
- **Tickets:** [JUN-87](https://linear.app/junction-2026-bossit/issue/JUN-87) (site hosting), [JUN-101](https://linear.app/junction-2026-bossit/issue/JUN-101) (the public Studio demo)
- **Date:** 2026-11-15

## Context

owlboarding.com is a Netlify site (`owlboarding`) with the launch page at `/` (`apps/owl-site`) and the public Owl Studio demo at `/studio/` (`apps/owl-studio`, its preview entry: sample data in the browser, no backend, no credentials). Until now each release was a folder built on a laptop and uploaded with `netlify deploy`; the Netlify site is not linked to this repository, so a commit to main changed nothing live. On 2026-11-14 the launch page that was live was built from files that were not in git.

John asked for the site to follow the commits. The repository belongs to another account; John can push but not change its settings.

## Options

1. **Netlify's own Git link.** Netlify builds every push. Needs the repository owner to install Netlify's GitHub app, and nothing gates a publish on lint and tests.
2. **A GitHub Actions workflow that checks, builds and publishes with the Netlify CLI.** Needs the repository owner to add two secrets once. Publishes only what passed the same checks as CI.
3. **Keep publishing by hand.** Works, but what is live drifts from what is in git.

## Decision

Option 2: `.github/workflows/site.yml`.

- It runs on a push to main that changes `apps/owl-site`, `apps/owl-studio`, `shared`, the build script or the workflow, and by hand (workflow_dispatch).
- It runs both apps' lint and tests, then `infra/build-site.sh`, which builds the launch site and the Studio demo into one folder (`/` and `/studio/`).
- It publishes that folder to production with a pinned Netlify CLI, then checks that `/` and `/studio/` on owlboarding.com are the pages it just built.
- One publish runs at a time, in order.

Two switches keep it from publishing too early:

- **`infra/site-publish`**, in the repository: the first line must be `on`. Anyone who can push can turn publishing off again.
- **The secrets** `NETLIFY_AUTH_TOKEN` (a Netlify personal access token of an account that can deploy the site) and `NETLIFY_SITE_ID` (`2efd0ad7-3d5d-4556-9115-0107b9103073`). Without them the workflow checks and builds and says it did not publish.

## Switching it on

1. Commit the launch page that is live into `apps/owl-site`. On 2026-11-15 main's `apps/owl-site` was older than the live page: it had no `demo/`, `fonts/` and `owl/` folders, no glasses models or intro video, and it loaded Google Fonts. Check with `infra/build-site.sh` and a local server that `/` matches owlboarding.com.
2. The repository owner adds the two secrets (Settings, Secrets and variables, Actions).
3. Write `on` as the first line of `infra/site-publish` and push. The Site run publishes and checks the live pages.

## Consequences

- What is live is what is in main and passed its checks. A release is a commit; a rollback is a revert, or a previous deploy in Netlify's deploy history.
- A push that touches the site goes live within minutes, without a separate review. Turn `infra/site-publish` off to hold releases.
- The Netlify token belongs to a person's account; replace it if that person leaves the project.
