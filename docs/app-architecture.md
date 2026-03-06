# Rovno App Architecture

This document describes the current app structure as verified from the repository on 2026-03-06. Statements are treated as verified unless explicitly labeled as inference or unknown.

## 1. Purpose and current scope

Verified from routes, pages, stores, and seed data:

- The app is a single-page operations workspace for construction-related projects. The seeded projects are renovation, office build-out, and landscape work, and the implemented feature set is centered on running those projects day to day.
- The main product domains visible in code are:
  - public marketing and demo surfaces
  - auth and onboarding
  - a cross-project home workspace
  - per-project dashboard, tasks, estimate, procurement, HR, gallery, documents, participants, and activity
  - an AI sidebar with proposal execution and photo-consult flows
  - settings, pricing, and client-facing shared estimate approval
- The repository contains meaningful domain logic, not just UI shells. Examples include estimate scheduling and rollups, procurement fulfillment and inventory movement logic, order receiving, version diffing, and share-based estimate approval.

Inference from the current implementation:

- The app looks like a front-end-heavy product prototype or internal demo with substantial domain modeling but incomplete production integration. Evidence:
  - runtime data is still in seeded in-memory stores
  - auth is simulated via `localStorage`
  - many screens include mock or placeholder behavior
  - a Supabase schema exists under `supabase/migrations`, but no runtime API usage is wired from `src`

## 2. Tech stack

- Framework and build:
  - React 18
  - TypeScript 5
  - Vite 5 with `@vitejs/plugin-react-swc`
  - `lovable-tagger` enabled in development via [`vite.config.ts`](../vite.config.ts)
- Routing:
  - `react-router-dom` v6 with `BrowserRouter`, nested layouts, redirects, dynamic segments, and route-level `React.lazy`
- State and data access:
  - no Redux, Zustand, MobX, or React Context state container is present
  - state is mostly held in module-level singleton stores under `src/data/*`
  - React components subscribe through custom hooks in `src/hooks/*` built with `useState` and `useEffect`
  - `QueryClientProvider` from `@tanstack/react-query` is mounted at the root, but no `useQuery` or `useMutation` calls were found in `src`
- UI system:
  - Tailwind CSS 3
  - shadcn/ui-style component layer under `src/components/ui`
  - Radix UI primitives
  - Lucide icons
  - custom app components under `src/components/*`
- Styling:
  - global design tokens and utilities in `src/index.css`
  - Tailwind theme extensions for typography, spacing, colors, radii, and glass-style utilities in `tailwind.config.ts`
- Testing:
  - Vitest
  - Testing Library
  - jsdom
  - CI runs lint, test, and build in `.github/workflows/ci.yml`
- Backend boundary:
  - `src/integrations/supabase/client.ts` and generated `src/integrations/supabase/types.ts` exist
  - `supabase/migrations/20260306153000_project_first_schema.sql` defines a large project-first schema
  - no runtime imports of the Supabase client were found outside the client file itself

## 3. Application entry points

- Bootstrap:
  - `src/main.tsx` renders `<App />` into `#root`
- Root app:
  - `src/App.tsx`
- Root providers mounted in `App.tsx`:
  - `QueryClientProvider`
  - `TooltipProvider`
  - `Toaster` from `src/components/ui/toaster.tsx`
  - `Sonner` from `src/components/ui/sonner.tsx`
  - `BrowserRouter`
- Notably absent at the root:
  - no auth/session provider
  - no theme provider
  - no global state context
- Layout shells:
  - `src/layouts/AuthLayout.tsx`: centered auth-card shell with a link back to `/`
  - `src/layouts/AppLayout.tsx`: fixed `TopBar`, optional lazy `AISidebar`, main content outlet
  - `src/layouts/ProjectLayout.tsx`: project-level outlet wrapper that redirects `/project/:id` to `/project/:id/dashboard`
- Global wrappers and shell behavior:
  - `TopBar` changes behavior based on whether the current route is inside `/project/:id/*`
  - `AppLayout` hides the AI sidebar on `/settings`
  - project navigation is rendered inside the top bar via `ProjectTabs`

## 4. Routing map

### Top-level routes

| Path | Layout | Implementation | Notes |
| --- | --- | --- | --- |
| `/` | none | `src/pages/Landing.tsx` | Public landing and demo narrative page |
| `/onboarding` | none | `src/pages/Onboarding.tsx` | Uses `completeOnboarding()` from `lib/auth-state.ts` |
| `/pricing` | none | `src/pages/Pricing.tsx` | Public pricing page |
| `/theme` | none | `src/pages/ThemeDemo.tsx` | Standalone design-system showcase |
| `/share/estimate/:shareId` | none | `src/pages/share/ShareEstimate.tsx` | Public/shared estimate approval flow backed by estimate-v2 store |
| `/auth/login` | `AuthLayout` | `src/pages/auth/Login.tsx` | Simulated login |
| `/auth/signup` | `AuthLayout` | `src/pages/auth/Signup.tsx` | Simulated signup |
| `/auth/forgot` | `AuthLayout` | `src/pages/auth/ForgotPassword.tsx` | Simulated reset flow |
| `/home` | `AppLayout` | `src/pages/Home.tsx` | Cross-project workspace with tab query param |
| `/demo` | `AppLayout` | `src/pages/Demo.tsx` | Demo project list |
| `/profile` | `AppLayout` | `src/pages/Profile.tsx` | Redirects to `/home` |
| `/profile/upgrade` | `AppLayout` | inline redirect in `App.tsx` | Redirects to `/settings?tab=billing` |
| `/settings` | `AppLayout` | `src/pages/Settings.tsx` | Settings with tab query param |
| `*` | none | `src/pages/NotFound.tsx` | Catch-all 404 |

### Project routes

All project routes are nested under `AppLayout` and `ProjectLayout`.

| Path | Page | Notes |
| --- | --- | --- |
| `/project/:id` | redirect | Redirects to `/project/:id/dashboard` |
| `/project/:id/dashboard` | `src/pages/project/ProjectDashboard.tsx` | Project summary widgets and quick actions |
| `/project/:id/tasks` | `src/pages/project/ProjectTasks.tsx` | Task board and detail modal |
| `/project/:id/estimate` | `src/pages/project/ProjectEstimate.tsx` | Estimate v2 editor and review flow |
| `/project/:id/procurement` | `src/pages/project/ProjectProcurement.tsx` | Procurement list view |
| `/project/:id/procurement/order/:orderId` | `src/pages/project/ProjectProcurement.tsx` | Order detail routed inside the same page component |
| `/project/:id/procurement/:itemId` | `src/pages/project/ProjectProcurement.tsx` | Item detail routed inside the same page component |
| `/project/:id/hr` | `src/pages/project/ProjectHR.tsx` | HR work and payment tracking |
| `/project/:id/gallery` | `src/pages/project/ProjectGallery.tsx` | Project media gallery |
| `/project/:id/documents` | `src/pages/project/ProjectDocuments.tsx` | Project document management |
| `/project/:id/activity` | `src/pages/project/ProjectActivity.tsx` | Event feed |
| `/project/:id/participants` | `src/pages/project/ProjectParticipants.tsx` | Membership and invite UI |

### Query-string sub-areas

- `Home` uses `?tab=` with these verified values:
  - `overview`
  - `projects`
  - `tasks`
  - `documents`
  - `procurement`
  - `inventory`
  - `finance`
  - `resources`
- `Settings` uses `?tab=` with these verified values:
  - `profile`
  - `preferences`
  - `notifications`
  - `security`
  - `privacy`
  - `billing`

### Routing notes

- No route guard layer was found. Access control is enforced mostly inside page/component logic by disabling actions, not by blocking route entry.
- `ProjectTabs` is the primary project navigation surface, but it does not include the `tasks` or `activity` routes even though both routes exist.
- `ErrorPage.tsx` exists but is not wired into the router or an error boundary.

## 5. Feature/domain map

### Home workspace

- Purpose:
  - Cross-project workspace for summaries and top-level task/procurement/finance/resource views.
- Main files:
  - `src/pages/Home.tsx`
  - `src/components/home/*`
- Key components:
  - `OverviewTab`
  - `ProjectsTab`
  - `TasksTab`
  - `DocumentsTab`
  - `ProcurementTab`
  - `InventoryTab`
  - `FinanceTab`
  - `ResourcesTab`
- Key state/data dependencies:
  - main store getters via `use-mock-data`
  - procurement read model
  - local component state for filters, folders, mock lists, and UI mode
- Important notes:
  - `ProjectsTab`, `TasksTab`, `ProcurementTab`, `FinanceTab`, and `ResourcesTab` are tied to shared app stores
  - `DocumentsTab` and `InventoryTab` are local mock screens and do not read from the project document or inventory stores
  - `FinanceTab` uses legacy estimate data from `store.ts`, not estimate-v2

### Projects and dashboard

- Purpose:
  - Project selection, project creation, and high-level per-project summary widgets.
- Main files:
  - `src/components/home/ProjectsTab.tsx`
  - `src/pages/project/ProjectDashboard.tsx`
  - `src/components/dashboard/*`
- Key components:
  - `QuickActions`
  - `BudgetWidget`
  - `TaskSummaryWidget`
  - `DocsWidget`
  - `GalleryWidget`
  - `ParticipantsWidget`
- Key state/data dependencies:
  - main store projects, members, tasks, documents, media, legacy estimates
  - `generateProjectProposal` and `commitProposal` for AI project creation
- Important notes:
  - project creation exists in two modes: AI proposal flow and manual creation
  - folder assignment in `ProjectsTab` is purely local component state
  - `BudgetWidget` reads legacy `Estimate`, so dashboard budget numbers are not sourced from estimate-v2

### Tasks

- Purpose:
  - Project task board, stage creation, status transitions, comments, checklist, and task-linked media.
- Main files:
  - `src/pages/project/ProjectTasks.tsx`
  - `src/components/tasks/TaskDetailModal.tsx`
  - `src/data/store.ts`
  - `src/data/estimate-store.ts`
- Key components:
  - task status columns in `ProjectTasks`
  - `TaskDetailModal`
  - task-linked `PhotoViewer`
- Key state/data dependencies:
  - main store tasks, stages, media, events, comments
  - estimate-v2 regime check via `useEstimateV2Project`
  - legacy estimate bridge via `createEstimateItemForTask`, `createEstimateItemForChecklist`, and `syncEstimateItemName`
- Important notes:
  - task creation in `ProjectTasks` and `QuickActions` creates legacy stage estimate items immediately
  - checklist items can be converted into material rows that link into procurement-v2 via `linkChecklistMaterial`
  - task status changes can trigger extra side effects such as photo upload or comments

### Estimate

- Purpose:
  - New planning and estimate system with stages, works, resource lines, dependencies, scheduling, versions, submission, client sharing, and approval.
- Main files:
  - `src/pages/project/ProjectEstimate.tsx`
  - `src/pages/share/ShareEstimate.tsx`
  - `src/data/estimate-v2-store.ts`
  - `src/types/estimate-v2.ts`
  - `src/lib/estimate-v2/*`
  - `src/components/estimate-v2/*`
- Key components:
  - stage/work/line tables in `ProjectEstimate`
  - `EstimateGantt`
  - `VersionBanner`
  - `VersionDiffList`
  - `ApprovalStampCard`
  - `ApprovalStampFormModal`
- Key state/data dependencies:
  - estimate-v2 singleton store
  - pure helpers for pricing, rollups, schedule, submit-state, CTA-state, resource units
  - tasks, procurement-v2, orders, HR items/payments for rollups and cross-sync
- Important notes:
  - estimate-v2 state is lazily materialized from existing project stages plus legacy `StageEstimateItem` rows
  - entering `in_work` can auto-schedule works, materialize linked tasks, and capture a schedule baseline
  - versions are shareable via `/share/estimate/:shareId`
  - the estimate-v2 model coexists with the legacy `Estimate` model; both are active in the repo

### Procurement and inventory

- Purpose:
  - Manage requested items, supplier orders, received stock, stock consumption, and location-based inventory views.
- Main files:
  - `src/pages/project/ProjectProcurement.tsx`
  - `src/data/procurement-store.ts`
  - `src/data/order-store.ts`
  - `src/data/inventory-store.ts`
  - `src/lib/procurement-read-model.ts`
  - `src/lib/procurement-fulfillment.ts`
  - `src/lib/estimate-v2/procurement-sync.ts`
  - `src/components/procurement/*`
- Key components:
  - requested / ordered / in_stock procurement tabs inside `ProjectProcurement`
  - `OrderModal`
  - `OrderDetailModal`
  - `ReceiveOrderModal`
  - `ReceiveOrderPickerModal`
  - `LocationPicker`
- Key state/data dependencies:
  - procurement-v2 store for item definitions
  - order store for order lines and receive events
  - inventory store for locations and stock balances
  - procurement read model for home-level summaries
  - estimate-v2 sync for estimate-linked items
- Important notes:
  - the routed procurement page owns both list mode and detail mode
  - list UI state is persisted in `sessionStorage`
  - ordered and in-stock views derive from order events, not just raw item fields
  - procurement-v2 is the active model for project procurement pages, but legacy procurement still exists elsewhere in the app

### HR

- Purpose:
  - Track labor/subcontractor planned work and actual payments.
- Main files:
  - `src/pages/project/ProjectHR.tsx`
  - `src/data/hr-store.ts`
  - `src/types/hr.ts`
- Key components:
  - filterable HR table in `ProjectHR`
- Key state/data dependencies:
  - HR store
  - estimate-v2 lines for relinking and sync source
  - main store members/users for assignee display
- Important notes:
  - HR items are created from estimate-v2 labor and subcontractor lines
  - items can become orphaned if estimate linkage breaks
  - manual payments are stored separately from planned items

### Documents

- Purpose:
  - Project document storage, versioning, archive/delete/generate flows, and document events.
- Main files:
  - `src/pages/project/ProjectDocuments.tsx`
  - `src/components/dashboard/DocsWidget.tsx`
  - `src/components/home/DocumentsTab.tsx`
- Key components:
  - project document table and modals in `ProjectDocuments`
  - home document library in `DocumentsTab`
- Key state/data dependencies:
  - main store documents and events for project documents
  - local component state only for home document library
- Important notes:
  - project documents are part of the shared app store
  - the home document library is separate mock data and not a read model over project documents
  - several document actions generate placeholder content rather than integrating with a backend or file storage

### Media, gallery, and photo consult

- Purpose:
  - Manage project photos and route a selected photo into the AI consult flow.
- Main files:
  - `src/pages/project/ProjectGallery.tsx`
  - `src/components/PhotoViewer.tsx`
  - `src/lib/photo-consult-store.ts`
- Key components:
  - gallery grid
  - `PhotoViewer`
  - AI consult handoff into `AISidebar`
- Key state/data dependencies:
  - main store media and tasks
  - singleton photo-consult store
- Important notes:
  - media items are real shared app state, but thumbnail rendering is still placeholder UI
  - photo consult is not a backend call; it is a local context handoff plus mock analysis inside the AI sidebar

### Participants and permissions

- Purpose:
  - Membership display, invitations, role/AI access assignment, and RBAC checks.
- Main files:
  - `src/pages/project/ProjectParticipants.tsx`
  - `src/lib/permissions.ts`
  - `src/lib/auth-state.ts`
  - `src/components/settings/AuthSimulator.tsx`
- Key components:
  - participants table and invite modal
  - dev-only auth/regime simulator in settings
- Key state/data dependencies:
  - main store members and current user
  - auth role stored in `localStorage`
- Important notes:
  - `usePermission` is a synchronous derived helper over store data, not a dedicated reactive auth subsystem
  - invitations mutate the member list
  - role-change and remove-member actions currently do not mutate store state; they only show toasts

### AI sidebar

- Purpose:
  - Provide chat, contextual suggestions, proposal review/commit, event feed, learn mode, and photo consult.
- Main files:
  - `src/components/AISidebar.tsx`
  - `src/components/ai/*`
  - `src/lib/ai-engine.ts`
  - `src/lib/commit-proposal.ts`
- Key components:
  - `ProposalQueueCard`
  - `ContextInspector`
  - `NotificationDrawer`
  - `WorkLog`
  - `PreviewCard`
  - `ResultCard`
- Key state/data dependencies:
  - main store tasks, events, documents, projects, members
  - photo-consult singleton store
  - local UI state for conversation, queue, filters, automation mode, and panel width
- Important notes:
  - proposal generation is local heuristic logic, not an API integration
  - proposal execution writes directly to store mutation functions
  - `commitProposal` still targets legacy `store.ts` procurement and document models, not the newer procurement-v2/order/inventory stack

### Settings, auth, onboarding, pricing, marketing, and demo

- Purpose:
  - Account/profile preferences, simulated authentication, onboarding, pricing, public landing, and demo access.
- Main files:
  - `src/pages/Settings.tsx`
  - `src/components/settings/*`
  - `src/pages/auth/*`
  - `src/pages/Onboarding.tsx`
  - `src/pages/Pricing.tsx`
  - `src/pages/Landing.tsx`
  - `src/pages/Demo.tsx`
  - `src/pages/ThemeDemo.tsx`
- Key state/data dependencies:
  - `lib/auth-state.ts`
  - local component state across most settings panels and marketing/demo interactions
- Important notes:
  - login/signup/forgot-password are simulated flows
  - only a few settings values persist today
  - settings contains disabled workspace/project-default scopes
  - `Landing.tsx` is a large standalone public/demo page, not part of the authenticated app shell

## 6. State management map

### Store inventory

| Store / module | Owns | Read access | Write access | Persistence |
| --- | --- | --- | --- | --- |
| `src/data/store.ts` | current user, projects, members, legacy stages/tasks, legacy estimates, legacy procurement, documents, media, events, notifications, contractor proposals | `use-mock-data`, direct getters | direct function calls from many pages/components | in memory only |
| `src/data/estimate-store.ts` | legacy `StageEstimateItem[]` bridge linked to tasks/checklists | `use-estimate-data`, direct getters | task flows and estimate sync helpers | in memory only |
| `src/data/estimate-v2-store.ts` | estimate-v2 project state, works, lines, dependencies, versions, schedule baseline | `useEstimateV2Project`, `useEstimateV2Share` | direct function calls from `ProjectEstimate` and share flow | in memory only, plus read-only currency lookup from `localStorage` |
| `src/data/procurement-store.ts` | procurement-v2 items | `useProcurementV2`, direct getters | procurement page, estimate sync, tests | in memory only |
| `src/data/order-store.ts` | orders, order lines, receive/use events | `useOrders`, `useOrder`, direct getters | procurement/order UI | in memory only |
| `src/data/inventory-store.ts` | locations and inventory balances | `useLocations`, `useInventoryStock`, direct getters | order receiving/use flows | in memory only |
| `src/data/hr-store.ts` | HR planned items and payments | `useHRItems`, `useHRPayments`, direct getters | HR page, estimate sync | in memory only |
| `src/lib/photo-consult-store.ts` | currently selected photo-consult context | `AISidebar` subscription | `PhotoViewer` | in memory only |

### Hook pattern

- Subscription hooks live in `src/hooks/*`.
- The common pattern is:
  - compute a getter with `useCallback`
  - seed local state from that getter
  - subscribe to a store-specific `subscribe*` function in `useEffect`
- `useSyncExternalStore` is not used.

### Derived models and selectors

- `src/lib/procurement-read-model.ts`: cross-project procurement summary used by home and AI context panels
- `src/lib/procurement-fulfillment.ts`: requested/ordered/in-stock quantities, header KPIs, inventory-by-location
- `src/lib/estimate-v2/rollups.ts`: planned vs fact financial/schedule rollups
- `src/lib/estimate-v2/pricing.ts`: line, stage, and project totals
- `src/lib/estimate-v2/schedule.ts`: dependency validation and scheduling
- `src/lib/permissions.ts`: derived role/capability checks

### Browser persistence actually present

- `localStorage`
  - `auth-simulated-role`
  - `onboarding-complete`
  - `profile-automation-level`
  - `profile-currency` is read by estimate-v2 code, but no writer was found in `src`
  - `ai-sidebar-width`
  - `landing-theme`
- `sessionStorage`
  - `procurement-v3:list-state:${projectId}`

### State ownership risks

- Legacy and v2 models overlap for estimate and procurement.
- Components often call mutation functions directly instead of going through a narrow domain/service layer.
- Some features bypass hooks and read stores directly in render.
- Several screens keep their own local mock state even when a domain store already exists elsewhere.
- Root `QueryClientProvider` is present but not currently part of the app's data ownership model.

## 7. Data flow and integration boundaries

### Common runtime flow

Most features follow this pattern:

1. Route page or component reads state through a `use-*` hook or direct getter.
2. UI event calls a mutation function from a `src/data/*` module directly.
3. The store mutates module-level arrays/maps, often emits events/notifications as a side effect, and calls `notify()`.
4. Subscribed hooks update local React state and rerender.

### Major cross-domain flows

- Tasks and legacy estimate bridge:
  - task creation calls `createEstimateItemForTask`
  - checklist item creation can call `createEstimateItemForChecklist`
  - checklist material linking can create procurement-v2 items
- Estimate-v2 orchestration:
  - estimate-v2 lazily bootstraps from project stages and legacy stage estimate items
  - estimate-v2 can materialize tasks from works
  - edits in the main task store can sync back into estimate-v2 works and lines
  - estimate-v2 syncs procurement-v2 and HR via `syncProcurementFromEstimateV2()` and `syncHRFromEstimateV2()`
- Procurement/order/inventory:
  - procurement-v2 items define requested demand
  - order store tracks supplier or stock orders
  - receive/use events update inventory balances and procurement quantities
  - procurement read model derives home-level/project-level summaries
- AI execution:
  - `AISidebar` creates local proposal objects through `ai-engine.ts`
  - `commitProposal()` mutates legacy store domains and emits events

### Mock/local/demo boundaries

Verified mock or local-only areas include:

- all seeded runtime data in `src/data/seed.ts`
- auth/onboarding state in `src/lib/auth-state.ts`
- home `DocumentsTab`
- home `InventoryTab`
- much of `Landing.tsx`
- parts of `AISidebar` such as mock photo analysis and stub attachment/selector flows
- settings panels that only show toasts or maintain local state

### Backend/API boundary

- No fetch layer or service client usage was found in the app runtime code.
- The only explicit integration client is Supabase, and it is unused by the frontend.
- The generated Supabase types currently expose no tables in `src/integrations/supabase/types.ts`, while the SQL migration defines many tables. That mismatch means the backend schema work is not yet reflected in the frontend runtime contract.

### Separation quality

- There is some domain logic separation in `src/lib/*`, especially for pricing, scheduling, fulfillment, and rollups.
- There is not a strong separation between UI orchestration and mutation logic. Large route components still own substantial business workflow logic directly.

## 8. Shared UI/component system

- `src/components/ui/*` is the reusable primitive layer. It contains shadcn/ui-style wrappers over Radix and related helper libraries.
- App-specific shared building blocks include:
  - `TopBar`
  - `ProjectTabs`
  - `EmptyState`
  - `ConfirmModal`
  - `StatusBadge`
  - `PhotoViewer`
  - `NavLink`
- Domain component clusters are grouped by folder:
  - `components/ai`
  - `components/dashboard`
  - `components/estimate-v2`
  - `components/home`
  - `components/procurement`
  - `components/settings`
  - `components/tasks`
  - `components/landing`
- Styling conventions:
  - design tokens live in `src/index.css`
  - the app uses custom semantic color tokens, spacing tokens, radii, and glass-style utility classes
  - Tailwind utilities are the primary composition mechanism
- Verified composition inconsistencies:
  - some screens use shadcn selects/forms, while others still use native `<select>` and ad hoc form markup
  - both Radix toast (`Toaster`) and Sonner (`Sonner`) are mounted at the root
  - `src/components/ui/sonner.tsx` imports `useTheme` from `next-themes`, but no `ThemeProvider` reference was found in `src`
  - theme switching is currently page-local in `Landing.tsx` and `ThemeDemo.tsx`, not centrally managed

## 9. Types, entities, and domain models

### Canonical type locations actually in use

- `src/types/entities.ts`
  - legacy app-wide entities: user, project, member, stage, task, legacy estimate, legacy procurement, documents, media, events, notifications, orders, inventory
- `src/types/estimate-v2.ts`
  - estimate-v2 project, stage, work, resource line, dependency, snapshot, version, approval stamp, schedule baseline, diff structures
- `src/types/hr.ts`
  - HR planned item and payment model
- `src/types/ai.ts`
  - AI messages and proposal/change objects

### Additional domain shapes outside `src/types`

- `src/data/estimate-store.ts`
  - `StageEstimateItem` is a real domain model but lives inside a store file, not under `src/types`

### Competing or overlapping models

- Estimate:
  - legacy `Estimate` / `EstimateItem` in `src/types/entities.ts`
  - `StageEstimateItem` bridge in `src/data/estimate-store.ts`
  - estimate-v2 structures in `src/types/estimate-v2.ts`
- Procurement:
  - legacy `ProcurementItem` in `src/types/entities.ts`
  - `ProcurementItemV2` in `src/types/entities.ts`
- Planning vs execution:
  - legacy `Stage` and `Task`
  - estimate-v2 `EstimateV2Stage` and `EstimateV2Work`

### Verified signs of model drift

- `ProjectEstimate` and `ShareEstimate` use estimate-v2.
- `ProjectDashboard` budget widget and `Home` finance tab still use legacy `Estimate`.
- procurement project pages use procurement-v2 plus orders/inventory.
- AI proposal commit logic still writes legacy procurement via `store.ts`.
- `TopBar` shows its own local mock credit state, while home/settings read credits from the user in `store.ts`.

## 10. Folder structure by responsibility

- `src/main.tsx`, `src/App.tsx`
  - runtime bootstrap and route tree
- `src/pages`
  - route-level pages
  - `project/` contains project-scoped pages
  - `auth/` contains auth screens
  - `share/` contains public/shared estimate view
- `src/layouts`
  - router layouts and top-level shells
- `src/components/ui`
  - reusable primitive component layer
- `src/components/ai`, `dashboard`, `estimate-v2`, `home`, `landing`, `onboarding`, `procurement`, `settings`, `tasks`
  - domain-specific component groupings
- `src/data`
  - singleton stores, seed data, and some domain bridge logic
- `src/hooks`
  - thin subscription hooks and UI utility hooks
- `src/lib`
  - pure or mostly-pure domain helpers, read models, permission helpers, AI helper logic
- `src/types`
  - shared TypeScript domain definitions
- `src/integrations/supabase`
  - Supabase runtime client and generated types
- `src/test`
  - test setup
- `public`
  - static assets, including demo assets used by `Landing.tsx`
- `supabase`
  - backend schema/config artifacts, not yet wired into the frontend runtime
- `scripts`
  - build/report helper scripts such as bundle metrics

## 11. Coupling hotspots, complexity zones, and likely risk areas

- `src/data/estimate-v2-store.ts`
  - Central orchestration point for estimate-v2 state, lazy bootstrapping, task materialization, schedule logic, versioning, share links, and cross-sync into procurement and HR.
  - Any non-trivial change here should be audit-first.
- `src/pages/project/ProjectEstimate.tsx`
  - Very large page that mixes presentation, state orchestration, navigation, export/share actions, status transitions, and schedule/Gantt interactions.
- `src/pages/project/ProjectProcurement.tsx`
  - Very large page that handles three procurement states, session persistence, routed detail panes, order receiving, stock usage, autosave, and estimate-line relinking.
- `src/components/AISidebar.tsx`
  - Large stateful component that owns chat, review queues, mock learning flows, photo consult, notifications, and direct mutation execution.
  - It is tightly coupled to current store layout and assumes legacy proposal commit paths.
- `src/pages/project/ProjectTasks.tsx` plus `src/components/tasks/TaskDetailModal.tsx`
  - Task flow is tightly coupled to legacy estimate items, checklist-generated procurement rows, media, and comments.
- `src/components/dashboard/QuickActions.tsx`
  - Multi-modal write surface that can create tasks, docs, photos, participants, and credit purchases directly from the dashboard.
- `src/pages/Landing.tsx`
  - Large standalone marketing/demo page. It is separate from core app runtime but large enough that changes there also deserve targeted prompting.

### Specific architectural risks verified from code

- Legacy vs v2 drift:
  - estimate, procurement, and budget data are not owned by a single model
- UI-only permissions:
  - route entry is not guarded; most restrictions only disable actions
- Mock-only surfaces inside real product areas:
  - home document library, home inventory, many settings panels, and parts of AI
- Disconnected credit displays:
  - `TopBar` credits are local mock state; app/user credits live in the main store
- Incomplete participant mutations:
  - invite mutates data, but role change and remove do not
- Navigation inconsistency:
  - routed project pages exist for tasks and activity, but primary project tabs do not expose them

### Areas likely to need audit-first prompts

- Anything touching estimate-v2 status transitions, versions, or task/procurement/HR sync
- Procurement/order/inventory behavior
- AI sidebar execution behavior
- Task/checklist linkage to estimate/procurement
- Cross-view consistency work involving budgets, credits, or permissions

## 12. Verified facts vs inferred structure

### Verified

- The app is a client-side React/Vite SPA with React Router and lazy-loaded routes.
- Runtime domain data is seeded and kept in in-memory singleton stores.
- There are multiple active data models for estimate and procurement.
- Estimate-v2 is already in real use on the project estimate page and the shared estimate page.
- Procurement-v2, orders, inventory, and HR are active runtime stores.
- Auth is simulated with `localStorage`, not backed by a runtime auth provider.
- Supabase client/types and a schema migration exist, but no frontend runtime code uses the Supabase client.
- Many settings and some home tabs are local UI state rather than canonical app state.

### Inferred

- The app is in a transitional state between demo/prototype behavior and a fuller backend-integrated architecture.
- Estimate-v2 appears to be the intended richer planning model, but it has not replaced all legacy estimate consumers yet.
- The SQL migration likely represents a target backend model for future integration.

### Unknown

- Whether legacy `Estimate`, legacy `ProcurementItem`, and `StageEstimateItem` are temporary migration layers or expected to remain long-term.
- Whether the missing `ThemeProvider` is intentional or incomplete.
- Whether hidden project routes like `tasks` and `activity` are intentionally secondary or simply not yet wired into primary navigation.
- How and when the frontend is expected to connect to the Supabase schema already present in the repo.
- Which store or model should be treated as canonical for budgets and credits during future implementation work.

## 13. Suggested follow-up docs

- `docs/state-management.md`
  - Justified by the number of singleton stores, subscription patterns, browser-storage keys, and direct mutation entry points.
- `docs/estimate-v2-lifecycle.md`
  - Justified by the complexity of planning status transitions, task materialization, scheduling, version submission, and share approval.
- `docs/procurement-lifecycle.md`
  - Justified by the requested/ordered/in_stock split, order events, inventory balance logic, and procurement-v2 vs legacy procurement overlap.
- `docs/domain-models.md`
  - Justified by the competing legacy and v2 estimate/procurement types and the bridge model living in `data/estimate-store.ts`.
- `docs/backend-boundary.md`
  - Justified by the current gap between frontend runtime behavior and the Supabase schema/migration artifacts already present in the repo.
