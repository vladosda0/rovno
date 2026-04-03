# Rovno contract check

This workspace is the **rovno** app. Check the change or plan against backend truth and boundaries.

1. Does anything assume schema, APIs, or types that might not match **backend-truth / Supabase / generated** sources?
2. Does the work touch **sensitive zones** (estimate, tasks, procurement, HR, AI sidebar, sync)? If yes, what handoffs or rules apply?
3. Is this **mock vs real** — are we changing demo/local behavior vs production paths?
4. List **concrete** files or docs to verify before shipping.

Use the project's rules and skills; stay specific to this repo.
