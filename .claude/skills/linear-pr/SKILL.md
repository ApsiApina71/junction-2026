---
name: linear-pr
description: Ship the current Linear ticket. Verify, commit with "Fixes JUN-<n>", push to main (direct mode, current) or open an auto-merging PR (PR mode, later), and post a one-line summary on the ticket. Use when a ticket's work is done and verified.
argument-hint: "[JUN-<n>]"
---

Ship ticket $ARGUMENTS. If no id is given, take it from the current branch name or the conversation.

**Current mode: direct to `main`.** GitHub Free cannot enforce auto-merge or required checks on a private repo, so we push straight to `main` for now. PR mode comes back once we have a merge gate (decision ticket).

## Direct mode (current)

1. **Ticket:** fetch it with the Linear MCP. Note the id, title and URL.
2. **Sync:** `git pull --rebase origin main`.
3. **Verify:** run `/verify-app <app>` for every app you touched. Fix anything that fails.
4. **Commit:** stage only this ticket's files. Subject: `JUN-<n>: <imperative summary>`. Body: `Fixes JUN-<n>`.
5. **Push:** `git push origin HEAD:main`. Never force push. If the push is rejected, pull with rebase, verify again and push.
6. **CI:** `gh run watch` on the push run. If it fails, fix it immediately with a follow-up commit.
7. **Ticket:** move it to Done and add one comment: `<commit url>: <one-line summary>`.

## PR mode (later)

Branch with Linear's branch name, push it, run `gh pr create` with `Fixes JUN-<n>` in the body (use `.github/pull_request_template.md`), then `gh pr merge --auto --squash --delete-branch`, and move the ticket to In Review.
