

# PROMPT 0B — Domain Entities + Mock Data Model

## Overview
Create a typed, in-memory mock data store for all StroyAgent domain entities. This gives every page and component realistic data to render against, and establishes the entity relationships that will later map to a real Supabase backend.

## What gets created

### 1. Type definitions (`src/types/entities.ts`)
TypeScript interfaces for all 14 entities:
- **User** — id, email, name, avatar, locale, timezone, plan, credits_free, credits_paid
- **Project** — id, owner_id, title, type, automation_level, current_stage_id, progress_pct
- **Member** — project_id, user_id, role (owner|contractor|participant), ai_access (none|consult_only|project_pool), credit_limit, used_credits
- **Stage** — id, project_id, title, description, order, status (open|completed|archived)
- **Task** — id, project_id, stage_id, title, description, status (not_started|in_progress|done|blocked), assignee_id, checklist (array of {id, text, done}), comments (array of {id, author_id, text, created_at}), attachments (string[]), photos (string[]), linked_estimate_item_ids (string[])
- **Estimate** — project_id, versions (EstimateVersion[])
- **EstimateVersion** — id, project_id, number, status (draft|approved|archived), items (EstimateItem[])
- **EstimateItem** — id, version_id, stage_id?, task_id?, type (work|material), title, unit, qty, planned_cost, paid_cost
- **Proposal** — id, project_id, estimate_version_id, author_id, payload (generic object), status (submitted|accepted|rejected)
- **ProcurementItem** — id, project_id, stage_id?, estimate_item_id?, title, unit, qty, in_stock, cost, status (not_purchased|purchased)
- **Document** — id, project_id, type, title, versions (DocumentVersion[])
- **DocumentVersion** — id, document_id, number, status (draft|active|archived|awaiting_approval), content (string)
- **Media** — id, project_id, task_id?, uploader_id, caption, is_final, created_at
- **Event** — id, project_id, actor_id, type (string enum), object_type, object_id, timestamp, payload
- **Notification** — id, user_id, project_id, event_id, is_read

Status string unions will be exported as literal types for type safety.

### 2. Seed data (`src/data/seed.ts`)
Realistic construction-themed mock data:
- **1 user** (current logged-in user)
- **3 projects** matching the existing Home page cards:
  - "Apartment Renovation" (in progress, 45%)
  - "Office Build-out" (draft, 10%)
  - "Kitchen Remodel" (done, 100%)
- **Per project:** 2-3 stages, 4-6 tasks across stages, 1 estimate with 1-2 versions, 5-8 estimate items per version, 3-5 procurement items, 2-3 documents, 3-5 media items, 5-10 events, a few notifications
- Members for multi-user scenarios (2-3 members per project)
- All IDs are simple strings (e.g., "user-1", "project-1", "task-1")

### 3. Mock store with accessors (`src/data/store.ts`)
A simple reactive in-memory store using plain objects + getter/setter functions:

```text
Functions (read):
  getCurrentUser()
  getProjects()
  getProject(id)
  getMembers(projectId)
  getStages(projectId)
  getTasks(projectId, filters?)
  getEstimate(projectId)
  getProcurementItems(projectId)
  getDocuments(projectId)
  getMedia(projectId)
  getEvents(projectId)
  getNotifications(userId)
  getUnreadNotificationCount(userId)

Functions (write):
  addEvent(event)           — creates event + generates notifications
  updateTask(id, partial)   — updates task + writes event
  addTask(task)             — creates task + writes event
  markNotificationRead(id)
  updateProject(id, partial)
```

Every write function automatically:
1. Mutates the in-memory store
2. Calls `addEvent()` to log the change
3. Generates notifications for relevant project members

### 4. React hooks (`src/hooks/use-mock-data.ts`)
Thin React hooks wrapping the store for component consumption:
- `useCurrentUser()` — returns the mock user
- `useProjects()` — returns all projects
- `useProject(id)` — returns single project + members + stages
- `useTasks(projectId)` — returns tasks for a project
- `useEstimate(projectId)` — returns estimate with versions
- `useProcurement(projectId)` — returns procurement items
- `useDocuments(projectId)` — returns documents
- `useMedia(projectId)` — returns media items
- `useEvents(projectId)` — returns event feed
- `useNotifications()` — returns current user's notifications + unread count

These hooks use `useState` + re-render on store changes (simple pub/sub pattern in the store).

### 5. Wire up existing pages
Update the existing placeholder pages to use real mock data instead of hardcoded values:
- **Home.tsx** — render project cards from `useProjects()` with real titles, progress, status badges
- **TopBar.tsx** — show notification count from `useNotifications()`, user avatar from `useCurrentUser()`
- **ProjectDashboard.tsx** — show project title, progress, stage overview, recent events
- **ProjectTasks.tsx** — list tasks with status badges (still simple list, not full table yet)
- **ProjectActivity.tsx** — render event feed using `useEvents()`

Other pages (Estimate, Procurement, Gallery, Documents, Participants) keep their EmptyState but will have data ready for when those UIs are built.

## File plan

| File | Action |
|------|--------|
| `src/types/entities.ts` | Create — all TypeScript interfaces and type unions |
| `src/data/seed.ts` | Create — realistic mock data for 3 projects |
| `src/data/store.ts` | Create — in-memory store with read/write functions + pub/sub |
| `src/hooks/use-mock-data.ts` | Create — React hooks wrapping the store |
| `src/pages/Home.tsx` | Update — use `useProjects()` for project cards |
| `src/components/TopBar.tsx` | Update — show notification count + user avatar |
| `src/pages/project/ProjectDashboard.tsx` | Update — show project overview from mock data |
| `src/pages/project/ProjectTasks.tsx` | Update — list tasks with statuses |
| `src/pages/project/ProjectActivity.tsx` | Update — render event feed |

## Technical notes
- No new dependencies needed — pure TypeScript + React state
- The store uses a simple subscriber pattern: components subscribe on mount, unsubscribe on unmount, and re-render when data changes
- All entity IDs are deterministic strings for easy cross-referencing during development
- The seed data uses construction-realistic terms (e.g., "Demolition", "Electrical rough-in", "Drywall", "Tile installation")
- Event types will cover: task_created, task_updated, task_completed, estimate_created, estimate_approved, document_uploaded, member_added, comment_added, photo_uploaded
- This mock layer is designed to be swapped out for Supabase queries later with minimal refactoring (hooks stay the same, internals change)

