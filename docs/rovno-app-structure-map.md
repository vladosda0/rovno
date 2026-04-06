# Rovno App Structure Map

> **Purpose:** Read-only map of the current Rovno app (code-grounded) for later permission design by surface, field family, and action.  
> **Not covered here:** desired permissions, roles, or redesigns.  
> **Generated from:** `rovno` repo as of internal audit (branch `dev`, clean tree at time of writing).

---

## 1. Executive map

### Primary shells

- `**AppLayout`** (`src/layouts/AppLayout.tsx`): Fixed `TopBar`, optional **AI sidebar** (`AISidebar`, lazy-loaded), `Outlet` for `/home`, `/demo`, `/profile`, `/settings`, and nested `/project/:id/*`. Dev-only floating **Auth simulator** (`AuthSimulator`).
- `**ProjectLayout`** (`src/layouts/ProjectLayout.tsx`): Guest → login; loading skeleton; missing project → empty state; **domain route guard** via `projectDomainAllowsRoute` and `ROUTE_DOMAIN_BY_SEGMENT` (estimate, tasks, procurement, hr, gallery, documents, participants). Redirect `/project/:id` → `/project/:id/dashboard`.
- `**AuthLayout`**: Wraps `/auth/login`, `/auth/signup`, `/auth/forgot`.

### Major routes (`src/App.tsx`)


| Area             | Paths                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing / misc | `/`, `/onboarding`, `/pricing`, `/theme`                                                                                                                   |
| Share / invite   | `/share/estimate/:shareId`, `/invite/accept/:inviteToken`                                                                                                  |
| Auth             | `/auth/*`                                                                                                                                                  |
| App shell        | `/home`, `/demo`, `/profile`, `/profile/upgrade` → redirect to `/settings?tab=billing`, `/settings`                                                        |
| Project          | `/project/:id/dashboard`, `tasks`, `estimate`, `procurement` (+ `order/:orderId`, `:itemId`), `hr`, `gallery`, `documents`, `**activity`**, `participants` |


### Project top navigation (`src/components/ProjectTabs.tsx`)

- Tabs: **Dashboard**, **Tasks**, **Estimate**, **Procurement**, **HR**, **Gallery**, **Documents**, **Participants** — each filtered by `getProjectDomainAccess` + `projectDomainAllowsView`.
- **Not in tab bar:** `**activity`** (route exists; no tab link).

### Cross-domain seams (high level)


| Seam                             | Typical hooks / modules                                                  |
| -------------------------------- | ------------------------------------------------------------------------ |
| Workspace                        | `use-workspace-source`, `use-mock-data` facade                           |
| Planning (tasks/stages)          | `use-planning-source`, `getPlanningSource`                               |
| Estimate v2                      | `use-estimate-v2-data`, `estimate-v2-store`, `src/lib/estimate-v2/*`     |
| Procurement / orders / inventory | `use-procurement-source`, `use-order-data`, `use-inventory-data`, stores |
| HR                               | `use-hr-source`, `useProjectHRMutations`                                 |
| Documents / media                | `use-documents-media-source`                                             |
| Activity (data)                  | `use-activity-source`, `useProjectEvents`                                |
| Authority                        | `project-authority-seam`, `usePermission`, `permission-matrix`           |


---

## 2. Domain-by-domain structure

### Domain: Home


| Item             | Detail                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Route**        | `/home` · query `?tab=`                                                                                                               |
| **Primary file** | `src/pages/Home.tsx`                                                                                                                  |
| **Tabs**         | `overview`, `projects`, `tasks`, `documents`, `procurement`, `inventory`, `finance`, `resources` → `src/components/home/*.tsx` (lazy) |


#### Overview (`OverviewTab.tsx`)

- **Visible data:** Quick actions; `PendingInvitationsBlock`; “My Projects” (title, progress, status); “Upcoming Tasks”; overdue tasks; credits summary; recent activity via `useProjectsRecentEventsMap`.
- **Actions:** Navigate to other tabs (Create project, New task, Upload document, Billing); View all; links to `/project/:id/dashboard`.
- **Seams:** `useProjects`, `useCurrentUser`, `src/data/store` (`getAllTasks`, `getProject`), `useProjectsRecentEventsMap`.

#### Projects (`ProjectsTab.tsx`)

- **Visible data:** Search, sort (`activity` / `progress` / `name`), local folders, project cards.
- **Actions:** AI proposal (`generateProjectProposal`, `PreviewCard`, `ActionBar`, `commitProposal`); manual create dialog (title, type, project mode); query invalidation via planning/workspace keys.
- **Seams:** `useProjects`, `useWorkspaceMode`, `getPlanningSource`, `getWorkspaceSource`, `resolveWorkspaceMode`.

#### Tasks (`TasksTab.tsx`)

- **Visible data:** Cross-project tasks from `**store.getAllTasks()`** (local aggregate, not the same path as in-project Tasks page).
- **Actions:** Search; filters; toggle done (checklist + final-media rules vs local store).
- **Seams:** `src/data/store` directly.

#### Other home tabs

- **Documents, Procurement, Inventory, Finance, Resources** — `DocumentsTab.tsx`, `ProcurementTab.tsx`, `InventoryTab.tsx`, `FinanceTab.tsx`, `ResourcesTab.tsx`. (Line-level audit deferred; read files for field/action detail.)

---

### Domain: Dashboard (project)


| Item      | Detail                                   |
| --------- | ---------------------------------------- |
| **Route** | `/project/:id/dashboard`                 |
| **File**  | `src/pages/project/ProjectDashboard.tsx` |


#### Blocks

1. **Project header** — Title; `type` · `automation_level`; AI description; address + **Copy** (or “Add address”).
2. **Progress** — % from task counts; bar; tooltip (not started / in progress / blocked / done).
3. `**QuickActions`** (`src/components/dashboard/QuickActions.tsx`) — Task, Document, Photo, Receive order, Credits (owner/co-owner tooltip); each opens dialog/modal or `ReceiveOrderPickerModal`.
4. `**TaskSummaryWidget`** — Up to 8 tasks (status, title, assignee); link to tasks.
5. `**BudgetWidget**` — If `seamCanViewSensitiveDetail`; else CTA to estimate. Metrics: planned, spent, to be paid, % profitability; **Manage** → estimate.
6. `**DocsWidget`** — Up to 4 documents (pinned `project_creation` first).
7. `**GalleryWidget**` — Up to 4 photo placeholders + captions.
8. `**ParticipantsWidget**` — If participants domain visible: names, roles; **Manage** → participants.

#### Seams

`useProject`, `useTasks`, `useDocuments`, `useMedia`, `usePermission`, `useEstimateV2FinanceProjectSummaryFromWorkspace`, `getProjectDomainAccess`, `seamCanViewSensitiveDetail`.

---

### Domain: Tasks (project)


| Item               | Detail                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Route**          | `/project/:id/tasks`                                                                                             |
| **File**           | `src/pages/project/ProjectTasks.tsx`                                                                             |
| **Key components** | `TaskDetailModal`, `ConfirmModal`; `getPlanningSource`; `useMediaUploadMutations`; `useEstimateV2Project` (sync) |


#### Surfaces

- Stage tabs (`all` or stage id); “Assigned to me” filter.
- Kanban-style columns by status: `not_started`, `in_progress`, `done`, `blocked` (with drag-related state in code).

#### Modals / flows

- Task detail (select task; deep-link `location.state.openTaskId`).
- New stage (title, description, optional AI create).
- New task (title, description, status, assignee, stage, deadline).
- **Done:** checklist complete + final photo upload (Supabase path) + optional comment.
- **Blocked:** reason via comment + status update.
- Stage delete / complete confirmations.

#### Sync (Supabase)

- Banner when `estimateSync.domains.tasks` is syncing, behind revision, or error; can block status/done/blocked actions.

#### Permission gates

- From estimate **client regime** and `getProjectDomainAccess(..., "tasks")`: manage vs contribute drives create, status, checklist, comments, task media; `canAuthorTaskStructure` for non-Supabase authoring nuance.

---

### Domain: Estimate (project)


| Item           | Detail                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Route**      | `/project/:id/estimate`                                                                                                                                                                                      |
| **File**       | `src/pages/project/ProjectEstimate.tsx` (large)                                                                                                                                                              |
| **Components** | `AssigneeCell`, `InlineEditableNumber` / `InlineEditableText`, `ResourceTypeBadge`, `VersionBanner`, `VersionDiffList`, `EstimateGantt`, `ApprovalStampCard`, `ApprovalStampFormModal`, tables, collapsibles |


#### Subtabs


| Tab               | Behavior                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **estimate**      | Stages / works / lines (qty, unit, cost, markup, discount, assignee, resource type); project tax; estimate status controls when workspace visible; versioning / submit / approval / share flows; delete safeguards. |
| **work_schedule** | Disabled until `showEstimateWorkspace` (`estimateEditorStarted                                                                                                                                                      |
| **work_log**      | Same gating as work schedule.                                                                                                                                                                                       |


#### Finance / authority

- `getProjectDomainAccess`, `projectDomainAllowsManage`, `seamCanViewOperationalFinanceSummary`, `seamCanViewSensitiveDetail` control editable vs summary views.
- Invites: `createWorkspaceProjectInvite`, `sendWorkspaceProjectInviteEmail` (embedded in page flows).

#### Seams

`useEstimateV2Project`, `estimate-v2-store`, workspace hooks, `useHRItems` / `useProcurementV2` / `useTasks`, pricing/rollups, CTA helpers (`resolveProjectEstimateCtaState`, `resolveSubmitToClientState`).

---

### Domain: Procurement (project)


| Item           | Detail                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Routes**     | `/project/:id/procurement`, `.../procurement/order/:orderId`, `.../procurement/:itemId`                                        |
| **File**       | `src/pages/project/ProjectProcurement.tsx`                                                                                     |
| **Components** | `OrderModal`, `OrderDetailModal`, `ItemTypePicker`, `LocationPicker`, `ReceiveOrderPickerModal` (also from QuickActions), etc. |


#### Subtabs

- `**requested`**, `**ordered`**, `**in_stock**` — search, collapsible stages, KPI chips, rows with status/dates/costs (conditional on finance visibility).

#### Actions (representative)

- Edit/archive items; orders; receive; inventory consumption; task linkage; analytics events.
- **Sync banner** for `estimateSync.domains.procurement` in Supabase mode.

#### Seams

`useProject`, `useProcurementV2`, `useOrders`, `useInventoryStock`, `useLocations`, `useEstimateV2Project`, `usePermission`, procurement/order/inventory query keys.

---

### Domain: HR (project)


| Item      | Detail                            |
| --------- | --------------------------------- |
| **Route** | `/project/:id/hr`                 |
| **File**  | `src/pages/project/ProjectHR.tsx` |


#### Empty state

- If `estimateStatus === "planning"`: `ProjectWorkflowEmptyState` → open Estimate.

#### Main UI

- Filters: search, work status, payment status (if `seamCanViewSensitiveDetail`), assignee.
- Table columns: Title (`ResourceTypeBadge`), Assignees, Work status; if finance detail: Payment status, Planned, Paid, Remaining, **Add payment**.
- **Sync banner** for `estimateSync.domains.hr`.

#### Seams

`useProject`, `useEstimateV2Project`, `useHRItems`, `useHRPayments`, `useTasks`, `usePermission`, `can("hr.edit")`, `seamCanViewSensitiveDetail`, `useWorkspaceMode`.

---

### Domain: Documents (project)


| Item           | Detail                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------- |
| **Route**      | `/project/:id/documents`                                                                      |
| **File**       | `src/pages/project/ProjectDocuments.tsx`                                                      |
| **Components** | `DocumentGridCard`, `DocumentListItem`, `DocumentsViewModeToggle`, `PreviewCard`, `ActionBar` |


#### Visible data

- Counts: active vs archived; Supabase copy notes sharing “coming soon”.
- List/grid toggle; active + **Archived** sections.

#### Actions

- **Upload** (title, file; finalize retry).
- **Generate** (AI): shown when not Supabase and `canManageDocuments` (pattern in file).
- Row: **Preview**, **Archive** (confirm).
- Preview dialog: **Print**, **Download** (gated), **Share** (disabled), **Confirm acknowledgement** + **Comment** (non-Supabase + `canCommentOnDocuments`), **Delete** on archived when `canManageDocuments`.

#### Seams

`useProjectDocumentsState`, `useProjectDocumentMutations`, `useDocumentUploadMutations`, `useWorkspaceMode`, domain access for `documents` and `comments`, local `store` in non-Supabase paths.

---

### Domain: Gallery / Media (project)


| Item      | Detail                                 |
| --------- | -------------------------------------- |
| **Route** | `/project/:id/gallery`                 |
| **File**  | `src/pages/project/ProjectGallery.tsx` |


#### Visible data

- Header: photo count, final count; filters **All / In progress / Final photos**; grid (placeholder thumbs, caption, linked task, final star).

#### Actions

- **Upload** dialog: file, caption; optional **link to task** (non-Supabase); Supabase upload pipeline with retry finalize.
- `**PhotoViewer`** (`source="gallery"`) — full behavior in `src/components/PhotoViewer.tsx`.

#### Seams

`useMedia`, `useTasks`, `usePermission`, `useMediaUploadMutations`, `useWorkspaceMode`, local `addMedia` / `addEvent` in demo.

---

### Domain: Participants (includes Invitations + Permissions UI)


| Item      | Detail                                      |
| --------- | ------------------------------------------- |
| **Route** | `/project/:id/participants`                 |
| **File**  | `src/pages/project/ProjectParticipants.tsx` |


#### Subtabs


| Tab             | Content                                                                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Members**     | Table: Member, Role, AI Access, Credits; row overflow menu.                                                                                                                                      |
| **Invitations** | Create invite dialog; tables (pending + history) with email, inviter, role, status, actions.                                                                                                     |
| **Permissions** | Permission matrix; **Edit** → dialog (role, AI access, finance visibility, internal docs visibility, viewer regime, credit limit) via `participant-role-policy` helpers and workspace mutations. |


#### Seams

`useCurrentUser`, `useProject`, `useProjectInvites`, `useWorkspaceMode`, `usePermission`, `workspace-source` APIs, `workspaceQueryKeys`.

---

### Domain: Invites (acceptance)


| Item      | Detail                              |
| --------- | ----------------------------------- |
| **Route** | `/invite/accept/:inviteToken`       |
| **File**  | `src/pages/invite/InviteAccept.tsx` |


#### Surfaces

- Loading; unauthenticated: Sign in / Create account with `next` URL; accepting; success redirect to project dashboard; failure messaging.

#### Seams

`useRuntimeAuth`, `acceptProjectInvite` (`src/lib/accept-project-invite`).

---

### Domain: Permissions (as a product surface)

- **No standalone `/permissions` route.**
- **UI:** **Participants → Permissions** tab (`ProjectParticipants.tsx`).
- **Types:** `ProjectDomain` in `src/lib/permissions.ts` includes `permissions` (and `invites`) but `ProjectLayout`’s `ROUTE_DOMAIN_BY_SEGMENT` does **not** list `permissions` — route guard is by segment for a subset of domains only.
- **Runtime:** `usePermission`, `getProjectDomainAccess`, `seamAllowsAction`, finance visibility helpers, demo overlay on seam.

---

### Domain: Activity (project)


| Item      | Detail                                                                       |
| --------- | ---------------------------------------------------------------------------- |
| **Route** | `/project/:id/activity`                                                      |
| **File**  | `src/pages/project/ProjectActivity.tsx`                                      |
| **Nav**   | **Not** linked from `ProjectTabs` (direct URL only unless linked elsewhere). |


#### Visible data

- Feed from `useEvents(projectId)`: actor, event type (humanized), payload snippet, date.

#### Actions

- None (read-only list).

#### Seams

`useEvents` → `useProjectEvents` / activity source.

---

### Domain: AI-related surfaces


| Surface            | Location                                    | Notes                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AISidebar**      | `src/components/AISidebar.tsx`              | Chat, attachments, feed filters (`all`, task, estimate, document, photo, member, `ai_actions`, `learn`), proposals, `commitProposal`, work log, photo consult, automation mode, resizable width. **Hidden** on `/settings`. |
| **QuickActions**   | `src/components/dashboard/QuickActions.tsx` | Create task/document/photo; receive order; credits → billing redirect.                                                                                                                                                      |
| **Home Projects**  | `ProjectsTab.tsx`                           | AI project draft + commit.                                                                                                                                                                                                  |
| **Documents**      | `ProjectDocuments.tsx`                      | Generate document flow with preview + `ActionBar`.                                                                                                                                                                          |
| **Estimate**       | `ProjectEstimate.tsx`                       | Large AI-adjacent / workflow surface.                                                                                                                                                                                       |
| **Share estimate** | `ShareEstimate.tsx`                         | Client-facing view.                                                                                                                                                                                                         |


#### Seams

`usePermission` / `can("ai.generate")`, `useEvents`, `useProject`, `useTasks`, `useProjects`, `lib/ai-engine`, `lib/commit-proposal`.

---

### Domain: Share estimate


| Item      | Detail                              |
| --------- | ----------------------------------- |
| **Route** | `/share/estimate/:shareId`          |
| **File**  | `src/pages/share/ShareEstimate.tsx` |


#### Visible data

- Shared snapshot: stages/works/lines, client-regime totals, tax, total, approval stamp if present, newer-version banner.

#### Actions

- Open latest version; Approve (`ApprovalStampFormModal` when eligible); register to approve; “Ask question” (records event); read-only table.

#### Seams

`useEstimateV2Share`, `approveVersion`, `getLatestProposedVersion`, `isAuthenticated`.

---

### Domain: Settings


| Item      | Detail                                    |
| --------- | ----------------------------------------- |
| **Route** | `/settings?tab=`                          |
| **File**  | `src/pages/Settings.tsx`                  |
| **Nav**   | `src/components/settings/SettingsNav.tsx` |


#### Scopes

- **Personal** (active): profile, preferences, notifications, security, privacy, billing.
- **Workspace** / **Project defaults**: nav entries **disabled** (“Soon”); panels not wired in `renderPanel()` for those keys.

#### Panels

`src/components/settings/panels/ProfilePanel.tsx`, `PreferencesPanel.tsx`, `NotificationsPanel.tsx`, `SecurityPanel.tsx`, `PrivacyPanel.tsx`, `BillingPanel.tsx`.

#### App behavior

- AI sidebar suppressed on `/settings` (`HIDE_AI_ROUTES` in `AppLayout`).

---

### Domain: Top bar / global chrome

| File | `src/components/TopBar.tsx` |

#### In project

- Brand menu: `/home`, credits card → `/settings?tab=billing`, Settings, Logout (`supabase.auth.signOut` + local clears).
- Project switcher → `/project/{id}/dashboard`.
- Toggle AI sidebar; `**ProjectTabs`**.

#### Outside project

- AI toggle; user avatar menu: Home, Settings, Logout.

#### Seams

`useCurrentUser`, `useProjects` (from `use-mock-data`), `useRuntimeAuth`; local mock credits state in component.

---

### Domain: Auth / Profile / Demo / Marketing


| Route                                    | File                                                            |
| ---------------------------------------- | --------------------------------------------------------------- |
| `/auth/login`, `/signup`, `/forgot`      | `src/pages/auth/*.tsx`                                          |
| `/profile`                               | `src/pages/Profile.tsx`                                         |
| `/demo`                                  | `src/pages/Demo.tsx`                                            |
| `/`, `/onboarding`, `/pricing`, `/theme` | `Landing.tsx`, `Onboarding.tsx`, `Pricing.tsx`, `ThemeDemo.tsx` |


(Detailed controls: read each file when scoping permissions.)

---

## 3. Shared cross-cutting layers

### Permissions / authority

- `**ProjectAuthoritySeam`** (`src/lib/project-authority-seam.ts`): `projectId`, `profileId`, `membership`, `project`.
- `**usePermission(projectId)`:** builds seam from workspace project + members + current user; applies `**applyWorkspaceDemoOverlayToSeam`** in demo/local modes.
- **Domain access:** `getProjectDomainAccess` / `getProjectDomainAccessForRole` for participants, invites, permissions, estimate, tasks, procurement, hr, documents, gallery, comments.
- **Coarse actions** (`src/lib/permission-matrix.ts`): `ai.generate`, `task.create`, `task.edit`, `estimate.approve`, `member.invite`, `document.create`, `procurement.edit`, `hr.edit` via `can(role, action, aiAccess?)`.
- **Finance:** `seamCanViewSensitiveDetail`, `seamCanViewOperationalFinanceSummary`, `seamCanLoadOperationalSemantics`, `resolveFinanceRowLoadAccess`.
- **Route guard:** `ProjectLayout` + segment → domain map (subset).

### Hooks facade (`src/hooks/use-mock-data.ts`)

Exports: workspace user/projects, `useProject`, `useProjectInvites`, `useTasks`, legacy `useEstimate` / `useContractorProposals` / `useProcurement`, `useProcurementV2`, `useHRItems`, `useHRPayments`, `useDocuments`, `useMedia`, `useEvents`, `useNotifications`, re-exports `usePermission`, `useWorkspaceMode`.

### Recurring UI

`EmptyState`, `ProjectWorkflowEmptyState`, `ConfirmModal`, shadcn dialogs/menus/tabs/tables, `StatusBadge`, estimate-v2 cells, `PhotoViewer`, AI `PreviewCard` / `ActionBar` / `SuggestionChips`.

### Auth / demo

`AuthSimulator` (dev), `useRuntimeAuth`, `auth-state` (`getAuthRole`, `isAuthenticated`, demo session) interacting with permission overlay.

---

## 4. Open ambiguities (from code only)

1. `**/project/:id/activity`** — Routed in `App.tsx` but **not** in `ProjectTabs`; no other navigation link found in the audited paths — **how users discover this page is unclear** from nav code alone.
2. **Home tabs** (documents, procurement, inventory, finance, resources) — Not line-audited in the same pass as Overview/Projects/Tasks; open files for exact fields and actions.
3. `**ProjectEstimate.tsx`** — Too large for exhaustive control inventory in one pass; subtabs and seams are mapped; drill in for every CTA.
4. `**PhotoViewer.tsx`** — Centralized media actions; not expanded in this doc.
5. **Settings panels, Profile, Demo, Landing** — Files exist; control-level detail deferred.

---

## 5. Quick reference: domain → files


| Domain         | Route(s)                | Main file(s)                                         |
| -------------- | ----------------------- | ---------------------------------------------------- |
| Home           | `/home`                 | `pages/Home.tsx`, `components/home/`*                |
| Dashboard      | `.../dashboard`         | `ProjectDashboard.tsx`, `components/dashboard/*`     |
| Tasks          | `.../tasks`             | `ProjectTasks.tsx`, `components/tasks/*`             |
| Estimate       | `.../estimate`          | `ProjectEstimate.tsx`, `components/estimate-v2/*`    |
| Procurement    | `.../procurement*`      | `ProjectProcurement.tsx`, `components/procurement/*` |
| HR             | `.../hr`                | `ProjectHR.tsx`                                      |
| Documents      | `.../documents`         | `ProjectDocuments.tsx`, `components/documents/*`     |
| Gallery        | `.../gallery`           | `ProjectGallery.tsx`, `PhotoViewer.tsx`              |
| Participants   | `.../participants`      | `ProjectParticipants.tsx`                            |
| Invites        | `/invite/accept/:token` | `InviteAccept.tsx`                                   |
| Activity       | `.../activity`          | `ProjectActivity.tsx`                                |
| AI             | (sidebar + scattered)   | `AISidebar.tsx`, `components/ai/*`                   |
| Settings       | `/settings`             | `Settings.tsx`, `components/settings/*`              |
| Share estimate | `/share/estimate/:id`   | `ShareEstimate.tsx`                                  |


---

## 6. Related docs

- `docs/app-architecture.md` — broader architecture notes (may overlap; keep in sync intentionally if both evolve).
- `docs/repo-architecture.md` — repo layout.

When turning this map into permission matrices, cross-check against `**backend-truth`** and workspace adapters (see project rules: `/rovno-contract-check`).