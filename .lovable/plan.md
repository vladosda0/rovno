# AI Panel Behavior + Preview/Confirm Pipeline + RBAC/Credits Scaffolding

## Overview

Transform the AI sidebar from a static placeholder into a functional resizeable panel, scaffolding with chat messages, keyword-based fake proposals, a full "Preview -> Confirm/Cancel -> Commit -> Event" pipeline, role-based access control, and credit gating.

## New Files

### 1. `src/types/ai.ts` -- AI-specific types

```text
AIMessage         { id, role: "user"|"assistant", content, timestamp, proposal? }
AIProposal        { id, project_id, type: "add_task"|"update_estimate"|"add_procurement"|"generate_document",
                    summary, changes: ProposalChange[], status: "pending"|"confirmed"|"cancelled" }
ProposalChange    { entity_type, action: "create"|"update"|"delete", label, before?, after? }
```

### 2. `src/lib/permissions.ts` -- RBAC scaffolding

- Define action strings: `"ai.generate"`, `"task.create"`, `"task.edit"`, `"estimate.approve"`, `"member.invite"`, `"document.create"`, `"procurement.edit"`
- `can(role: MemberRole, action: string): boolean` pure function
  - **owner**: all actions allowed
  - **contractor**: `ai.generate` (if ai_access != "none"), `task.edit`, `task.create`, `procurement.edit`
  - **participant**: read-only (no actions allowed)
- Export `usePermission(projectId)` hook that returns `{ role, can(action) }` based on current user's membership

### 3. `src/lib/ai-engine.ts` -- Deterministic fake proposal generator

- `generateProposal(input: string, projectId: string): AIProposal | null`
- Keyword matching:
  - "task" / "add task" -> returns proposal with 2-3 new tasks for the current stage
  - "estimate" / "cost" -> returns proposal updating estimate items
  - "procurement" / "buy" / "purchase" -> returns proposal adding procurement items
  - "document" / "contract" -> returns proposal creating a document draft
  - No match -> returns null (AI responds with a text-only message)
- Each proposal includes realistic `ProposalChange[]` with before/after diffs
- Costs 1 credit per generation

### 4. `src/lib/commit-proposal.ts` -- Pipeline commit logic

- `commitProposal(proposal: AIProposal): { success: boolean, error?: string }`
- Checks `can("ai.generate")` -- rejects with error if unauthorized
- Checks credits -- rejects if insufficient
- Applies changes to the store based on `proposal.changes`:
  - `create` task -> `store.addTask()`
  - `update` estimate -> update estimate items in store
  - `create` procurement -> add items to store
  - `create` document -> add document to store
- Writes Event for each change
- Deducts 1 credit from user
- Returns success

### 5. `src/components/ai/PreviewCard.tsx` -- Proposal preview component

- Glass-styled card showing proposed changes
- Each `ProposalChange` rendered as a row: icon + label + before/after diff
- Create actions show green "+" indicator
- Update actions show amber "~" with old -> new values
- Summary header with change count and risk/warning slots

### 6. `src/components/ai/ActionBar.tsx` -- Confirm/Cancel controls

- Sticky bar below PreviewCard
- Three buttons: "Confirm" (accent), "Cancel" (secondary), optional "Create new version" (outline)
- Confirm calls `commitProposal()`, shows toast success, clears proposal
- Cancel discards proposal, shows toast info
- "Create new version" only shown for estimate-type proposals

### 7. `src/components/ai/ChatMessage.tsx` -- Individual chat message

- Glass mini-card for each message
- User messages: right-aligned, subtle background
- Assistant messages: left-aligned
- If message has a proposal/action attached, renders PreviewCard + ActionBar inline

### 8. `src/components/ai/SuggestionChips.tsx` -- Quick suggestion chips

- Row of rounded-pill chips above the input
- Context-aware: in project context shows "Add tasks", "Update estimate", "Generate contract", "Buy materials"
- In global context shows "Create project", "Which adhesive works best with 6mm ceramic tiles", etc
- Clicking a chip fills the input and auto-submits

### 9. `src/components/ai/CreditDisplay.tsx` -- Credits in AI panel header

- Shows "N credits" with a small icon
- If credits < 10, shows amber warning color
- If credits == 0, clicking shows ConfirmModal "Limit reached" with CTA to /pricing

## Modified Files

### 10. `src/components/AISidebar.tsx` -- Major rewrite

- Header: Bot icon + title + CreditDisplay
- Content: ScrollArea with ChatMessage list
- Above input: SuggestionChips
- Footer: Input + Send button
- State: manages `messages: AIMessage[]` and `activeProposal: AIProposal | null`
- On send:
  1. Check credits (show modal if 0)
  2. Check permissions (toast error if unauthorized)
  3. Add user message to chat
  4. Call `generateProposal()`
  5. Add assistant message (with or without proposal)
  6. If proposal exists, it renders inline with PreviewCard + ActionBar

### 11. `src/data/store.ts` -- Add new write functions

- `addProcurementItem(item)` -- for procurement proposals
- `addDocument(doc)` -- for document proposals
- `updateEstimateItems(versionId, items)` -- for estimate proposals
- `deductCredit()` -- decrements `user.credits_free` (then `credits_paid`)

### 12. `src/types/entities.ts` -- Minor update

- Add `"proposal_confirmed" | "proposal_cancelled"` to EventType union

### 13. `src/hooks/use-mock-data.ts` -- Add permission hook re-export

- Export `usePermission` from permissions module for convenience

## Pipeline Flow

```text
User types "add tasks for electrical"
  |
  v
AISidebar.handleSend()
  |-- check credits > 0  (if not -> ConfirmModal "Limit reached")
  |-- check can("ai.generate")  (if not -> toast error)
  |
  v
generateProposal("add tasks for electrical", projectId)
  |-- keyword match: "task" detected
  |-- builds AIProposal with 2-3 ProposalChange items
  |-- returns proposal (no mutations yet)
  |
  v
Render: ChatMessage with PreviewCard + ActionBar
  |
  +-- [Confirm] -> commitProposal(proposal)
  |     |-- can() check (guard)
  |     |-- apply changes to store (addTask x3)
  |     |-- write Events
  |     |-- deductCredit()
  |     |-- toast.success("3 tasks created")
  |     |-- mark proposal as "confirmed"
  |
  +-- [Cancel] -> discard proposal
  |     |-- toast.info("Proposal cancelled")
  |     |-- mark proposal as "cancelled"
  |
  +-- [New Version] (estimate only)
        |-- creates new EstimateVersion with proposed items
```

## RBAC Matrix


| Action           | Owner | Contractor             | Participant |
| ---------------- | ----- | ---------------------- | ----------- |
| ai.generate      | Yes   | If ai_access != "none" | No          |
| task.create      | Yes   | Yes                    | No          |
| task.edit        | Yes   | Yes                    | No          |
| estimate.approve | Yes   | No                     | No          |
| member.invite    | Yes   | No                     | No          |
| document.create  | Yes   | Yes                    | No          |
| procurement.edit | Yes   | Yes                    | No          |


## Credits Logic

- Each `generateProposal()` call costs 1 credit
- Credits deducted from `credits_free` first, then `credits_paid`
- Display format:  a card that says "Credits   250" (sum of free + paid), progress bar, paid credits one color, daily credits another color but similar (for example dark blue/light blue, use colors from design system)  below progress bar: Using daily credits/Using paid credits (sum of free + paid), little arrow next to credits number, clickable takes to upgrade plan page (will be designed later)
- Warning state at < 10 credits (amber)
- Block state at 0 credits -> ConfirmModal with "Upgrade" CTA linking to /pricing

## Technical Notes

- No new npm dependencies
- All proposal generation is synchronous and deterministic (keyword matching)
- The chat state lives in AISidebar component state (not in the global store) -- it resets on navigation, which is acceptable for scaffolding
- PreviewCard and ActionBar are standalone components reusable outside the AI panel
- The `can()` function is pure and testable -- no side effects
- Store mutations in `commitProposal` reuse existing patterns (addTask, addEvent, notify)