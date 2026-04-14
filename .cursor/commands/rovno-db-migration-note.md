# Rovno DB migration note

This workspace is **rovno-db**. Focus on migrations and contract pipeline.

1. What **migration or SQL** change is in scope? Forward-only, minimal, no unrelated policies.
2. What must stay coherent: **generators**, **RLS**, **grants**, **RPCs**, **triggers**?
3. What should **not** be edited from here (e.g. the `rovno` frontend repo)?
4. **Verification** — how to validate (apply migration locally, diff generated artifacts, etc.).

Align with repo rules for migration history and allowlists. Do not broaden scope.
