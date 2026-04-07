# Documents / media permissions — next implementation wave

## Goal

Users with legitimate access see consistent documents/gallery behavior end-to-end, and the database blocks the one known integrity gap for version rows on classified documents, without a wholesale permissions redesign.

## Current behavior

(Grounded in [docs/audit-documents-media-permissions-handoff.md](docs/audit-documents-media-permissions-handoff.md).)

**Backend**

- `documents` / `project_media` carry `visibility_class` in `shared_project | internal`; upload intents and `prepare_*` / `finalize_*` RPCs validate and persist `p_visibility_class`; internal uploads require `can_view_internal_documents`.
- SELECT on `documents`, `document_versions`, `project_media` and storage object read access use: `can_access_project` and (`shared_project` OR `can_view_internal_documents`).
- UPDATE/DELETE on documents, media, and versions use the internal visibility write boundary migration’s rule: `can_write_project_content` plus the same shared-or-internal predicate.
- Triggers on classification: INSERT internal and UPDATE OF `visibility_class` require `can_view_internal_documents` — **not** a separate `view` vs `edit` tier.
- **`document_versions_insert`** (from base RLS migration) still only checks uploader identity and parent document + `can_write_project_content` — **no** shared/internal parity in `WITH CHECK`.
- There is **no** DB expression of manage vs contribute for docs/media beyond `can_write_project_content`; `internal_docs_visibility` values exist on members/invites but mutating internal content does **not** distinguish `view` from `edit` today.

**Frontend**

- Route/tab access for documents/gallery follows **role-only** `getProjectDomainAccessForRole` in [src/lib/permissions.ts](src/lib/permissions.ts) and layout gates.
- Internal visibility for UI uses [src/lib/internal-docs-visibility.ts](src/lib/internal-docs-visibility.ts) (non-authoritative mirror); upload flows hide internal class when `!canViewInternalDocuments`.
- [src/data/documents-media-source.ts](src/data/documents-media-source.ts) passes `p_visibility_class` on prepare RPCs; documents and gallery share badge/upload patterns per audit.
- [src/lib/permission-contract-actions.ts](src/lib/permission-contract-actions.ts) has **no** `documents_media` domain — only estimate / tasks / procurement.
- AI / commit paths called out in the audit ([src/lib/ai-engine.ts](src/lib/ai-engine.ts), [src/lib/commit-proposal.ts](src/lib/commit-proposal.ts)) do **not** implement dedicated internal-content enforcement beyond general patterns and documentation in [src/lib/permissions-contract-surfaces.ts](src/lib/permissions-contract-surfaces.ts).

## Desired behavior

**This wave only:** (1) Backend **insert** policy for `document_versions` matches the same shared/internal + write semantics as select/update/delete. (2) Frontend gains **contract-aligned action states** for documents/media (at least upload and other high-traffic mutations you map from [docs/permissions.contract.json](docs/permissions.contract.json) `domains.documents_media`), combining **role presets** with **effective internal-docs visibility** where the contract implies internal uploads — without inventing new columns or RPCs. (3) No change to the binary `shared_project | internal` model.

## Constraints

- Do not redesign the whole permissions system; stay within documents/media surfaces and their direct enforcement gaps.
- Do not invent backend structure from UI code; align UI with existing RPCs, RLS, and `backend-truth` mirror.
- Backend truth (migrations in `rovno-db`, consumed mirror) wins over frontend assumptions; **`backend-truth/` in `rovno` is read-only** — types flow via sync pipeline after `rovno-db` lands on `dev`.
- Keep changes **minimal and additive** (new migration replacing/superseding one policy; additive contract-action types and call sites).
- Preserve **`shared_project | internal`** classification vocabulary.
- Do not mix unrelated estimate / procurement / HR refactors into this wave.
- If AI hardening is included, it must be a **narrow, testable slice** (see Options); otherwise explicitly **out of scope**.

## Scope

**`rovno-db` (via schema-migration-implementer)**

- New forward migration (do not edit historical migration files) adjusting **`document_versions_insert`** so `WITH CHECK` requires the same logical access as **`document_versions_update`** / **`document_versions_delete`** in [backend-truth/sql/20260326213000_internal_visibility_write_boundary.sql](backend-truth/sql/20260326213000_internal_visibility_write_boundary.sql) (parent `documents.visibility_class`, `can_view_internal_documents`, `can_write_project_content`, `can_access_project` as appropriate — mirror the update policy’s subquery shape).
- Optional: add a short comment in migration or internal doc note on storage INSERT vs intent pipeline (audit seed #5) — **documentation only**, no policy broadening/narrowing unless product asks.

**`rovno` (via frontend-flow-implementer)**

- [docs/permissions.contract.json](docs/permissions.contract.json) — if you add explicit `actions` under `documents_media`, keep them minimal and consistent with existing `per_role.domain_access` (view / contribute / manage); otherwise derive a small fixed action set in code with a comment pointing at the contract section.
- [src/lib/permission-contract-actions.ts](src/lib/permission-contract-actions.ts) — extend `ContractDomain` / `ContractAction` and presets for `documents_media` (e.g. upload shared, upload internal optional class, rename/delete/classify — **only** what you actually wire).
- Call sites (audit-listed): [src/pages/project/ProjectDocuments.tsx](src/pages/project/ProjectDocuments.tsx), [src/pages/project/ProjectGallery.tsx](src/pages/project/ProjectGallery.tsx), [src/components/tasks/TaskDetailModal.tsx](src/components/tasks/TaskDetailModal.tsx), and any shared document actions component if present — replace **only** the noisiest ad-hoc role checks with `actionState` + existing `canViewInternalDocuments` / seam membership where internal upload is concerned.
- [src/lib/internal-docs-visibility.ts](src/lib/internal-docs-visibility.ts) — keep as UI mirror; ensure new resolver inputs use the same effective rules (no drift).
- Participants wiring: [src/data/workspace-source.ts](src/data/workspace-source.ts), [src/pages/project/ProjectParticipants.tsx](src/pages/project/ProjectParticipants.tsx), [src/lib/participant-role-policy.ts](src/lib/participant-role-policy.ts) — **touch only** if action-state wiring exposes an inconsistency with stored `internal_docs_visibility` (prefer read-only verification first).

**Explicitly out of this wave unless Option 2 / AI slice chosen**

- New DB functions for `can_edit_internal_documents`, wholesale trigger rewrites, storage INSERT policy changes, estimate/procurement/HR, full AI tool pipeline.

## Options

### Option 1 — Recommended minimal-safe wave

- **Fixes:** `document_versions_insert` RLS parity with other version policies; frontend `documents_media` contract actions + wiring so buttons/menus match **role** + **internal visibility** consistently with today’s backend semantics (`can_view_internal_documents` for internal writes).
- **Deferred:** Internal `view` vs `edit` separation on writes/classification; DB-level manage vs contribute; storage threat-model changes; substantive AI/docs-media hardening.
- **Why default:** Closes the only confirmed **integrity** hole with **no product semantic change** for members who currently have internal `view` (audit: co_owner effective `view` is common). Lowest blast radius.

### Option 2 — Stricter semantic wave (internal `view` vs `edit`)

- **Fixes:** Same as Option 1 **plus** new DB helper (e.g. `can_edit_internal_documents(project_id) := effective_internal_docs_visibility in ('edit')`) and policy/trigger alignment so **changing `visibility_class`, mutating/deleting internal rows, and inserting versions for internal parents** require **`edit`**, not merely `view`. Frontend mirrors with new helpers next to [src/lib/internal-docs-visibility.ts](src/lib/internal-docs-visibility.ts).
- **Deferred:** AI hardening; manage vs contribute at DB layer (still only `can_write_project_content` for “may write at all”).
- **Why not default:** **Behavior change** for `internal_docs_visibility = view` (including effective `view` for co_owners per audit) — needs explicit product sign-off and comms.

### Option 3 — Minimal backend-only wave

- **Fixes:** Only `document_versions_insert` migration.
- **Deferred:** All `permission-contract-actions` work; AI; view/edit split.
- **Why not default:** Leaves the audit’s **frontend gap** (role-only vs effective internal semantics, missing `documents_media` in contract resolver) unaddressed; acceptable as a hotfix milestone only.

## Recommended plan

1. **`rovno-db`:** Author migration that `DROP POLICY IF EXISTS document_versions_insert` and recreates `document_versions_insert` with `WITH CHECK` matching the internal visibility write boundary used for update/delete (verify against live policy text in `internal_visibility_write_boundary` migration, not from memory).
2. **Contract check:** Re-read [docs/permissions.contract.json](docs/permissions.contract.json) `domains.documents_media`; add or derive a minimal action list and document mapping: `view` → read-only UI; `contribute` → shared uploads + non-classification edits as today; `manage` → full controls where already implemented in UI.
3. **`rovno`:** Extend [src/lib/permission-contract-actions.ts](src/lib/permission-contract-actions.ts); add focused unit tests for preset matrices (mirror other domains’ tests).
4. **`rovno`:** Wire Project documents/gallery/task-detail upload and delete/rename/classify entry points to resolver outputs; keep internal upload gated by existing `canViewInternalDocuments` **unchanged** under Option 1.
5. **Mirror:** After `rovno-db` merges to `dev`, consume updated `backend-truth` via team sync; remove any temporary typing workarounds if present.
6. **Verification:** Backend policy check (see below); frontend tests + manual matrix; diff hygiene.

## Acceptance criteria

- [ ] **Internal/shared read:** Users without internal access do not receive internal rows from Supabase SELECT; storage reads remain aligned (no regression).
- [ ] **Internal upload:** Internal class still requires `can_view_internal_documents` at RPC; UI hides internal upload option when helper says no access; behavior matches Option 1 or 2 choice for view/edit.
- [ ] **document_versions insert parity:** Insert denied when parent is `internal` and caller lacks internal visibility, even if they have `can_write_project_content` and know `document_id` (policy test or documented SQL check).
- [ ] **Documents vs gallery:** Same action-state rules applied in both surfaces (and task media upload where applicable).
- [ ] **Frontend action-state:** Primary docs/media actions use `permission-contract-actions` (or a single thin wrapper) instead of scattered role-only checks for those actions.
- [ ] **Participants / internal_docs_visibility:** Invite/member payloads and effective rules remain coherent; no regression on owner/co_owner defaults from audit.
- [ ] **AI / docs-media:** **Explicitly out of scope for Option 1** (document in PR / [src/lib/permissions-contract-surfaces.ts](src/lib/permissions-contract-surfaces.ts) if needed). If you adopt Option 2b (narrow AI slice), add acceptance line: tool/document fetch paths never surface internal filenames or content without RLS-backed reads — **testable**.

## Verification

- **Backend:** `psql` or Supabase SQL: assert `INSERT` into `document_versions` for an `internal` parent fails for a session that has `can_write_project_content` but not `can_view_internal_documents`; succeeds when both hold; shared parent unchanged vs pre-migration behavior for typical writer.
- **Contract / mirror:** After sync, confirm `rpc-functions.json` / types unchanged except if any RPC signature drift (unlikely this wave); grep `backend-truth` for `document_versions_insert` policy mirror.
- **Frontend manual:** Matrix: owner / co_owner / contractor / viewer × internal none/view/edit × documents tab + gallery + task upload; confirm hidden/disabled/enabled matches resolver.
- **Tests:** New unit tests for `documents_media` presets; extend existing page tests ([ProjectDocuments.test.tsx](src/pages/project/ProjectDocuments.test.tsx), [ProjectGallery.test.tsx](src/pages/project/ProjectGallery.test.tsx)) only where action visibility changed.
- **Diff hygiene:** One migration commit in `rovno-db`; app contract/wiring commit(s) in `rovno`; no hand-edits under `backend-truth/`.

## Rollback notes

- **DB:** Revert by deploying a follow-up migration that restores the previous `document_versions_insert` definition (keep the old `CREATE POLICY` text in the rollback migration body or team runbook).
- **App:** Revert the `permission-contract-actions` + page wiring commit; internal upload behavior falls back to current helper-only gating.

## Best implementer

**Split sequence:** **`schema-migration-implementer`** in `rovno-db` first (policy migration + verification), then **`frontend-flow-implementer`** in `rovno` (contract actions + UI wiring + tests). Use **`independent-verifier`** after each repo’s slice per team orchestration rules.

## Recommended decision defaults

| Decision | Recommended default |
|----------|---------------------|
| Is `internal_docs_visibility = view` sufficient for changing `visibility_class`, internal update/delete, and inserting versions for internal documents? | **Option 1 (this wave): Yes** — keep parity with existing `can_view_internal_documents` everywhere those operations are already allowed, so **view and edit remain equivalent** for mutating internal content until a product-signed **Option 2** wave. |
| Include AI/docs-media hardening in this wave? | **Defer.** Optionally schedule a **separate** narrow slice (server-backed retrieval only, RLS-enforced, one integration test) — not bundled with RLS/UI parity. |
| Include deeper `contribute` vs `manage` distinction for docs/media? | **UI-only via contract presets** in this wave (disable/hide management affordances for contractors per contract); **do not** add a second DB write tier beyond `can_write_project_content` unless product mandates it later. |
