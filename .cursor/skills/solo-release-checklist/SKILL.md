---
name: solo-release-checklist
description: >-
  Short release checklist for solo maintainer before merge or deploy: migrations, mirror sync, tests, smoke, rollback note. Use when preparing to ship rovno-db changes, after a large rovno merge, or when the user asks if they are ready to release.
---

# Solo release checklist

Use when the user is about to merge, deploy, or hand off a “done” slice.

## Rovno-db (backend truth)

1. Migrations are **forward** and named consistently; no surprise edits to old applied migrations.
2. Generator allowlist/tests updated if required by repo rules.
3. User knows **mirror sync**: push `rovno-db` → automated GitHub PR updates `rovno` `backend-truth/` (no ad hoc manual mirror patches from agent sessions).
4. Smallest relevant **SQL or script check** run locally if applicable.

## Rovno (app)

1. **Typecheck / lint / tests** as appropriate for the touched area (do not run the whole suite if the user only changed docs—stay proportional).
2. **Sensitive flows** touched? Note manual smoke steps (estimate → task → procurement → HR → AI if relevant).
3. **Feature flags / env**: any new vars documented for the user?

## Cross-cutting

1. **Rollback**: one sentence—revert commit, disable flag, or DB forward migration?
2. **Secrets**: confirm nothing new landed in client bundles or logs.
3. **Open risks**: list what was **not** verified.

Output a short **go / no-go** with reasons.
