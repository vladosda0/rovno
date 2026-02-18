# PROMPT 0A — Global UI + Navigation Skeleton

## What we are building

The full application shell for StroyAgent: a top bar, a collapsible left AI panel, a right workspace area, all routes (placeholder pages), project tab navigation, and shared UI primitives (status badges, confirmation modal, empty states, toast integration).

## File structure (new and modified)

```text
src/
  App.tsx                          (updated — all routes)
  layouts/
    AppLayout.tsx                  (top bar + AI panel + workspace)
    AuthLayout.tsx                 (centered card for login/signup/forgot)
    ProjectLayout.tsx              (project shell with tab nav)
  components/
    TopBar.tsx                     (project switcher, notifications, avatar)
    AISidebar.tsx                  (collapsible left AI panel)
    ProjectTabs.tsx                (tab bar for project sub-routes)
    StatusBadge.tsx                (reusable badge component)
    ConfirmModal.tsx               (confirm/cancel + optional tertiary)
    EmptyState.tsx                 (icon + title + description + CTA)
    OverflowMenu.tsx               ("..." dropdown menu)
  pages/
    Landing.tsx                    (/ — marketing landing)
    Demo.tsx                       (/demo — read-only demo project)
    auth/
      Login.tsx
      Signup.tsx
      ForgotPassword.tsx
    Onboarding.tsx
    Home.tsx                       (/home — project list)
    Pricing.tsx
    Profile.tsx
    Settings.tsx
    project/
      ProjectDashboard.tsx
      ProjectTasks.tsx
      ProjectEstimate.tsx
      ProjectProcurement.tsx
      ProjectGallery.tsx
      ProjectDocuments.tsx
      ProjectActivity.tsx
      ProjectParticipants.tsx
    NotFound.tsx                   (updated)
    ErrorPage.tsx                  (generic error)
  Index.tsx                        (removed — replaced by Landing)
  ThemeDemo.tsx                    (kept at /theme for dev)
```

## Routing plan


| Path                        | Layout                    | Page                 |
| --------------------------- | ------------------------- | -------------------- |
| `/`                         | none (standalone)         | Landing              |
| `/demo`                     | AppLayout                 | Demo                 |
| `/auth/login`               | AuthLayout                | Login                |
| `/auth/signup`              | AuthLayout                | Signup               |
| `/auth/forgot`              | AuthLayout                | ForgotPassword       |
| `/onboarding`               | none (standalone)         | Onboarding           |
| `/home`                     | AppLayout                 | Home                 |
| `/project/:id`              | AppLayout > ProjectLayout | nested tabs          |
| `/project/:id/dashboard`    | "                         | ProjectDashboard     |
| `/project/:id/tasks`        | "                         | ProjectTasks         |
| `/project/:id/estimate`     | "                         | ProjectEstimate      |
| `/project/:id/procurement`  | "                         | ProjectProcurement   |
| `/project/:id/gallery`      | "                         | ProjectGallery       |
| `/project/:id/documents`    | "                         | ProjectDocuments     |
| `/project/:id/activity`     | "                         | ProjectActivity      |
| `/project/:id/participants` | "                         | ProjectParticipants  |
| `/pricing`                  | none                      | Pricing              |
| `/profile`                  | AppLayout                 | Profile              |
| `/settings`                 | AppLayout                 | Settings             |
| `/theme`                    | none                      | ThemeDemo (dev only) |
| `*`                         | none                      | NotFound             |


## Component details

### TopBar

- Fixed at top, full width, glass surface
- Left: StroyAgent logo/wordmark; when inside a project, a breadcrumb-style project switcher
- Right: notification bell icon (with unread dot), user avatar dropdown (profile, settings, logout)
- Height: 48px, uses glass utility class

### AISidebar (left collapsible panel, that you can slide to make more wide or more narrow, Like in Loveable)

- Uses the existing shadcn Sidebar component
- Two modes indicated by context: "Global AI" (on /home) and "Project AI" (inside /project/:id)
- Collapsed state shows only a small AI icon; expanded shows a placeholder chat area
- Width: 320px expanded, icon-only when collapsed
- Glass-sidebar styling

### ProjectLayout + ProjectTabs

- Wraps all /project/:id/* routes
- Horizontal tab bar below the TopBar with tabs: Dashboard, Tasks, Estimate, Procurement, Gallery, Documents, Activity, Participants
- Uses NavLink for active highlighting
- Each tab renders its page component via nested `<Outlet />`
- Default redirect: `/project/:id` redirects to `/project/:id/dashboard`

### StatusBadge

- Props: `status` (string), `variant` (task | estimate | procurement)
- Task statuses: Not started (neutral), In progress (info), Done (success), Blocked (destructive)
- Estimate statuses: Draft (muted), Approved (success), Archived (neutral outline)
- Procurement: Not purchased (muted), Purchased (success)
- Uses rounded-pill, small text, semantic colors from the token system

### ConfirmModal

- Built on top of shadcn AlertDialog
- Props: title, description, confirmLabel, cancelLabel, onConfirm, onCancel, tertiaryLabel?, onTertiary?
- Glass-modal styling with rounded-modal radius
- Primary action uses accent color, cancel is secondary, tertiary is outline

### EmptyState

- Props: icon (Lucide icon component), title, description, actionLabel?, onAction?
- Centered layout with large icon, heading, body text, optional CTA button
- Used as placeholder content in all project tabs initially

### OverflowMenu

- Wraps shadcn DropdownMenu
- Props: items (array of { label, icon?, onClick, variant? })
- Trigger is a "..." (MoreHorizontal) icon button

### All page components

- Placeholder content only — each page shows its name, a brief description, and an EmptyState or simple layout
- No real data or API calls yet

## Technical notes

- All layouts and components use the existing design tokens (glass utilities, spacing, radii, colors)
- Motion: transitions use 150-200ms for micro-interactions, ease-out
- No new npm dependencies needed — everything uses existing shadcn components, Lucide icons, and react-router-dom
- The AI sidebar uses the existing `SidebarProvider` / `Sidebar` from shadcn
- Project tab navigation uses `NavLink` for active state highlighting
- All pages are code-split-ready (simple default exports)