

# Replace "Kitchen Remodel" with "Landscape Work" Demo Project

## Overview
Swap all seed data for `project-3` from a completed kitchen remodel to a realistic in-progress landscape renovation at 65% completion. This is a data-only change -- no logic, routing, or component modifications.

## What Changes
- The third demo project card will show "Landscape Work" instead of "Kitchen Remodel" at 65% progress
- Opening it shows a realistic landscape renovation workspace with 4 stages, 9 tasks, landscape-themed estimate, procurement items with partial delivery states, relevant documents, gallery photos, and activity events
- The demo image `kitchen-demo.png` will be replaced with a `landscape-demo.png` placeholder (or reuse existing image slot)

---

## Technical Plan

### 1. Seed Data (`src/data/seed.ts`)

**Project entry** (line ~25):
- `title`: "Landscape Work"
- `type`: "residential"  
- `automation_level`: "full"
- `progress_pct`: 65
- `current_stage_id`: "stage-3-3" (Paving installation -- the active stage)

**Members** -- keep existing project-3 members (user-1 owner, user-3 participant). Add user-2 (Dmitry Sokolov) as contractor.

**Stages** (replace stage-3-1, stage-3-2 with 4 stages):
- `stage-3-1`: "Site preparation" -- completed
- `stage-3-2`: "Drainage & grading" -- completed
- `stage-3-3`: "Paving installation" -- open (current)
- `stage-3-4`: "Planting & finishing" -- open

**Tasks** (replace task-3-1 through task-3-4 with 9 tasks):

Done (5):
- Remove old turf (stage-3-1, user-3)
- Level backyard soil (stage-3-1, user-3)
- Install drainage gravel strip (stage-3-2, user-2)
- Lay geotextile fabric (stage-3-2, user-2)
- Set perimeter edging (stage-3-2, user-2)

Active (3):
- Install paver base layer (stage-3-3, user-2)
- Align first row of pavers (stage-3-3, user-2)
- Prepare irrigation lines (stage-3-3, user-3)

Blocked (1):
- Delivery of decorative gravel (stage-3-4, user-2) -- with comment "Supplier delay, expected next week"

Each task gets a realistic checklist and comments where appropriate.

**Estimate** (replace ev-3-1 items):
- Version 1, status "approved", planned total ~420K, paid ~275K
- Items across all 4 stages: site clearing work, drainage materials, geotextile, crushed stone, concrete pavers, edging, irrigation supplies, decorative gravel, planting work
- `paid_cost` reflects 65% spend pattern (early stages fully paid, current stage partially paid)

**Documents** (replace doc-3-1, doc-3-2):
- "Landscape design plan" (specification, v2, active)
- "Irrigation layout scheme" (specification, v1, active)  
- "Material specification sheet" (specification, v1, draft)

**Media** (replace media-3-1, media-3-2 with 4 items):
- "Graded soil before paving" (linked to leveling task)
- "Drainage trench close-up" (linked to drainage task)
- "Installed edging detail" (linked to edging task)
- "Paver alignment check" (linked to paver task)

**Events** (replace evt-11, evt-12 and add more):
- 8 events covering: project created, tasks completed, photo uploads, estimate approved, material ordered, comment on blocked task, stage completed, AI-generated activity entries

**Notifications** -- update notif-5 to reference new event ID.

### 2. Procurement Store (`src/data/procurement-store.ts`)

Replace `proc-3-1` and `proc-3-2` seed items with landscape materials:

| Item | Unit | Required | Ordered | Received | Status |
|------|------|----------|---------|----------|--------|
| Concrete pavers | m2 | 120 | 120 | 120 | In stock |
| Crushed stone base | m3 | 8 | 8 | 5 | Ordered (partial) |
| Geotextile fabric | m2 | 150 | 150 | 150 | In stock |
| Decorative gravel | m3 | 3 | 0 | 0 | To buy |
| Lawn border edging | m | 60 | 60 | 60 | In stock |

Linked to appropriate task IDs.

### 3. AI Engine Template (`src/lib/ai-engine.ts`)

Update the `kitchen` template entry in `TEMPLATES` to:
- `name`: "Landscape Work"
- `stages`: ["Site Preparation", "Drainage & Grading", "Paving", "Planting & Finishing"]
- `taskCount`: 9

### 4. Demo Image

Add `public/demo/landscape-demo.png` -- since the Demo page does not currently render images (it only shows text cards), no image component changes are needed. The file exists as a placeholder for future use.

### Files Modified
1. `src/data/seed.ts` -- all project-3 seed data replaced
2. `src/data/procurement-store.ts` -- project-3 seed procurement items replaced
3. `src/lib/ai-engine.ts` -- kitchen template renamed to landscape

### Files NOT Modified
- No routing changes
- No component changes
- No store logic changes
- No layout or design token changes
