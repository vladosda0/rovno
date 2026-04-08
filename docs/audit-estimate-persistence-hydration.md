# Audit: Estimate persistence / hydration / sync (Issues A & B)

**Scope:** Investigation and planning only — no implementation in this document.  
**Repo:** `rovno` (app). Backend mirror: `backend-truth/` (read-only contract snapshot).  
**Date:** 2026-04-08  

**Preflight (at audit time):** Branch `dev`, dirty working tree possible on `estimate-source.ts`, `estimate-v2-store.ts`, related tests — re-verify line numbers before coding.

---

## Product intent

- Estimates must **round-trip completely** after save and refresh: stages, works, and resource lines stay aligned with user actions unless the user deletes something.
- **Pricing fields** (markup, discount) must persist and display consistently for **every** line, for every role that is supposed to see them.
- **Full-visibility collaborators** (e.g. co-owner with detail) must not see a weaker or divergent financial graph than the owner without an explicit permission reason.
- Fixes must **scale** to many stages/works/lines and must not rely on “first entity” behavior.
- **Issue B** is **worse than a co-owner-only bug**: if the owner also loses Stage 2 resources after refresh, the failure is in **persistence, prune, or hydration authority** — not presentation for secondary roles alone.

### Issue A (symptom)

Owner creates Work 1.2 under Stage 1, sets markup/discount, refresh OK for owner; co-owner with full visibility sees work/resources but **markup/discount missing** on that later work — suggests a path that only partially preserves structure or pricing.

### Issue B (symptom)

Owner creates Stage 2 + works/resources; after refresh, **Stage 2 resources are gone** for **both** owner and co-owner; stage and works remain. Indicates persistence, prune, hydration, linkage, or snapshot authority — not only co-owner visibility.

**Context:** Bugs are **conditional** / intermittent; solution must scale beyond a single stage/work/line.

---

## 1. Repo reality

### Relevant files / layers


| Layer                      | Files                                                                                                                                                                                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store + sync orchestration | `src/data/estimate-v2-store.ts` — `hydrateEstimateV2ProjectFromWorkspace`, `queueProjectDraftSync`, `runProjectDraftSync`, `commitProjectStateChange`, `normalizeStateForWorkspace` / `normalizeSnapshotForWorkspace`, `getSnapshotFromState`, workspace `localStorage` cache |
| Remote draft I/O           | `src/data/estimate-source.ts` — `loadCurrentEstimateDraft`, `saveCurrentEstimateDraft`, `resolveEstimateDraftRemoteIds`, `loadEstimateOperationalSummary` + `get_estimate_operational_summary` RPC                                                                            |
| UI → access context        | `src/pages/project/ProjectEstimate.tsx` — `registerEstimateV2ProjectAccessContext` with `financeVisibility: currentMembership?.finance_visibility ?? null`                                                                                                                    |
| Hook                       | `src/hooks/use-estimate-v2-data.ts` — Supabase mode triggers `hydrateEstimateV2ProjectFromWorkspace`                                                                                                                                                                          |
| Downstream projection      | `src/data/planning-source.ts` (tasks), `procurement-source.ts`, `hr-source.ts` (from `runProjectDraftSync` when allowed)                                                                                                                                                      |
| Tests                      | `estimate-v2-store.workspace-draft.test.ts`, `estimate-source.test.ts`, other `estimate-v2-store*.test.ts`                                                                                                                                                                    |


### Current flow (save / load / hydrate)

1. **Load:** `useEstimateV2Project` → `hydrateEstimateV2ProjectFromWorkspace` loads `loadCurrentEstimateDraft`, workspace project, planning tasks, and optionally operational RPC when finance visibility is summary/none.
2. **Early exit:** If there was already in-memory state, **pending** draft sync (timer / deferred / projection in-flight / hero), and non-empty graph → refresh cache from current memory and **return without re-merging remote draft**.
3. **Empty remote + cache:** If remote draft has no structure but `localStorage` cache exists → restore cache and optionally `queueProjectDraftSync`.
4. **Merge:** Build `stages` from `draft.stages`. **Works/lines** from: (a) operational RPC shape, (b) task rebuild, or (c) table-backed `draft.works` / `draft.lines` with `markup_bps` / `discount_bps_override` from DB rows.
5. **Save:** Edits → `commitProjectStateChange` → `queueProjectDraftSync` (debounce) → `runProjectDraftSync` → `saveCurrentEstimateDraft` when `canAccessSensitiveEstimateRows` is true.

### Where authority is decided

- **Sensitive row access:** `canAccessSensitiveEstimateRows` — owner **or** `financeVisibility === "detail"`.
- **Operational vs table hydrate:** `shouldHydrateEstimateViaOperationalRpc` — non-detail (summary/none) uses RPC instead of the rich table-backed line path.
- **Prune + downstream projection:** `snapshotIsAuthoritative = canRunSensitiveEstimateProjection && (stages.length > 0 || works.length > 0 || lines.length > 0)`; `allowPrune: snapshotIsAuthoritative`. Incomplete / non-authoritative snapshots skip downstream projection (comment: avoid mass-unlink).

**Critical code fact:** “Authoritative” is true if **any** of stages, works, or lines is non-empty — **not** “snapshot is complete vs DB.” So **works with zero lines** still satisfy `snapshotIsAuthoritative` for pruning purposes.

### Where pruning / deletion happens

- In `saveCurrentEstimateDraft` after upserts, when `allowPrune !== false`, with guards for empty snapshot vs existing DB structure. Deletes stale dependencies, **lines**, works (current version), stages (project).

### Markup / discount: persist and rehydrate

- **Persist:** `saveCurrentEstimateDraft` maps `markup_bps` / `discount_bps_override` from snapshot lines (with `computeLineTotals` for client fields).
- **Table-backed rehydrate:** reads `line.markup_bps` / `line.discount_bps_override` with fallback to cache / project default.
- **Operational hydrate path:** constructs lines with `markupBps: 0`, `discountBpsOverride: null` unless **cached** line by id restores fields — RPC-shaped path does not carry per-line bps.

### Identity resolution

- **Client/workspace:** `ensureWorkspaceUuid` in `normalizeSnapshotForWorkspace`.
- **Save:** `resolveEstimateDraftRemoteIds` — direct id, then natural key (ambiguous match throws), else deterministic id.

### Subagent assistance (readonly)

- **repo-auditor:** Mapped end-to-end files, `snapshotIsAuthoritative` / `allowPrune`, pending sync, identity helpers, test pointers.
- **sensitive-zone-reviewer:** Ranked risks: co-owner vs sensitive projection, operational hydrate defaults, prune after upserts when `allowPrune === false`, hydration skip when pending sync, etc.

---

## 2. Confirmed vs unknown

### Confirmed (from app code + mirror)

- Non-detail users can hit operational RPC hydrate that **zeros** markup/discount unless **per-line local cache** fills them.
- `snapshotIsAuthoritative` is true if **any** of stages/works/lines is non-empty — **works with zero lines still authorize prune**.
- Prune deletes all DB lines not in the snapshot’s keep set.
- Co-owner needs `financeVisibility === "detail"` for sensitive save path; otherwise `saveCurrentEstimateDraft` is not called from `runProjectDraftSync` for that client.
- `get_estimate_operational_summary` applies **the same `offset`/`limit` separately** to the inner **works** query and **resource_lines** query (independent windows) — see **Backend contract review** below.
- RPC `**resource_lines` JSON does not include `markup_bps` or `discount_bps_override`**; table `estimate_resource_lines` **does** include those columns (mirror).

### Unknown (needs runtime / DB evidence)

- Actual `finance_visibility` for affected co-owners in repros.
- Post-refresh row counts in `estimate_resource_lines` vs `estimate_works` for failing projects.
- Correlation with multi-tab, fast navigation, or console errors from `runProjectDraftSync`.
- Whether deployed DB matches `backend-truth` mirror revision.

### Likely but not proven

- **Issue A:** summary/none (or null visibility) → operational hydrate → missing markup/discount on lines not present in local cache; “later work” more visible if cache only had older lines.
- **Issue B:** **prune** with snapshot that had **works but omitted lines** (or subset), or race / partial memory + `allowPrune: true`.

---

## 3. Issue-by-issue diagnosis

### Issue A — ranked candidates

1. Hydrate path split (operational vs table) + cache fallback for pricing fields.
2. `finance_visibility` not `"detail"` for co-owner → operational path.
3. Role / access context edge cases (secondary).
4. RPC pagination trimming tail lines (if operational path + large graph) — less specific if “lines visible but pricing wrong.”

### Issue B — ranked candidates

**Why owner loss raises priority:** Not explainable by co-owner RLS alone; suggests **DB row loss**, **never-saved lines**, or **owner session using a non-table path** that drops lines.

1. **Destructive prune from incomplete “authoritative” snapshot** (works > 0, lines === 0 still authoritative for prune).
2. Partial / stale in-memory graph at sync time (hydration early return, cache, race).
3. Save failure / ordering (needs trace).
4. Identity remapping + prune “stale” ids (needs DB forensics).
5. Operational path + independent pagination (if owner incorrectly on that path).

---

## 4. First divergence boundaries to prove

1. Pre-save in-memory graph (counts, ids, parent links, pricing).
2. Outgoing snapshot to `saveCurrentEstimateDraft`.
3. Prune inputs: `allowPrune`, `staleLineIds`, etc.
4. Post-save DB shape (current version).
5. Raw `loadCurrentEstimateDraft` result next load.
6. Post-hydrate merged graph (which branch: operational / table / cache).

---

## 5. Instrumentation plan (forensic; not implemented here)

- Log at `runProjectDraftSync` (before save): projection flags, `worksButNoLines`, counts, revision, abort reasons.
- Log at `saveCurrentEstimateDraft`: `allowPrune`, structure flags, `staleLineIds` (bounded).
- Log at hydrate: branch + remote/operational counts + visibility/role flags.
- Correlate with trace ids in dev only; avoid PII in titles if required.

---

## 6. Smallest safe fix options (conceptual)

1. **Narrow:** Tighten prune / `snapshotIsAuthoritative` so incomplete line sets cannot delete existing DB lines (exact rule TBD after forensics).
2. **Balanced:** Authority + hydrate fixes; optional **RPC extension** in `rovno-db` if summary path must carry per-line bps without table read — see §8.
3. **Broader:** Revision-gated prune, transactional delete ordering, narrower hydration early-return — higher UX/regression surface.

---

## 7. Recommended plan (minimal, sustainable)

1. Run instrumentation (§5) to locate first divergence for Issues A and B.
2. If Issue B implicates prune: gate **line** prune on provable completeness (at minimum: do not prune lines when snapshot has works but zero lines while DB had lines — unless explicit product “delete all resources”).
3. Issue A: confirm visibility; if operational path is involved, choose **app merge** vs **RPC change** per §8.
4. Add multi-entity regression tests (store + `estimate-source`).
5. Independent verification on **staging** with two profiles.

---

## 8. Acceptance criteria (checklist)

- Multiple stages / works / lines survive save + refresh.
- Markup/discount round-trip for **all** lines.
- No unexplained owner vs detail co-owner drift.
- No destructive prune from incomplete snapshot.
- Failures localizable via logs to pre-save / save / prune / load / hydrate.
- Automated multi-entity round-trip + prune-edge coverage.

---

## 9. Verification plan

- Manual matrix: multi-stage graph, two browsers/profiles, detail vs summary, multi-tab, refresh during pending sync.
- Tests: extend `estimate-v2-store.workspace-draft.test.ts`, `estimate-source.test.ts`.
- Commands: project `npm test` / `npm run build` as applicable.
- Trust: staging DB counts + logs showing clean prune path.

---

## 10. Rollback notes

- Revert app commit(s) for store/source/tests; no DB migration if changes are app-only.
- If `rovno-db` RPC changes ship, follow team migration rollback / forward-fix process.

---

## 11. Backend contract review (`backend-truth` mirror)

**Inspector:** `backend-contract-truth-inspector` (readonly), 2026-04-08. **Sources:** `backend-truth/schema/rpc-functions.json`, `backend-truth/sql/20260406200000_track1_estimate_operational_summary_finance_visibility.sql`, `backend-truth/generated/supabase-types.ts`, `backend-truth/schema/tables.json`, `backend-truth/contracts/estimates-contract.md`, `backend-truth/schema/rls-summary.json`.

### Confirmed from mirror

- `**get_estimate_operational_summary`:** args include `p_limit` (clamped 1–1000), `p_offset` ≥ 0; returns JSON with `works`, `resource_lines`, `upper_block`.
- `**works` JSON objects:** work metadata only — **no** markup/discount fields on works in the RPC payload.
- `**resource_lines` JSON objects:** include client price fields when finance is `summary` or `detail`; **no `markup_bps` or `discount_bps_override` in the RPC payload** (table columns exist; RPC `jsonb_build_object` omits them).
- `**upper_block`:** includes aggregate / timing fields; stage discount in RPC is **aggregated** (`max(project_stages.discount_bps)`), not per-line override semantics.
- **Pagination:** **same `offset` / `limit` applied independently** to the subquery for **works** and again for **resource_lines** (each has its own `ORDER BY … OFFSET … LIMIT`). Works page *N* and lines page *N* are **not** guaranteed to be the same logical slice of the graph.
- **Tables:** `estimate_resource_lines` includes `**markup_bps`** and `**discount_bps_override`** (per migration trace in mirror, e.g. `20260408120000_estimate_line_pricing_params.sql` in `tables.json`).
- **RLS (mirror):** sensitive reads on estimate tables tied to `can_view_sensitive_detail` where documented — relevant when choosing table vs RPC read paths.

### Not proven by mirror alone

- Deployed staging/prod DB revision vs this snapshot.
- Full matrix of `effective_finance_visibility` per role (partially in SQL comments only).

### Contract mismatch (app vs backend)

- If the app expects **per-line `markup_bps` / `discount_bps_override` from `get_estimate_operational_summary` only**, that is **not supported** by the current RPC shape — table read or RPC extension is required.

### Is `**rovno-db` migration / RPC change** required?


| Goal                                                                                                                                                  | `rovno-db` needed?                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Fix prune/hydrate/merge/authority **using existing table reads** for users who already pass RLS for `estimate_resource_lines`                         | **No** (app + tests in `rovno`).                                                                              |
| Keep **canonical read path** as `**get_estimate_operational_summary` only** and still show per-line markup/discount for summary/none/detail consumers | **Yes** — extend RPC (and grants if needed), then mirror sync per team workflow.                              |
| Fix **inconsistent pagination** between `works` and `resource_lines` in one RPC response                                                              | **Yes** — change RPC semantics in `rovno-db` (e.g. single cursor, or fetch-all within cap), then mirror sync. |
| “Resources disappeared” root-caused as **pure app prune**                                                                                             | **No DB change** for that root cause; verify with forensics first.                                            |


**Summary:** The mirror does **not** mandate a DB change for persistence of markup/discount — columns exist. A `**rovno-db`** change is **optional** and **product-dependent**: only if the operational RPC must become the **sole** source of truth for those fields or if pagination semantics must be fixed at the source.

---

## 12. References (code pointers)

Key symbols for implementers:

- `canAccessSensitiveEstimateRows`, `shouldHydrateEstimateViaOperationalRpc`, `hydrateEstimateV2ProjectFromWorkspace` — `src/data/estimate-v2-store.ts`
- `snapshotIsAuthoritative`, `runProjectDraftSync`, `hasPendingProjectDraftSync` — `src/data/estimate-v2-store.ts`
- `saveCurrentEstimateDraft`, `resolveEstimateDraftRemoteIds`, `loadCurrentEstimateDraft` — `src/data/estimate-source.ts`
- RPC SQL — `backend-truth/sql/20260406200000_track1_estimate_operational_summary_finance_visibility.sql`

---

*End of audit document.*