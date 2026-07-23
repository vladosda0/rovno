# Sync and update flow review - 2026-07-12

Review target: current working-tree changes around estimate-v2 projection/sync, Tasks, Procurement, HR, project-level sync indicator, loading/redaction gates, and related tests.

Reviewer stance: independent code review/audit. Skills applied: sensitive-zone-audit, security-auditor, independent-verifier.

## Findings

### P1 - Layout-level context registration can queue a pre-hydration autosave from the default estimate state

Files:
- `src/layouts/ProjectLayout.tsx:61`
- `src/components/project/ProjectSyncIndicator.tsx:46`
- `src/hooks/use-estimate-v2-data.ts:65`
- `src/data/estimate-v2-store.ts:889`
- `src/data/estimate-v2-store.ts:1421`

Evidence:
- `ProjectLayout` now registers an estimate access context on every project page before rendering the route outlet and sync indicator (`ProjectLayout.tsx:61-73`, `119`).
- `ProjectSyncIndicator` calls `useEstimateV2Project(projectId)`.
- `useEstimateV2Project` initializes state synchronously with `getEstimateV2ProjectState(projectId)` before the Supabase hydrate effect starts (`use-estimate-v2-data.ts:65-72`, `82-107`).
- `getEstimateV2ProjectState` creates a default local estimate state when none exists. That default has `estimateStatus: "planning"`, generated/default works from legacy store stages, and no remote hydrate proof yet (`estimate-v2-store.ts:2436-2520`).
- `registerEstimateV2ProjectAccessContext` calls `queueProjectDraftSync` whenever a state exists (`estimate-v2-store.ts:1438-1442`).
- `queueProjectDraftSync` schedules `runProjectDraftSync` after the debounce for any managed projector session (`estimate-v2-store.ts:889-947`).
- `runProjectDraftSync` then calls `saveCurrentEstimateDraft` with the current normalized state if the session can access detail rows (`estimate-v2-store.ts:1108-1132`).

Why this matters:
On a cold Supabase project-page load, the sync indicator can seed the in-memory estimate state before the remote draft has hydrated. The layout registration then queues an autosave against that default state. If the 350ms debounce fires before hydration replaces the state, the app can persist a planning/default/empty snapshot over the real remote estimate draft. Even when hydration wins, the change still schedules unnecessary draft-save/projection work on pages that only wanted to display sync status.

Suggested fix:
- Do not queue draft sync from passive context registration. Let actual estimate mutations and completed hydration paths queue sync.
- Or add an explicit hydration guard/source marker so `queueProjectDraftSync` refuses to save states that were only default-seeded by `ensureProjectState`.
- Add a regression test that simulates: cold Supabase project page -> `useEstimateV2Project` default state exists -> layout registers owner/detail context -> remote hydrate is delayed beyond debounce -> assert `saveCurrentEstimateDraft` is not called until the hydrated state is installed or a real local edit occurs.

### P2 - Scope drift: observability/auth/dependency changes are bundled with the sync-flow diff

Files:
- `package.json:54`
- `.env.example`
- `src/App.tsx:59`
- `src/layouts/AppLayout.tsx:116`
- `src/components/feedback/FeedbackWidget.tsx`
- `src/lib/observability/*`
- `src/pages/auth/AuthCallback.tsx`
- `src/pages/auth/Login.tsx`
- `src/pages/auth/Signup.tsx`

Evidence:
- The working tree has 43 changed files, not only the sync/update files listed in the review request.
- It adds `@sentry/react`, app-wide React Query error reporting, a root error boundary, feedback widget, Sentry scrubbing, and auth/signup analytics instrumentation.

Why this matters:
These changes are not inherently wrong, but they add a new runtime dependency, new outbound telemetry paths, auth-page analytics, and a new Edge Function caller surface. They need separate privacy/security/release verification and should not be hidden inside a sync-flow review/commit.

Suggested fix:
- Split observability/auth/feedback dependency work into its own commit/PR or explicitly include it in the release contract.
- Keep the sync/update-flow commit limited to estimate projection, domain loading gates, ProjectSyncIndicator, and related tests.

## Security auditor result

No confirmed security vulnerability found in the reviewed frontend diff.

Notes:
- Feedback submission calls an authenticated Edge Function and client-side length-caps the message. The backend function in `rovno-db/supabase/functions/submit-feedback/index.ts` verifies the JWT again, rate-limits per user, escapes HTML for email, and stores through service role into an RLS-locked table.
- Sentry is DSN-gated, uses `sendDefaultPii: false`, scrubs request/user/extra data in `beforeSend`, and sets only pseudonymous user id.
- Auth analytics instrumentation does not change authentication or authorization decisions.

Security caveat:
The observability/auth/feedback surface is outside the stated sync-flow scope and still needs its own release checklist if it ships with this branch.

## Sensitive-zone audit

### Primary owner

Primary owner is `src/data/estimate-v2-store.ts`: it owns draft persistence, projection capability, sync state, and fan-out into Tasks, Procurement, and HR.

### Side-effect map

- Estimate draft save: `queueProjectDraftSync` -> `runProjectDraftSync` -> `saveCurrentEstimateDraft`.
- Tasks projection: `syncProjectTasksFromEstimate`, writes task ids back onto estimate works.
- Procurement projection: depends on task ids and estimate resource lineage.
- HR projection: depends on task ids, estimate work/resource-line lineage, HR assignee/status/payment read models.
- UI consumers: ProjectTasks, ProjectProcurement, ProjectHR now gate blocking state by projection capability and stable query invalidation.
- Project-level indicator: reads draft-save and domain sync statuses from every project page.

### Legacy/v2 overlap

The risky overlap is still the synchronous default state path in `ensureProjectState`: before Supabase hydrate completes, it can seed a local estimate state from legacy store/project/stages. The new project-level sync indicator makes that path reachable from every project page, not only Estimate/Procurement.

### Regression risks

- Pre-hydration autosave can overwrite remote estimate state if sync starts before hydrate settles.
- Query invalidation changes can hide refresh bugs because stable keys keep stale data visible until invalidation succeeds.
- Reader/projector gating can incorrectly unblock a user if retained access context gets stale after membership or finance visibility changes.
- HR finance totals can still be misread if any surface consumes summary data without the new `includesHr` / `spendExcludesHr` marker.

### Minimal safe approach

- First fix the pre-hydration autosave guard.
- Keep retained access context, but do not let registration alone imply "there is a draft to save."
- Add narrow tests around cold project-page load, reader vs projector gating, permission downgrade, and stable-key invalidation.

### Required regression checks

- Cold load `/project/:id/tasks`, `/project/:id/hr`, `/project/:id/procurement`, and `/project/:id/dashboard` as owner/detail with delayed estimate hydrate: no default snapshot save before hydrate.
- Owner/detail edit in Estimate still saves and projects to Tasks, Procurement, HR.
- Summary finance co-owner sees `blocked_permission`/skipped state and cannot silently save estimate rows.
- Viewer/contractor readers can act on DB-backed tasks without being blocked by local projection revision.
- HR loading and redacted states do not render "0 items" or zero money while permissions/data are still resolving.

## Independent verifier

### Verification target

Improve estimate-to-domain sync/update visibility and loading honesty across Project Estimate, Tasks, Procurement, and HR without leaking stale user/session data or blocking reader sessions.

### Evidence reviewed

- Plan: inferred from user-provided changed-file summary; no formal implementation contract found.
- Changed files: `git diff --name-status` showed 43 changed files.
- Diff: reviewed key sync/store/hooks/UI/tests plus observability/auth additions.
- Build output: `vite build` succeeded inside `npm run build`; post-build `node scripts/prerender-blog.mjs` failed on local `canvas.node` ABI mismatch.
- Test output: targeted Vitest command failed before collection on the same `canvas.node` ABI mismatch.
- Screenshots: none.
- Manual checklist: none.
- Contract artifacts: existing `backend-truth` finance visibility/RPC evidence was spot-checked; no backend-truth edits in this frontend diff.

### Acceptance criteria status

- [~] Sync status honesty: partially verified statically; blocked/skipped/error semantics are represented, but the pre-hydration autosave race needs rework.
- [~] Reader/projector gating: plausible statically; tests currently force projector in page tests and do not prove reader behavior.
- [~] Stable query keys and projection invalidation: plausible statically; needs runtime/test proof because targeted tests did not run locally.
- [~] HR/procurement/tasks loading vs empty/redacted: plausible statically; needs UI/runtime proof.
- [x] TypeScript typecheck: `npm run -s typecheck` passed.
- [ ] Full test/build verification: not verified due local `canvas.node` ABI mismatch.

### Scope check

The sync-flow file surface is expected, but the working tree also includes observability, auth analytics, feedback widget, Sentry dependency/env changes, and app-wide error reporting. That exceeds the stated sync/update-flow scope.

### Regression watch

- Default local estimate state vs remote Supabase hydrate ordering.
- Retained access context after account switch, route changes, permission downgrade, and ProjectEstimate/ProjectProcurement cleanup.
- Estimate-linked vs manual task status changes.
- HR payment loading combined with HR item loading.
- Procurement/HR fan-out after task projection failure.
- Feedback/Sentry/auth analytics should be verified separately if they remain in the branch.

### Verdict

Rework required.

### Missing proof or blockers

- Fix or rebuild local `canvas` native module, then rerun targeted tests and `npm run build`.
- Add a regression test for the cold-load pre-hydration autosave race.
- Add page-level tests where `useEstimateV2ProjectionCapability` returns `reader` and `blocked_permission`, not only `projector`.
- Add runtime/manual proof for Tasks, Procurement, HR, and Dashboard cold loads in Supabase mode.

## Commands run

- `git status -sb` in `/Users/vladislavgorlov/projects/rovno`: dirty branch `feat/observability-v1`, 43 changed files plus untracked sync/feedback/observability files.
- `git diff --name-status`, `git diff --stat`: reviewed file surface.
- `npm run -s typecheck`: passed.
- `npm test -- --run src/data/estimate-v2-store.sync-status.test.ts src/data/planning-source.test.ts src/hooks/use-hr-source.test.tsx src/pages/project/ProjectTasks.test.tsx src/pages/project/ProjectHR.test.tsx src/components/estimate-v2/EstimateFinanceHeader.test.tsx src/components/feedback/FeedbackWidget.test.tsx`: failed before collecting tests due `node_modules/canvas/build/Release/canvas.node` compiled for `NODE_MODULE_VERSION 127`, current Node requires `147`.
- `npm run build`: Vite bundle built successfully; failed in `node scripts/prerender-blog.mjs` on the same `canvas.node` ABI mismatch.
