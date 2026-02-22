

# Procurement Tab v1 Rework

## Overview
Replace the current boolean-toggle procurement UI with a quantity-based system that supports partial purchases, syncs with the stage-based estimate, and provides a cleaner item-row layout with quick Receive/Order actions.

## What Changes for You
- The Procurement tab will show items grouped by stage with clear status pills: **To buy**, **Ordered**, or **In stock**
- Each item shows required/received/remaining quantities instead of simple on/off toggles
- Quick **Receive** and **Order** buttons let you track partial deliveries
- Items from your Estimate automatically appear as procurement items (no duplicates)
- Task checklist items marked as "Material" link to procurement
- An overflow menu replaces the per-row trash icon, with "Archive" instead of hard delete

---

## Technical Plan

### 1. Data Model Changes

**New `ProcurementItemV2` type** (in `src/types/entities.ts`):
- Replace old `ProcurementItem` (boolean in_stock/purchased) with quantity-based fields: `requiredQty`, `orderedQty`, `receivedQty`, `plannedUnitPrice`, `actualUnitPrice`, `supplier`, `linkUrl`, `notes`, `spec`, `categoryId`, `attachments[]`, `linkedTaskIds[]`, `createdFrom` enum, `archived` flag
- Computed status derived from quantities (no stored status field)
- Add `ProcurementUnit` type for the unit enum with custom fallback

**Extend `ChecklistItem`** (in `src/types/entities.ts`):
- Add `type?: "subtask" | "material" | "tool"` (default "subtask")
- Add `procurementItemId?: string | null`

**New normalization utility** (`src/lib/procurement-utils.ts`):
- `normalizeName(name)` -- lowercase, trim, collapse spaces, strip punctuation
- `matchingKey(name, spec, unit, stageId)` -- deterministic key for dedup
- `computeStatus(item)` -- returns "to_buy" | "ordered" | "in_stock" based on qty fields

### 2. Procurement Store (`src/data/procurement-store.ts`)

New file replacing procurement logic currently in `store.ts`:
- In-memory array of `ProcurementItemV2` with pub/sub
- Seed data migrated from old format: `requiredQty = qty`, `receivedQty` based on old `in_stock`/`status`, `plannedUnitPrice = cost/qty`
- CRUD operations: `add`, `update`, `archive`, `receive`, `order`
- **Sync from Estimate**: `syncFromEstimate(stageId, estimateItems[])` -- for each material-type estimate item, find or create procurement item using matching key; update `requiredQty` without touching `receivedQty`/`orderedQty`
- **Sync from Checklist**: `linkChecklistMaterial(checklistItem, task)` -- find or create procurement item using matching key; link via `procurementItemId`
- Duplicate prevention via matching key lookup before creation

### 3. Procurement Screen UI (`src/pages/project/ProjectProcurement.tsx`)

Complete rewrite of the page:

**Header section**:
- Title "Procurement"
- Summary chips: Total planned cost, To buy count/cost, Ordered count, In stock count
- Search input (filters by name/spec)
- Filter chips: All / To buy / Ordered / In stock
- Grouping: By Stage (default)

**Item rows** (list layout, not dense table):
- Left: Name (bold) + spec (secondary text)
- Subline: "Required X unit -- Received Y -- Remaining Z"
- Right: Status pill + planned cost + quick action buttons
- Quick actions: [Receive] [Order] [Edit] + overflow menu with [Archive]
- No per-row trash icon

**Receive modal** (small AlertDialog):
- Qty input (default: remainingQty)
- Optional actual unit price
- Submit updates `receivedQty += qty`

**Order modal** (small AlertDialog):
- Qty input (default: remainingQty)
- Optional supplier field
- Submit updates `orderedQty += qty`

**Item detail drawer** (Dialog/Sheet):
- All fields editable: name, spec, unit, quantities, prices, supplier, link, notes
- Attachments list + upload placeholder
- Linked tasks list (clickable, navigates to task)
- Unit change warning if `receivedQty > 0`

### 4. StatusBadge Updates (`src/components/StatusBadge.tsx`)

Add new procurement status styles:
- "To buy" -- orange/warning tint
- "Ordered" -- blue/info tint  
- "In stock" -- green/success tint

Remove old "Purchased" / "Not purchased" styles.

### 5. Task Integration (Minimal)

**ChecklistItem type selector** (in `TaskDetailModal.tsx`):
- Each checklist item gets a small type indicator (Subtask/Material/Tool)
- When type changes to "Material": run matching key logic to find/create procurement item and link it
- Show status pill next to material-type checklist items

**No auto-creation** from every checklist item -- only from Material type.

### 6. Estimate Sync Hook

In `estimate-store.ts`, add a hook that on estimate item changes (material type), calls `syncFromEstimate` in the procurement store. This ensures estimate material items always have a corresponding procurement item without duplicates.

### 7. Store Cleanup (`src/data/store.ts`)

- Remove old `addProcurementItem`, `updateProcurementItem`, `deleteProcurementItem` 
- Replace with imports from new procurement store
- Update `useProcurement` hook to use new store
- Old seed data migrated in new store's seed initialization

### 8. Edge Cases Handled

- Stage deleted: archive its procurement items (`archived = true`)
- Estimate `plannedQty` changes: only `requiredQty` updates, `receivedQty`/`orderedQty` untouched
- `receivedQty > requiredQty`: allowed, show "Overbought" label in detail view only
- Checklist item deleted: unlink from procurement item, do not delete procurement item
- Task deleted: unlink from `linkedTaskIds`, do not delete procurement items

### Files to Create
1. `src/data/procurement-store.ts` -- new canonical store
2. `src/lib/procurement-utils.ts` -- normalization + matching key + status computation

### Files to Modify
1. `src/types/entities.ts` -- new `ProcurementItemV2`, extend `ChecklistItem`
2. `src/pages/project/ProjectProcurement.tsx` -- full rewrite
3. `src/components/StatusBadge.tsx` -- add new procurement statuses
4. `src/data/store.ts` -- remove old procurement CRUD, wire new store
5. `src/data/seed.ts` -- remove old `seedProcurementItems` (migrated in new store)
6. `src/hooks/use-mock-data.ts` -- update `useProcurement` hook
7. `src/components/tasks/TaskDetailModal.tsx` -- checklist type selector + material linking
8. `src/data/estimate-store.ts` -- add sync trigger for procurement

