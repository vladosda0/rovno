# Permissions Model — Launch Freeze

Status: frozen for launch-foundation work  
Repo: `rovno`  
Purpose: frontend consumer contract for launch permissions, invites, visibility, and permission-driven UX

## 1. Scope

This document freezes the frontend-side rules for consuming the launch permissions system.

It defines:

- what frontend must trust from backend truth
- how permissions should shape UI
- how participants/invites should be presented
- how sensitive data should be hidden or redacted
- how project mode should affect feature visibility
- what frontend must not invent

This is not a schema spec and not a final UX copy doc.

Any deviation requires an explicit design decision.

---

## 2. Frontend authority rule

Backend is authoritative for all sensitive authorization.

Frontend may:

- hide
- redirect
- summarize
- warn
- explain

Frontend may not:

- act as the source of truth for access decisions
- invent effective permission semantics
- assume a role implies access if backend contract does not confirm it
- expose data simply because a route/component is open

`backend-truth` must be treated as canonical backend contract context.

---

## 3. Launch model the frontend must reflect

### 3.1 Base roles

Frontend must reflect these project roles only:

- owner
- co-owner
- contractor
- viewer

Do not introduce a separate Estimate role layer in frontend UX.

### 3.2 Model direction

Frontend must present permissions as:

- role preset first
- bounded project-scoped customization second
- sensitive-data visibility as a distinct concept where applicable

Do not present permissions as a blank matrix or free-form ACL builder.

---

## 4. Participant model

Frontend must present one unified participants model.

This unified surface may contain:

- active participants
- pending invites
- identity-only assignees or references, where relevant

But the UI must clearly distinguish between:

- real project access
- pending access
- identity-only presence

Do not blur “assignee identity” into “member with access.”

---

## 5. Invite and participant UX rules

### 5.1 Canonical participant flow

Participants tab is the canonical participant-management surface.

Other entry points may exist, but they must route into or reuse the same underlying flow and semantics.

### 5.2 Assignment UX

When assigning any role, frontend must:

- show what that role grants by default
- explain that permissions can be customized within bounds
- surface danger-zone rights clearly when relevant

### 5.3 Delegation constraints to reflect in UI

Frontend must reflect these confirmed rules:

- only owner can create/promote co-owner
- co-owner can create/promote only contractor/viewer
- contractor cannot invite
- no user can grant a permission they do not themselves hold

The UI must not offer controls that violate those ceilings.

### 5.4 Pending / non-platform identities

If a person has no account access, frontend must represent them as identity-only or pending invite, not as an active participant with access.

---

## 6. Permission-driven navigation and rendering

### 6.1 Hidden modules

If the user has no access to a module/tab:

- hide it completely
- do not show disabled placeholder navigation as the default pattern

### 6.2 Route behavior

If a user attempts to open a restricted route directly:

- do not render full content
- show a safe fallback or redirect
- do not rely only on top-level tab hiding

### 6.3 Action-level gating

Inside visible modules, actions must still be gated by effective permission.

Example:

- visible module does not imply edit rights
- edit rights do not imply sensitive-data rights

---

## 7. Sensitive-data rendering model

Sensitive-data visibility is separate from module access.

Frontend must support at least these presentation outcomes:

- hidden completely
- summary only
- redacted detail
- full detail

### Launch-sensitive classes

Frontend must be prepared to consume backend-truth for:

- compensation detail
- procurement pricing detail
- profitability / markup / discount detail
- project financial detail
- internal document visibility

### Examples

A user may:

- access HR
- but not see wage amounts

A user may:

- access Procurement
- but not see cost-price detail

A user may:

- access Estimate
- but not see markup/discount/profitability fields

### Important rule

Do not leak sensitive values through:

- totals
- tooltips
- side cards
- activity feed wording
- AI context panels
- export/share actions

---

## 8. Summary and redaction behavior

When a linked hidden domain still matters to the workflow:

- show summary or redacted information where necessary
- do not expose full detail

Examples:

- show that a worker payment exists without showing amount
- show that a procurement item was ordered without exposing sensitive price detail
- show that an internal document exists only if policy allows summary-level awareness

This must be a deliberate rendering mode, not an accidental partial leak.

---

## 9. Document visibility

Frontend must support document visibility classification from launch.

Minimum classes:

- shared project
- internal

Frontend must ensure that document lists, previews, search/filtering, and linked references respect that classification.

Do not assume all documents are globally visible to all project members.

---

## 10. Viewer preset handling

Viewer must not be treated as universal read by default.

Frontend should present viewer as:

- broad operational read where allowed
- with sensitive financial/detail visibility restricted unless explicitly granted

When assigning viewer, UI must clearly communicate this.

---

## 11. Co-owner handling

Frontend must treat co-owner as broad operational admin, but not as owner-equivalent.

Default co-owner UI must not expose owner-only actions such as:

- ownership transfer
- project deletion
- billing/subscription authority
- other explicit danger-zone rights not granted by owner

---

## 12. Contractor handling

Frontend must never expose contractor invite/participant-management authority.

Contractor may be a strong operational role, but frontend must not imply governance rights it does not have.

---

## 13. AI authority model — frontend boundaries

Frontend must treat AI as operating inside the user’s effective permission envelope.

### Required launch rules

- AI must not display data the user cannot access
- AI must not expose hidden sensitive details through summaries or suggestions
- AI action affordances must respect:
  - module access
  - edit rights
  - sensitive visibility
  - current automation-level boundaries when available

### Important note

The full automation-level action matrix is not frozen here.
Frontend should only implement the launch-safe boundaries:

- AI is never a superuser
- risky actions may require stronger confirmations
- hidden data must stay hidden from AI output too

---

## 14. Project mode and feature regime

“Build for myself” vs contractor is not a frontend role system.

Frontend must treat this as project mode / feature regime.

### Launch expectations

- selectable at project creation
- adjustable through settings if product later allows
- contractor-only commercial features hidden behind a contractor-features toggle

### Features likely affected

- markup
- discount
- profitability
- related commercial analytics or profitability indicators

Do not encode this as participant-role logic.

---

## 15. Frontend non-goals

Do not implement these as part of the launch permissions foundation:

- free-form permission builder
- second Estimate role system
- role explosion to express module combinations
- frontend-only sensitive access semantics
- AI permission model that bypasses user permissions
- broad redesign of billing/credits in this stream
- complete automation-level behavior design in this stream

---

## 16. Expected frontend outputs in later phases

Frontend permission work is considered aligned only when it provides:

- one canonical permission seam for project membership and effective rights
- one canonical participant/invite flow
- role preset + bounded override editing UX
- hidden-tab behavior for denied modules
- route-safe handling for denied access
- redacted/summary rendering for sensitive linked data
- document visibility classification support
- project mode-driven contractor-features regime
- AI UI that does not bypass user authority

---

## 17. Working rule for Cursor/Codex in `rovno`

When implementing permission-related frontend work:

1. trust backend-truth over existing coarse UI assumptions
2. do not infer access semantics from old helper behavior alone
3. do not invent new permission fields or meanings in frontend first
4. prefer minimal, canonical seams over parallel permission logic
5. treat legacy permission helpers as migration surfaces, not long-term truth
