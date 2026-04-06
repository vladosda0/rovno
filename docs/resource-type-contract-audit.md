# Resource-type system: discovery contract audit

**Status:** Discovery only (no implementation).  
**Repos:** `rovno` (app), `rovno-db` (migrations/SQL/RPCs), `backend-truth` (generated mirror).  
**Date:** 2026-04-05

**Target product semantics (intent):**

- Material, Tool, HR, Subcontractor, Overheads, Other  
- **HR == labor**, **Tool == equipment**  
- Estimate is canonical source of truth for line type; downstream domains expose allowed subsets only.  
- No silent coercion into business types; “unknown” is broken-contract / incomplete payload only.

---

## A. Executive summary

### Canonical problem (repo-grounded)

Persisted truth for line kind lives only on `**public.estimate_resource_lines.resource_type`** (`material`  `labor`  `subcontractor`  `equipment`  `other`). The app layers a second vocabulary (`ResourceLineType` with `tool` instead of `equipment`) and several independent mappers (draft save, hero transition, operational hydration, checklist projection, procurement shaping, HR shaping, rollups). Those mappers **disagree** (notably hero transition vs draft save for **subcontractor**), and several paths coerce, default, or repair type instead of treating bad/missing data as an explicit broken-contract state.

`**procurement_items` and `hr_items` have no persisted type discriminator** in `backend-truth`; downstream domains must join or project from estimate lines, but the app sometimes invents type locally.

### Overheads safe now?

**Defer as a new canonical persisted value for launch.** Today Overheads is **not** a DB value; it is UI/product usage of `**other`** plus a title-based label override in `ProjectEstimate.tsx`. Making Overheads a **real** canonical type would require `estimate_resource_lines` check constraint + migration, and every mapper, filter set, tests, and logic that assumes five DB values. That is bounded but non-trivial and not required to fix the current fragmentation.

### Recommended launch-safe canonical storage strategy

**Keep DB persisted values as they are** (already aligned with locked equivalences: `labor` = HR, `equipment` = Tool). **Do not** rename DB enums to product labels pre-launch. **Centralize** all `equipment`↔`tool` and DB→UI mapping in **one** module; **remove cache-based disambiguation** and **replace silent defaults** with explicit “incomplete payload / cannot project” handling where joins are missing. **Fix persistence bugs** (hero transition vs `mapLineTypeToRemote`) so estimate remains the single write authority for canonical type.

**Overheads:** treat as `**other` + display rules** until post-launch, or add a non-persisted display facet if separation is needed without DB churn.

### Top 5 highest-risk drift points

1. `**resourceTypeForEstimateLine`** in `src/data/estimate-v2-hero-transition.ts` — persists subcontractor as `labor`, diverging from `**mapLineTypeToRemote`** in `src/data/estimate-source.ts`.
2. `**inferLineTypeFromRemote`** in `src/data/estimate-v2-store.ts` — cache-based labor/subcontractor recovery; violates “no guessing.”
3. `**mapTaskChecklistItemRowToChecklistItem` / `mapEstimateResourceTypeToChecklistType`** in `src/data/planning-source.ts` — drops `subcontractor` from `estimateV2ResourceType`; collapses several DB types to `subtask`.
4. `**procurementItemTypeFromEstimateResourceType` + `baseOperationalProcurementItemV2`** in `src/data/procurement-source.ts` — null/empty → `material`; non-material/tool estimate types → `other`.
5. `**ProjectProcurement.tsx` estimate-derived rows** — `line.type === "tool" ? "tool" : "material"` forces non–material/tool lines to display as material when merging from estimate state.

---

## B. Complete file inventory (by layer)

### B.1 Canonical type definition & shared entities


| File                       | Why it matters                                                                     | Role today                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/types/estimate-v2.ts` | Defines `ResourceLineType`                                                         | UI/working canonical for estimate v2 lines; `tool` is alias for DB `equipment`. |
| `src/types/entities.ts`    | `ProcurementItemType`, `ChecklistItemType`, `ChecklistItem.estimateV2ResourceType` | Narrower domain enums; checklist optional mirror of line type.                  |
| `src/types/hr.ts`          | `HRItemType`                                                                       | Only `labor`                                                                    |


### B.2 Backend contract mirror (read-only)


| File                                                                                        | Why it matters                                              | Role today                                                             |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| `backend-truth/generated/supabase-types.ts`                                                 | `estimate_resource_lines.Row.resource_type`, RPC signatures | Authoritative TS mirror of DB enum.                                    |
| `backend-truth/generated/db-public-schema.ts`, `backend-truth/schema/enums-and-checks.json` | Constraint `estimate_resource_lines_resource_type_check`    | Documents allowed DB strings.                                          |
| `backend-truth/schema/tables.json`                                                          | Column listing                                              | Confirms `procurement_items` / `hr_items` lack a resource-type column. |


### B.3 `rovno-db` SQL (migrations — semantic history)


| File                                                                                                                                               | Role                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260306162500_estimates_core.sql`                                                                                            | Original `estimate_resource_lines.resource_type`: `material`, `labor`, `equipment`, `other` (no `subcontractor`).          |
| `supabase/migrations/20260403191500_phase6_operational_summary_subcontractor_and_client_amounts.sql`                                               | Current check includes `subcontractor`; defines `get_procurement_operational_summary`, `get_estimate_operational_summary`. |
| `supabase/migrations/20260403103000_phase6_operational_summary_read_rpcs.sql`                                                                      | Earlier operational RPCs; superseded/extended by phase 6 follow-up.                                                        |
| `supabase/migrations/20260330160000_wave2_hr_lineage_and_projection_uniqueness.sql`                                                                | HR ↔ estimate line lineage; backfill used `resource_type in ('labor','other')` only.                                       |
| `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql`                                                                | FKs: `procurement_items.estimate_resource_line_id`, `task_checklist_items.estimate_resource_line_id`.                      |
| `supabase/migrations/20260306170000_grants_rls_enablement_and_policies.sql`, `20260325100000_sensitive_visibility_and_document_classification.sql` | RLS on `estimate_resource_lines`.                                                                                          |
| `imported-drafts/20260306153000_project_first_schema.sql`                                                                                          | Draft history; older `estimate_resource_type` enum — not current core table.                                               |


### B.4 Estimate: authoring, save, hydration, sync


| File                                               | Role                                                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/estimate-source.ts`                      | `mapLineTypeToRemote`, draft upsert `resource_type`, `parseEstimateOperationalResourceLine`, draft ID resolution (labor/subcontractor compatibility).                        |
| `src/data/estimate-v2-store.ts`                    | `inferLineTypeFromRemote`, `RESOURCE_TYPE_ORDER`, `checklistTypeForLineType`, `mapChecklistTypeToEstimateLineType`, task sync `nextType`, `syncExternalDomainsFromEstimate`. |
| `src/data/estimate-v2-hero-transition.ts`          | `resourceTypeForEstimateLine` → `upsertEstimateResourceLines`.                                                                                                               |
| `src/pages/project/ProjectEstimate.tsx`            | Options, `labelForType`, checklist fallbacks, Overheads = `other` + title heuristic, analytics, CSV `labelForType`.                                                          |
| `src/lib/estimate-v2/pricing.ts`                   | `breakdownByType`, `computeLineTotals`.                                                                                                                                      |
| `src/lib/estimate-v2/resource-units.ts`            | `RESOURCE_UNITS_BY_TYPE`.                                                                                                                                                    |
| `src/lib/estimate-v2/delete-safeguards.ts`         | Delete impact using line/procurement/HR types.                                                                                                                               |
| `src/components/estimate-v2/ResourceTypeBadge.tsx` | Badge display.                                                                                                                                                               |
| `src/components/estimate-v2/VersionDiffList.tsx`   | `TYPE_LABEL`.                                                                                                                                                                |
| `src/pages/share/ShareEstimate.tsx`                | Share view via `computeProjectTotals` on snapshot lines.                                                                                                                     |


### B.5 Hero / tasks / checklist


| File                                       | Role                                                                                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/data/planning-source.ts`              | Loads `estimate_resource_lines.resource_type`; `mapEstimateResourceTypeToChecklistType`, `mapTaskChecklistItemRowToChecklistItem`; `syncProjectTasksFromEstimate`. |
| `src/components/tasks/TaskDetailModal.tsx` | `getChecklistResourceType`, `getChecklistResourceLabel`.                                                                                                           |


### B.6 Procurement


| File                                                  | Role                                                                                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/data/procurement-source.ts`                      | `PROCUREMENT_RESOURCE_TYPES`, `procurementItemTypeFromEstimateResourceType`, operational shaping, ERL type fetch, `syncProjectProcurementFromEstimate`. |
| `src/data/procurement-operational-summary-payload.ts` | Parse RPC JSON; `estimate_resource_line_resource_type`.                                                                                                 |
| `src/pages/project/ProjectProcurement.tsx`            | Estimate-derived `type` (tool vs material only); edit form `?? "material"`.                                                                             |
| `src/components/procurement/ItemTypePicker.tsx`       | `ProcurementItemType` editor.                                                                                                                           |
| `src/data/procurement-store.ts`                       | Demo/local seeds; legacy `ei.type` filter.                                                                                                              |
| `src/data/orders-source.ts`                           | `get_procurement_operational_summary` when finance access is summary.                                                                                   |


### B.7 HR


| File                              | Role                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/data/hr-source.ts`           | `shapeHRItemsWithAssignees` (`type: "labor"` hardcoded), `syncProjectHRFromEstimate`, `upsertHeroHRItems`. |
| `src/data/hr-store.ts`            | `HR_TYPES`, `applyEstimateLine` → `HRItemType`.                                                            |
| `src/pages/project/ProjectHR.tsx` | Patches display `type` from `linkedLine?.type === "subcontractor"`.                                        |
| `src/hooks/use-hr-source.ts`      | Query wiring (revision keys).                                                                              |


### B.8 Pending payments / plan–fact metrics


| File                                        | Role                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| `src/lib/estimate-v2/rollups.ts`            | `procurementTypeToResourceType`, spend buckets, `toBePaidPlannedCents`. |
| `src/pages/project/ProjectEstimate.tsx`     | `combinedPlanFact.fact.toBePaidPlannedCents`.                           |
| `src/hooks/use-estimate-v2-data.ts`         | Wires `computeFactFromDataSources`.                                     |
| `src/lib/estimate-v2/finance-read-model.ts` | Finance snapshot composition.                                           |


### B.9 Permissions / finance seams


| File                     | Role                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| `src/lib/permissions.ts` | `FinanceRowLoadAccess` — `operational_summary` vs `full` drives RPC/table paths. |


### B.10 Tests (semantics encoded)

- `src/data/procurement-operational-summary-payload.test.ts`
- `src/data/procurement-source.test.ts`
- `src/data/estimate-v2-store.workspace-draft.test.ts`
- `src/data/estimate-v2-hero-transition.test.ts`
- `src/lib/estimate-v2/pricing.test.ts`, `resource-units.test.ts`, `rollups.test.ts`
- `src/data/hr-source.test.ts`, `src/data/hr-store.test.ts`, `src/hooks/use-hr-source.test.tsx`, `src/hooks/use-procurement-source.test.tsx`

### B.11 Demo / mock drift surfaces


| File                            | Risk                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------ |
| `src/data/procurement-store.ts` | Mostly `material` — hides tool/other in demo.                                  |
| `src/data/hr-store.ts`          | Uses estimate line types — diverges from Supabase `shapeHRItemsWithAssignees`. |
| `src/hooks/use-mock-data.ts`    | Inherits demo divergence.                                                      |


---

## C. Backend / RPC contract map

### C.1 Tables & columns

- `**public.estimate_resource_lines.resource_type`** — constraint: `('material','labor','subcontractor','equipment','other')`. **Only persisted canonical line discriminator** in scope.
- `**public.procurement_items`** — `estimate_resource_line_id` only; **no `resource_type` column**.
- `**public.hr_items`** — `estimate_resource_line_id` only; **no labor/subcontractor column**.
- `**public.task_checklist_items`** — `estimate_resource_line_id`; **no type column**.

### C.2 RPCs / JSON payloads

- `**get_estimate_operational_summary`** — `resource_lines[].resource_type` from `estimate_resource_lines`. **Gate:** `can_access_project` AND `effective_finance_visibility in ('summary','detail')`; else empty `works` / `resource_lines`.
- `**get_procurement_operational_summary`** — `procurement_items[].estimate_resource_line_resource_type` via `LEFT JOIN estimate_resource_lines`. `**ordered_lines` does not include estimate line type.**

### C.3 Joins required for canonical type

- Procurement operational: `procurement_items` → `estimate_resource_lines`.
- HR: `hr_items.estimate_resource_line_id` → `estimate_resource_lines.resource_type` (no column on `hr_items`).
- Tasks/checklists: `task_checklist_items.estimate_resource_line_id` → `estimate_resource_lines.resource_type`.

### C.4 Omission / distortion risks

- Finance visibility `none`: operational RPCs return empty arrays.
- `LEFT JOIN estimate_resource_lines`: null `estimate_resource_line_resource_type` if line missing or invisible under RLS.
- Historical `wave2_hr_lineage` matched only `labor` + `other` lines for one backfill path.

---

## D. Drift / fallback / guessing matrix


| Location                                                              | Current behavior                                      | Defect type              | Severity   | Violation                   |
| --------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------ | ---------- | --------------------------- |
| `estimate-v2-hero-transition.ts` `resourceTypeForEstimateLine`        | `subcontractor` → persisted `labor`                   | Persistence drift        | Critical   | Breaks estimate as SoT      |
| `estimate-source.ts` vs hero mapper                                   | Two persist rules                                     | Persistence drift        | Critical   | Path-dependent DB truth     |
| `estimate-v2-store.ts` `inferLineTypeFromRemote`                      | Cache turns `labor` → UI `subcontractor`              | Hydration + guessing     | High       | Cache-based disambiguation  |
| `estimate-v2-store.ts` task sync `nextType`                           | Checklist can override line                           | Co-owner risk            | High       | Checklist vs canonical      |
| `planning-source.ts` checklist mapping                                | `subcontractor` omitted from `estimateV2ResourceType` | Projection loss          | High       |                             |
| `planning-source.ts` `mapEstimateResourceTypeToChecklistType`         | Many DB types → `subtask`                             | Projection loss          | Medium     |                             |
| `procurement-source.ts` `procurementItemTypeFromEstimateResourceType` | null/'' → `material`                                  | Broken-contract fallback | High       | Silent coercion             |
| `procurement-source.ts` operational base item                         | Defaults when unlinked                                | Broken-contract fallback | Medium     |                             |
| `ProjectProcurement.tsx` derived type                                 | non-tool → `material`                                 | Display lie              | High       |                             |
| `ProjectProcurement.tsx` edit form                                    | `?? "material"`                                       | Broken-contract fallback | Medium     |                             |
| `hr-source.ts` `shapeHRItemsWithAssignees`                            | `type: "labor"` always                                | Projection loss + lie    | High       |                             |
| `ProjectHR.tsx` linked line patch                                     | UI type from estimate store                           | Dual authority           | Medium     |                             |
| `rollups.ts` procurement mapping                                      | `other` / missing item                                | Aggregation              | Medium     | Depends on upstream honesty |
| `rollups.ts` HR payments                                              | Uses `hrItem.type`                                    | Hydration drift          | Medium     |                             |
| `estimate-source.ts` operational parse                                | invalid → `other`                                     | Repair                   | Low–Medium | Silent unless flagged       |
| `estimate-source.ts` draft matching                                   | labor/sub swap tolerated                              | Persistence repair       | Medium     | Masks inconsistency         |
| `ProjectEstimate.tsx` Overheads heuristic                             | title “overhead”                                      | Display-only             | Low        | Must not be persisted type  |
| `TaskDetailModal.tsx` default `other`                                 | Linked row without mirror                             | Broken-contract          | Medium     | May read as business Other  |


---

## E. Overheads feasibility assessment

**Verdict:** **Defer** new persisted canonical enum for launch.

**Blast radius if adding `overhead` (or similar) to DB now:**

- Migration: alter `estimate_resource_lines_resource_type_check`; regenerate `backend-truth` via pipeline.
- RPCs: likely pass-through; constraint must allow new value.
- App: `ResourceLineType`, units, pricing breakdown, rollups, badges, diff labels, filters (`PROCUREMENT_RESOURCE_TYPES`, `HR_TYPES`), projections, tests.
- Reporting: `other` is currently catch-all including intended Overheads — splitting requires migration/tagging.

**Safe interim:** persist only five DB values; product Overheads → `other`; centralize display labels; optional non-persisted metadata later.

**Follow-up:** add DB value + single mapper; update filters (procurement/HR exclude overhead); rollups bucket.

---

## F. Recommended launch-safe contract strategy

**Choice:** Keep backend persisted values as today and **centralize** all aliasing/projection in one shared mapping contract (app module + tests).

**Preserves:** DB stability, alignment with HR=labor and Tool=equipment, operational RPC shapes.

**Postpones:** DB enum rename to product vocabulary, persisted Overheads, broad refactors.

---

## G. Do-not-touch boundaries (implementation phase)

1. **Single legal mapping authority** — all DB ↔ `ResourceLineType` and broken/missing discriminator handling in one module; forbid new scattered string compares.
2. **Downstream projection-only** — procurement, HR, tasks, rollups must not own competing canonical enums for estimate lines.
3. **Not independent authorities** — `ChecklistItem.type`, `ProcurementItemV2.type`, hardcoded `HRPlannedItem.type` from shaping, title heuristics.
4. **Avoid** hand-editing `backend-truth/`; large reroutes of estimate store or full procurement rewrite pre-launch.
5. **Out of scope for first launch:** perfecting historical `wave2` backfill semantics; analytics payload churn unless required.

---

## H. Minimal implementation staging (outline only)

1. Contract centralization — one mapper + explicit cannot-project state.
2. Persistence alignment — hero transition ↔ `mapLineTypeToRemote`; remove `inferLineTypeFromRemote` guessing.
3. Payload consumers — `planning-source`, `procurement-source`, `ProjectProcurement`, `hr-source` / `ProjectHR`, `rollups`: projections only, no silent `material`.
4. `rovno-db` verification — RPC joins + RLS; adjust only if discriminator omitted under valid access.
5. Regression harness — matrix: each DB `resource_type` → estimate UI → checklist → procurement → HR → rollup bucket.

---

## References (key symbols)

- `mapLineTypeToRemote` — `src/data/estimate-source.ts`
- `resourceTypeForEstimateLine` — `src/data/estimate-v2-hero-transition.ts`
- `inferLineTypeFromRemote` — `src/data/estimate-v2-store.ts`
- `procurementItemTypeFromEstimateResourceType` — `src/data/procurement-source.ts`
- `shapeHRItemsWithAssignees` — `src/data/hr-source.ts`

---

*This document was produced as a discovery-only contract audit. Implementation should follow `AGENTS.md`, sensitive-zone rules, and the `rovno-db` → `backend-truth` sync workflow for any schema changes.*