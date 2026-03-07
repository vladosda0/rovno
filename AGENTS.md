# AGENTS.md

## 1. Repo purpose

This repository contains the Rovno application code.

It is the frontend/app workspace and currently includes:
- UI and route structure
- app state and mock/demo stores
- project pages and domain screens
- local integration scaffolding for future Supabase-backed data access
- a synced read-only backend contract snapshot under `backend-truth/`

This repo is not the authoritative source for database schema, SQL migrations, RLS, or backend policies.
Those belong to the sibling repository: `rovno-db`.

---

## 2. Source-of-truth hierarchy

When data-model questions arise, trust this order:

1. merged SQL migrations in `rovno-db`
2. generated backend contract mirror in `backend-truth/`
3. frontend adapters / mapping code
4. frontend domain types and UI models
5. local mock/demo store shapes

Important:
- UI types are not authoritative backend truth
- mock store structures are not authoritative backend truth
- do not infer DB fields from UI code

---

## 3. Required reading before edits

Before making changes, inspect the minimum relevant context.

For backend-related or data-related work, read:
- `backend-truth/schema/tables.json`
- `backend-truth/schema/relations.json`
- `backend-truth/schema/rpc-functions.json`
- `backend-truth/schema/rls-summary.json`
- `backend-truth/generated/supabase-types.ts`
- relevant `backend-truth/slices/*.json`
- relevant `backend-truth/contracts/*.md`

For app architecture work, inspect:
- `src/hooks/use-mock-data.ts`
- `src/data/store.ts`
- relevant `src/data/*` modules
- relevant route/page/component files
- `src/lib/permissions.ts` when permissions or memberships are involved

If the requested change touches a real backend integration seam, inspect current hook/data boundaries before editing UI pages.

---

## 4. Planning and execution rules

Always work plan-first.

Before editing:
- identify exact files to change
- explain why each file is needed
- keep the change surface minimal
- prefer adapting existing architecture over introducing parallel patterns

For non-trivial tasks:
- separate discovery from implementation
- do not jump from product intent directly into edits
- inspect repo reality first
- then implement only after scope is clear

If the request is ambiguous, do not invent hidden behavior.
State the assumption explicitly in the plan.

---

## 5. Edit scope and forbidden actions

Default rule: minimal, local, reversible edits.

Prefer:
- existing components
- existing hooks
- existing stores
- existing design tokens
- existing route structure

Do not do any of the following unless explicitly requested:
- update dependencies
- reorganize folders
- rename broad sets of files
- rewrite architecture wholesale
- replace mock/store systems globally
- wire Supabase directly into many pages at once
- edit `backend-truth/` manually
- invent backend columns, tables, RPCs, or policies

`backend-truth/` is read-only.
If it appears incorrect, the fix belongs in `rovno-db` generator or migrations, not here.

---

## 6. Data / contract rules

`backend-truth/` is the canonical backend contract snapshot for this repo.

Rules:
1. Never invent database fields from frontend types.
2. Never assume frontend `User`, `Project`, or `Member` maps 1:1 to DB rows.
3. Use adapters/mappers where frontend and backend shapes differ.
4. Keep demo/mock data behavior separate from real backend-backed behavior unless explicitly designed otherwise.
5. Preserve demo mode unless the task explicitly changes it.
6. When working on the first integration seam, prefer hook/repository boundaries over page-by-page rewrites.

Important current architecture fact:
- this repo still contains seeded/mock runtime state
- real backend integration must be introduced incrementally without breaking demo UX

---

## 7. Verification gates

Before declaring work complete, run the smallest relevant verification set.

Minimum for most app changes:
- `git diff --name-only`
- `git diff`
- `npm run build`

When relevant, also run:
- `npm test`
- targeted tests related to the changed domain

Validation goals:
- only intended files changed
- build passes
- no obvious regression introduced
- data-related changes remain aligned with `backend-truth/`

Warnings may be reported, but errors/blockers must be called out clearly.

---

## 8. Git / commit / PR rules

Human controls Git decisions.

Do not:
- commit
- merge
- reset
- revert
- delete branches

unless explicitly asked.

When asked to prepare commit guidance:
- keep commits small
- group by single intent
- separate generated artifacts from hand-written logic when practical

If changes touch both app code and backend contract generation, prefer separate commits and separate repos.

---

## 9. When to stop and ask for review

Stop and surface risk before editing if:
- the task conflicts with `backend-truth/`
- the requested behavior requires backend fields not present in contract files
- the change would require broad architectural refactoring
- multiple competing stores/models are involved and canonical ownership is unclear
- the task appears to mix demo-only and real-data behavior without an explicit strategy

In those cases:
- summarize findings
- list exact blockers or mismatches
- propose the smallest safe next step

---

## 10. Repo-specific references

Key app architecture files:
- `src/hooks/use-mock-data.ts`
- `src/data/store.ts`
- `src/lib/permissions.ts`
- `src/integrations/supabase/client.ts`
- `src/integrations/supabase/types.ts`

Backend contract snapshot:
- `backend-truth/README.md`
- `backend-truth/schema/*`
- `backend-truth/slices/*`
- `backend-truth/contracts/*`
- `backend-truth/generated/*`

This repo consumes backend truth.
The backend contract is generated from `rovno-db/scripts/generate-backend-truth.mjs`.
