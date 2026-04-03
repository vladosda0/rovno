---
name: incident-rollback-triage
description: >-
  Structured triage for production issues or bad deploys: stop bleeding, choose revert vs forward fix, data safety. Use when the user reports outages, bad migrations, broken AI, or “something is wrong in prod.”
---

# Incident / rollback triage

## Stabilize

1. Confirm **severity** (down vs degraded vs single user).
2. Identify **last known good** deploy/commit/migration.
3. **Freeze** risky further changes until direction is chosen.

## Revert vs forward fix

| Prefer **revert** when | Prefer **forward fix** when |
|------------------------|------------------------------|
| app regression, fast rollback possible | tiny targeted patch, revert is riskier |
| bad migration not yet wide | migration already applied broadly; need corrective migration |
| unknown root cause | root cause clear and fix is minimal |

## Data safety

- Warn before destructive **data deletes** or policy relaxations.
- For DB: prefer **new migration** to repair over hand-editing history unless user approves controlled rewrite.

## Communication

- Short **timeline** of what changed vs when symptoms started.
- **User-facing** status line if they need to tell customers.

## Output

- Recommended **next command or step** (not a wall of shell)
- **One** primary owner action for the solo dev
- Explicit **unknowns**

Do not perform git resets or production actions unless the user explicitly asks.
