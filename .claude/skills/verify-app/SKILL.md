---
name: verify-app
description: Verify an app by running exactly the commands in the Verify section of apps/<app>/CLAUDE.md. Use after changing an app and before opening a PR.
argument-hint: "[app]"
---

Verify the app `$ARGUMENTS`. If no app is given, verify every app with changes against `origin/main` (`git diff --name-only origin/main...HEAD -- apps/`).

1. Read `apps/<app>/CLAUDE.md` and find its **Verify** section.
2. Run each listed command, in order, from `apps/<app>/`. **Never guess, add or substitute commands.** If the section is missing, stop and report it.
3. If a command fails, fix the cause and rerun all of the commands. Loop until they all pass.
4. Report each command as pass or fail.
