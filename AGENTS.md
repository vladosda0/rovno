# AGENTS.md — `rovno` (application)

How the AI should work in this repository, **in addition to** Cursor project rules.

## Instruction layering (read this first)

Apply guidance in this order when they conflict:

1. **`.cursor/rules/*.mdc`** — especially `alwaysApply: true` rules (source of truth, sensitive zones, preflight, subagent orchestration). These win.
2. **`.cursor/skills/**`** — invoke the matching `SKILL.md` when the task fits the skill description (audit, contract check, verification, mock vs real, etc.).
3. **`.cursor/agents/**`** — delegate via the **Task** tool when `subagent-orchestration` says to (repo auditor, contract inspector, planner, implementer, verifier, sensitive-zone reviewer, security / AI reviewers). Do not skip verification on non-trivial work.
4. **This `AGENTS.md`** — repo context, file pointers, and habits that rules do not repeat.

**Semantic search** is for exploration; **exact search** prefers `rg` with narrow scope first (see `.cursor/rules/07-search-prefer-ripgrep.mdc`).

---

## 1. Repo purpose

Frontend / app workspace for Rovno:

- UI, routes, app state (including mock/demo paths where they still exist)
- Hooks, stores, domain screens
- Supabase client integration and **read-only** contract snapshot under `backend-truth/`

**Not authoritative:** database schema, SQL migrations, RLS, RPC definitions. Those live in **`rovno-db`**.

---

## 2. Source-of-truth hierarchy

1. SQL migrations in **`rovno-db`**
2. Generated mirror: **`backend-truth/`** in this repo (read-only; do not hand-edit)
3. Adapters / mappers
4. Frontend types and UI models
5. Mock / demo store shapes

Never treat UI or mock types as DB truth. If the contract is missing a field or RPC, stop and fix **`rovno-db`** first, then consume the updated mirror via the **automated GitHub sync PR** after `rovno-db` is on `dev`.

---

## 3. Required reading before edits

**Backend-shaped or data work**

- `backend-truth/schema/tables.json`, `relations.json`, `rpc-functions.json`, `rls-summary.json`
- `backend-truth/generated/supabase-types.ts`
- Relevant `backend-truth/slices/*.json` and `backend-truth/contracts/*.md`

**App architecture**

- `src/hooks/use-mock-data.ts`, `src/data/store.ts`, `src/lib/permissions.ts`
- Relevant `src/data/*`, hooks, pages, components
- `src/integrations/supabase/client.ts` and `types.ts` when touching real seams

---

## 4. Planning and execution

- Plan first: files to touch, why, minimal surface (see `.cursor/rules/20-minimal-scope-change-and-reuse.mdc`).
- Non-trivial work: **inspect repo reality before edits**; separate product intent from implementation (`.cursor/rules/00-core-operating-boundary.mdc`).
- Use **slash commands** in `.cursor/commands/` when they match the moment (`/preflight`, `/ship-check`, `/rovno-contract-check`, etc.).
- Ambiguous requests: state assumptions explicitly; do not invent hidden behavior.

---

## 5. Forbidden unless explicitly requested

- Dependency upgrades, broad refactors, mass renames
- Wiring Supabase through many pages at once
- **Manual edits to `backend-truth/`** or ad hoc local regeneration of the mirror
- Inventing columns, tables, RPCs, or policies in app code

Mirror updates: **GitHub Actions sync PR** to `rovno` after `rovno-db` changes land on `dev`, not ad hoc agent regeneration.

---

## 6. Mock vs real

This repo may mix **real** integration and **mock/demo** paths. Classify before changing behavior (`.cursor/rules/40-mock-vs-real-boundary.mdc`, skill `mock-vs-real-boundary-check`). Do not silently turn mocks into production paths or remove fallbacks without an explicit request.

---

## 7. Verification before “done”

- Smallest relevant checks: `git diff` / `git diff --name-only`, `npm run build`, targeted `npm test` when appropriate.
- Use Cursor skill **`verification-and-regression-pass`** and/or **`rollback-aware-diff-review`** for non-trivial closeout.
- Optional Codex closeout: if available, `~/.codex/skills/finish-gate/SKILL.md` for structured handoff (does not replace project rules).

State what was verified and what was not.

---

## 8. Git

Human controls commits, merges, resets, reverts, branch deletes unless explicitly asked (see `.cursor/rules/00-core-operating-boundary.mdc`).

Prefer small, single-intent commits; separate app logic from incidental noise per `.cursor/rules/06-generated-artifacts-and-local-noise.mdc`.

---

## 9. When to stop and escalate

Stop and summarize blockers if:

- Required contract pieces are missing from `backend-truth/`
- Demo vs real boundaries are unclear
- Multiple stores/models compete for ownership
- Change needs **`rovno-db`** work but that work is not done

Use **subagents** rather than guessing (contract inspector, planner, sensitive-zone reviewer as appropriate).

---

## 10. Quick reference

| Area        | Location |
|------------|----------|
| Contract   | `backend-truth/README.md`, `schema/`, `slices/`, `contracts/`, `generated/` |
| Permissions| `src/lib/permissions.ts` |
| Data entry | `src/data/store.ts`, `src/hooks/use-mock-data.ts` |
| Supabase   | `src/integrations/supabase/` |
| Cursor     | `.cursor/rules/`, `.cursor/skills/`, `.cursor/agents/`, `.cursor/commands/` |

This repo **consumes** backend truth produced from `rovno-db/scripts/generate-backend-truth.mjs`.
