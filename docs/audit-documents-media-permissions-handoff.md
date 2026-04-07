# Documents / media permissions audit — handoff for planning

**Scope:** Grounded audit of `rovno` and `rovno-db` for documents/media permissions, visibility classes, and access enforcement.  
**Repos (local paths):** `~/projects/rovno-db` (migrations, RLS, RPCs), `~/projects/rovno` (frontend, adapters, backend-truth mirror).  
**Contract reference:** `docs/permissions.contract.json` — used as product baseline; **implementation was verified in code/migrations, not assumed from the contract.**

**Date note:** Audit reflects migrations through `20260407190000_track4_upload_visibility_class.sql` and corresponding `rovno` backend-truth slice.

---

## 1. Contract baseline (`permissions.contract.json`)

- **Classification vocabulary:** `shared_project` | `internal` under `shared_rules.documents_media_classification` and `domains.documents_media.classification_model`.
- **Per-role domain access** (`domains.documents_media.per_role`): viewer `view`, contractor `contribute`, co_owner / owner `manage`.
- **Upload:** `upload_visibility_selection` allows both classes; `ui_requirements.visual_label_required`; `fallback_rules` require explicit handling when unclassified.
- **AI:** `domains.documents_media.ai.can_reveal_internal_content_without_user_access: false`; global `ai_enforcement` stresses AI as strict subset of user authority.

---

## 2. Backend truth (`rovno-db`)

### 2.1 Schema and classification

| Artifact | Detail |
|----------|--------|
| `documents.visibility_class`, `project_media.visibility_class` | `text`, check `in ('shared_project','internal')`, default `'shared_project'` — `20260325100000_sensitive_visibility_and_document_classification.sql` |
| Upload intents | `document_upload_intents`, `project_media_upload_intents` gain `visibility_class` — `20260407190000_track4_upload_visibility_class.sql` |

### 2.2 Customization: `internal_docs_visibility` (not `financial_visibility`)

- **`project_members.internal_docs_visibility`**, **`project_invites.internal_docs_visibility`:** `none` | `view` | `edit` — `20260324140000_project_launch_authority.sql`.
- **`effective_internal_docs_visibility(project_id)`** (definition in `20260325100000_sensitive_visibility_and_document_classification.sql`): owner → `'edit'`; co_owner with `none` or null on row → **`'view'`**; else coalesce stored value, default `'none'`.
- **`can_view_internal_documents(project_id)`** := `effective_internal_docs_visibility(...) in ('view','edit')`.

**Documents/media read path does not use `financial_visibility`.** That drives **`can_view_sensitive_detail`** (finance detail) for HR, procurement, estimate detail tables — orthogonal to doc/media.

### 2.3 Role-shaped defaults (DB + triggers)

- Column defaults: **`'none'`** on additive columns.
- **`handle_project_owner_membership`:** owner member row gets `internal_docs_visibility = 'edit'`; demoted owner → co_owner gets `internal_docs_visibility = 'view'` — `20260324140000_project_launch_authority.sql`.
- **`assert_project_participant_delegate_ok`:** cannot grant internal-docs above actor’s delegate cap.

Roles are not magic enums on every row: they come from **`project_role_for_profile`**, stored member fields, and **effective** functions — preset + per-member overrides.

### 2.4 RLS: shared vs internal (SELECT)

`20260325100000_sensitive_visibility_and_document_classification.sql` — **`documents`**, **`document_versions`**, **`project_media`** readable iff:

1. `can_access_project(...)` **and**
2. `visibility_class = 'shared_project'` **or** `can_view_internal_documents(...)`.

### 2.5 RLS: UPDATE / DELETE (write boundary)

`20260326213000_internal_visibility_write_boundary.sql` — same **`(shared OR can_view_internal_documents)`** on top of **`can_write_project_content`** for:

- `documents` update/delete  
- `project_media` update/delete  
- `document_versions` update/delete (via parent `documents`)

### 2.6 Triggers: classification changes

`20260325120000_doc_media_visibility_write_enforcement.sql`:

- **INSERT** with `visibility_class = 'internal'` requires **`can_view_internal_documents`**.
- **UPDATE OF `visibility_class`:** any change requires **`can_view_internal_documents`**.

**Gap vs fine-grained contract language:** DB does **not** separate internal **`view` vs `edit`** for mutating internal content or changing classification; both satisfy `can_view_internal_documents`. There is **no** separate DB tier for “manage” vs “contribute” on documents — only **`can_write_project_content`** (owner, co_owner, contractor).

### 2.7 Upload / finalize RPCs

`20260407190000_track4_upload_visibility_class.sql`:

- **`prepare_document_upload` / `prepare_project_media_upload`:** `can_write_project_content`; validate `p_visibility_class`; if **`internal`**, require **`can_view_internal_documents`**; store on intent.
- **`finalize_*`:** uploader identity + `can_write_project_content`; create rows with **`v_intent.visibility_class`**.

### 2.8 Storage

- **`storage.objects` SELECT** uses **`can_access_storage_object(id)`**, redefined in `20260325100000_*` so linked doc/media blobs respect the **same shared/internal rule** as table RLS.
- **Storage INSERT** policies (`20260323120000_*`, `20260323110000_*`): **`can_write_project_content`** + path shape only — **no `visibility_class` at insert**; classification flows **prepare → upload → finalize**.

### 2.9 Enforcement gap (document_versions INSERT)

**`document_versions_insert`** in `20260306170000_grants_rls_enablement_and_policies.sql` still only checks:

- `created_by = auth.uid()` and parent `documents` exists with **`can_write_project_content`**

— **no** `visibility_class` / **`can_view_internal_documents`** in `WITH CHECK`. Later migrations updated select/update/delete for versions, **not insert**.

**Risk:** A writer who cannot SELECT internal rows might still insert a version row if they know `document_id` (they still cannot SELECT that version under current policies). Treat as **integrity / abuse-surface**; fix with policy alignment.

### 2.10 Generator / mirrored truth in `rovno`

- `backend-truth/sql/` mirrors migrations above.
- `backend-truth/slices/documents-media.json`, `schema/tables.json`, `rpc-functions.json`, `enums-and-checks.json`, `generated/supabase-types.ts` include `visibility_class`, `internal_docs_visibility`, guards, RPCs with `p_visibility_class`.

---

## 3. Frontend / runtime (`rovno`)

### 3.1 Coarse role → documents / gallery (UI + routing)

- **`src/lib/permissions.ts` — `getProjectDomainAccessForRole`:** for `documents` and `gallery`, owner/co_owner → `manage`, contractor → `contribute`, viewer → `view` (aligns with contract headline).
- **`src/layouts/ProjectLayout.tsx`:** `projectDomainAllowsRoute` blocks routes when domain access is `hidden`.

**Role-only** — does not encode `internal_docs_visibility` or per-row `visibility_class`.

### 3.2 Internal docs: UI parity (non-authoritative)

- **`src/lib/internal-docs-visibility.ts`:** mirrors `effective_internal_docs_visibility` for **UI gating only**; comments state backend is authoritative.
- **`canViewInternalDocuments`** ↔ `can_view_internal_documents` (effective `view` | `edit`).
- **`ProjectDocuments.tsx`, `ProjectGallery.tsx`, `TaskDetailModal.tsx`:** internal upload option only if `canViewInternalDocuments(...)`; reset to `shared_project` when not allowed.

### 3.3 Data layer (Supabase)

- **`src/data/documents-media-source.ts`:** passes `visibilityClass` → `p_visibility_class` on prepare RPCs (default `shared_project`).

### 3.4 Participants / customization

- **`workspace-source.ts`, `ProjectParticipants.tsx`, `participant-role-policy.ts`:** `internal_docs_visibility` on invites/members; **`getDefaultInternalDocsVisibility`:** viewer → `none`, other roles → `view` (UI default; payload to API determines stored value).

### 3.5 Contract action resolver gap

- **`src/lib/permission-contract-actions.ts`:** only `estimate` | `tasks` | `procurement` — **no `documents_media` domain**. Documents/gallery actions are **not** contract-resolver driven.

### 3.6 Documents vs gallery consistency

Same internal-doc helper, same upload visibility pattern, same **`VisibilityClassBadge`**, same domain matrix for `documents` vs `gallery` — **no divergence** in audited paths.

### 3.7 AI vs documents/media visibility

- **`src/lib/permissions-contract-surfaces.ts`:** states Track 4 UI is **not** full AI/tool hardening.
- **`src/lib/ai-engine.ts`:** demo proposals; **no** `visibility_class`.
- **`src/lib/commit-proposal.ts`:** `generate_document` uses local `addDocument` **without** `visibility_class`; gated by `seamAllowsAction(..., "ai.generate")` + credits — **not** internal-docs or documents domain access.

**Contract AI rule for internal content is not implemented as a dedicated enforcement layer** in audited app code beyond general patterns and comments.

### 3.8 Enforcement summary table

| Concern | Backend | Frontend |
|--------|---------|------------|
| See shared vs internal rows | RLS + `can_view_internal_documents` | Queries return only allowed rows; badges on shown rows |
| Upload as internal | RPC + triggers | Hides internal option if `!canViewInternalDocuments` |
| Read storage blobs | `can_access_storage_object` | Client obeys policies |
| Tab/route access | Membership | Role-only `projectDomainAllowsRoute` |
| “Manage” vs “contribute” | Single write tier: `can_write_project_content` | Role-only UI distinction |

---

## 4. Contract ↔ implementation matrix

| Contract intent | Status | Notes |
|-----------------|--------|--------|
| Binary `shared_project` / `internal` | **Yes** | Columns, intents, RPCs, checks |
| Per-role view / contribute / manage (surfaces) | **Partial** | UI/routes by role; DB = member vs `can_write_project_content`, not manage vs contribute |
| Upload visibility selection | **Yes** | RPC + UI |
| Visual label | **Yes** | `VisibilityClassBadge`; missing class → explicit fallback copy |
| Customization beyond presets | **Yes** | `internal_docs_visibility` + delegation |
| Tied to `financial_visibility` | **No** | Separate dimensions by design |
| AI must not reveal internal without access | **Not substantiated** | Demo AI; see `permissions-contract-surfaces.ts` |

---

## 5. Follow-up implementation-plan seeds

1. **Align `document_versions_insert` (and similar) WITH CHECK** with visibility / `can_view_internal_documents` parity.
2. **Product decision:** Should internal **`view` vs `edit`** gate classification changes or internal writes? Today both use `can_view_internal_documents`.
3. **Optional:** Add **`documents_media`** to `permission-contract-actions` for hidden/disabled/enabled upload and management actions.
4. **AI/tools:** Define server-backed retrieval under RLS + tests/prompt policy for internal content.
5. **Storage threat model:** Document direct PUT vs intent pipeline; whether INSERT policies should narrow further.

---

## 6. Key migration index (`rovno-db`)

| Migration | Topic |
|-----------|--------|
| `20260306165500_auth_bootstrap_and_domain_rpc.sql` | `can_access_project`, `can_write_project_content` (original `can_access_storage_object` pre–visibility) |
| `20260306170000_grants_rls_enablement_and_policies.sql` | Base RLS; `document_versions_insert` gap |
| `20260324140000_project_launch_authority.sql` | `internal_docs_visibility`, delegation, owner membership sync |
| `20260325100000_sensitive_visibility_and_document_classification.sql` | `visibility_class`, effective/can_view internal, RLS select, storage object check, finance detail split |
| `20260325120000_doc_media_visibility_write_enforcement.sql` | Guard triggers on `visibility_class` |
| `20260326213000_internal_visibility_write_boundary.sql` | Update/delete RLS parity |
| `20260407190000_track4_upload_visibility_class.sql` | Intents + prepare/finalize RPC `p_visibility_class` |

---

*Generated for handoff to downstream planning (e.g. ChatGPT implementation prompts). Source: repository audit; paths relative to `rovno` / `rovno-db` project roots.*
