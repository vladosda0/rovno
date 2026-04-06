# Permissions

## Purpose

This document is the canonical product contract for project permissions in Rovno.

It defines:

- roles as default permission presets
- the meaning of each permission level
- exact visibility semantics for sensitive and non-sensitive data
- action permissions
- AI enforcement boundaries
- how permissions must be interpreted across domains and surfaces

This document is normative.

If implementation, agent behavior, UI, or backend behavior contradict this document, this document is the intended product behavior and the deviation must be documented and fixed.

---

## Core principles

1. **Backend truth wins.**
  Permissions must be enforced at the real access level, not only in UI.
2. **Hidden means hidden.**
  If a domain, field, block, or action is hidden for the user, it must also be inaccessible through:
  - direct URL
  - API
  - AI chat
  - background automation
  - indirect workflow
  - export
3. **Roles are default presets, not rigid immutable sets.**
  A role is a predefined convenient starting permission set.  
   It can be adjusted through explicit advanced permissions.
4. **No one can grant permissions they do not hold.**
  No participant may grant access above their own effective authority.
5. **Summary is domain-specific.**
  `summary` does not have one global meaning.  
   It must be interpreted separately for each domain and surface.
6. **No financial data means no money fields at all.**
  Operational non-financial data may remain visible where explicitly allowed.
7. **Client-facing values must never be inferred from hidden internal values.**
  A client-facing amount may only be shown if it is explicitly defined by product semantics and backed by the current contract.
8. **AI authority is always a strict subset of user authority, never a superset.**
  AI must not reveal hidden data or execute hidden or disabled actions.
9. **Advanced permissions are explicit and non-default.**
  The default role preset should remain simple.  
   Detailed and custom access should live under an explicit advanced permissions surface.

---

## Roles

Project roles are:

- Owner
- Co-owner
- Contractor
- Viewer

All are participants of the project.

Roles are default presets for convenience.  

Each role may later be customized within allowed boundaries.

### Owner

Highest project authority.

Default behavior:

- full domain access
- full participant management
- can create/promote co-owner
- can assign advanced permissions within system rules

Cannot be bypassed by AI or UI shortcuts.

### Co-owner

Operational second admin.

Default behavior:

- broad project management access
- may manage participants
- may invite/create/promote contractor and viewer
- may not create/promote co-owner
- may not transfer ownership
- may not grant permissions above their own authority

### Contractor

Operational contributor.

Default behavior:

- viewer baseline
- plus limited operational contribution
- no invite management
- no permissions management
- no participant management
- no default HR management
- no default procurement management

### Viewer

Client-safe read role.

Default behavior:

- may see selected project information in a client-safe/read-only form
- no invite management
- no permissions management
- no participant management
- no action buttons by default in procurement
- no financial internals

---

## Permission dimensions

Permissions are defined along multiple dimensions.

### 1. Domain access

What high-level surfaces the user can open.

Values:

- `hidden`
- `summary`
- `view`
- `contribute`
- `manage`

### 2. Financial visibility

What kind of financial data the user can see.

Values:

- `none`
- `summary`
- `detail`

### 3. Action permissions

What the user can do inside a visible surface.

Action states:

- `hidden`
- `disabled_visible`
- `enabled`

### 4. Document/media visibility

What classified content the user can see.

Values:

- `shared_project`
- `internal`

---

## Permission levels vocabulary

### Domain access levels

#### `hidden`

The surface is not available.

- tab hidden
- route blocked
- actions unavailable
- AI cannot expose or execute anything from this hidden surface

#### `summary`

The surface remains operationally useful, but restricted.

Only explicitly allowed summary-safe fields remain visible.

#### `view`

Full read-only view of allowed non-hidden content.

#### `contribute`

Limited operational write access.

The user can perform only specific allowed actions.

#### `manage`

Full working control of the domain, except where owner-only rules still apply.

---

## Financial visibility vocabulary

### `detail`

Full financial detail for the allowed domain/surface.

### `summary`

Client-safe or explicitly allowed summary-level financial visibility only.

Important:

- `summary` does **not** mean “all safe money everywhere”
- `summary` must be defined per domain
- where no trustworthy summary money model exists, `summary` falls back to operational non-financial visibility only

### `none`

No money fields at all.

Only explicitly allowed non-financial operational data may remain visible.

---

## AI enforcement rules

These rules are mandatory.

### Visibility inheritance

If a user cannot see:

- a field
- a price
- a total
- a compensation amount
- a profitability value
- a supplier field
- an internal document
- an internal media item
- an internal note
- a hidden domain

then AI must not:

- reveal it
- summarize it
- hint at it
- compare visible data against it
- use it in user-visible reasoning
- mention it indirectly
- expose it through exports, drafts, or generated messages

### Action inheritance

If a user cannot perform an action, AI must not:

- execute it
- trigger it
- route around it
- simulate it by another path
- act as if confirmation would grant permission

### Disabled action rule

If an action is visible but disabled for the user, AI must still treat it as unavailable.

### Hidden action rule

If an action is hidden for the user, AI must not disclose that hidden path as a usable workaround.

### Examples

If procurement order action is unavailable, the user must not be able to order materials through AI chat.

If cost price, profitability, or subcontractor compensation are hidden, AI must not disclose them even if asked directly.

---

## Advanced permissions

Roles are default presets for convenience.

Non-default customization must be explicit.

### UI model

The default role editor may show only the main simplified controls:

- Role preset
- AI access
- Financial access
- Documents/Media access
- other high-level access selectors already present in the product

Detailed customization must live in a separate explicit surface, for example:

- `Advanced permissions`

### Advanced permissions purpose

Advanced permissions are used to:

- refine a preset role
- enable or disable specific actions
- override selected domain defaults
- configure non-default but valid access combinations

Advanced permissions must not:

- grant authority above the acting user’s own authority
- bypass backend enforcement
- bypass AI restrictions
- create contradictory hidden/allowed states

---

## Domain contract

# Home / Dashboard

## Purpose

Cross-project navigation and overview surfaces.

## For financial visibility = `detail`

May show financial widgets and monetary summaries where supported.

## For financial visibility = `summary`

May show:

- navigation
- project links
- counts
- dates
- non-sensitive widgets

Must not show:

- internal aggregate currency
- internal budgets
- internal spend
- internal variance
- hidden procurement/finance money

## For financial visibility = `none`

May show:

- navigation
- project links
- counts
- dates
- non-sensitive widgets

Must not show any money fields.

## Mixed-project rule

A user may have different roles and financial visibility across projects.

Home and Dashboard must evaluate visibility per project.  

They must not assume one global role or one global financial level across all projects.

---

# Estimate

## Main surfaces

- Estimate upper summary block
- Estimate table / rows
- Estimate related comparisons / diffs
- Estimate share route is a separate product surface

## Estimate upper block

### `detail`

Visible:

- timing
- client total
- VAT
- discount
- internal financial totals
- profitability widgets
- all allowed estimate-level financial widgets

### `summary`

Visible:

- timing
- client total
- VAT
- discount
- resource-cost breakdown if that breakdown is explicitly client-safe in this surface

Hidden:

- cost totals
- markup
- profitability
- internal-only financial widgets

### `none`

Visible:

- timing only

Hidden:

- all financial widgets
- client total
- VAT
- discount
- all money summaries

## Estimate table / rows

### `detail`

Visible:

- Stage
- Work
- Resource title
- Resource type
- Qty
- Unit
- Assignee
- Client unit
- Client total
- Discounted client total
- Cost unit
- Cost total
- Markup
- Profitability

### `summary`

Visible:

- Stage
- Work
- Resource title
- Resource type
- Qty
- Unit
- Assignee
- Client unit
- Client total
- Discounted client total

Hidden:

- Cost unit
- Cost total
- Markup
- Profitability

### `none`

Visible:

- Stage
- Work
- Resource title
- Resource type
- Qty
- Unit
- Assignee

Hidden:

- Client unit
- Client total
- Discounted client total
- Cost unit
- Cost total
- Markup
- Profitability

## Estimate actions

### Viewer

- no estimate edit actions

### Contractor

- no estimate edit actions by default

### Co-owner

- estimate manage enabled by default

### Owner

- estimate manage enabled by default

---

# Tasks

## Main surfaces

- Task board / task list
- Task detail modal
- Checklist
- Comments
- Attachments / media

## Visibility

Non-hidden users may see:

- task title
- status
- checklist structure
- assignees
- resource names and types where task context includes them
- allowed attachments/media

Hidden unless explicitly allowed by access:

- any embedded internal finance detail
- any hidden estimate/procurement/HR financial fields

## Actions

### Viewer

- read only
- comments view by default

### Contractor

Default enabled:

- change task status
- edit checklist
- write comments
- upload documents
- upload photos/media

### Co-owner

- task manage enabled

### Owner

- task manage enabled

---

# Procurement

## Main surfaces

- Requested
- Ordered
- In stock
- Procurement header block
- Order detail views / modals

## Important summary rule

Until there is an explicit backend-backed client-facing procurement money model, procurement `summary` must not show money fields.

`summary` in Procurement means:

- operational rows only
- no money

## Tabs visibility

By default, the following tabs are visible for non-manage roles unless role/domain rules hide Procurement entirely:

- Requested
- Ordered
- In stock

## Ordered tab

### Viewer + `summary`

Visible:

- order number
- resource / item title
- quantity
- unit
- expected delivery date

Hidden:

- supplier name
- all money fields
- line totals
- order totals
- supplier/internal pricing

### Viewer + `none`

Visible:

- order number
- resource / item title
- quantity
- unit
- expected delivery date

Hidden:

- supplier name
- all money fields
- line totals
- order totals
- supplier/internal pricing

### Contractor + `summary`

Visible:

- order number
- supplier name
- resource / item title
- quantity
- unit
- expected delivery date

Hidden:

- all money fields
- line totals
- order totals
- supplier/internal pricing

### Contractor + `none`

Visible:

- order number
- supplier name
- resource / item title
- quantity
- unit
- expected delivery date

Hidden:

- all money fields
- line totals
- order totals
- supplier/internal pricing

### Co-owner / Owner

Visible according to detail/manage permissions.

## Requested tab

### Viewer / Contractor + `summary` or `none`

Visible:

- resource / item title
- resource type where available
- quantity
- unit
- request status

Hidden:

- all money fields
- financial totals

## In stock tab

### Viewer + `summary`

Visible:

- resource / item title
- quantity
- unit
- receiver name if present

Hidden:

- supplier name
- all money fields

### Viewer + `none`

Visible:

- resource / item title
- quantity
- unit
- receiver name if present

Hidden:

- supplier name
- all money fields

### Contractor + `summary`

Visible:

- resource / item title
- supplier name
- quantity
- unit
- receiver name if present

Hidden:

- all money fields

### Contractor + `none`

Visible:

- resource / item title
- supplier name
- quantity
- unit
- receiver name if present

Hidden:

- all money fields

## Supplier visibility rule

- Viewer: supplier hidden in both `summary` and `none`
- Contractor: supplier visible in both `summary` and `none`
- Co-owner / Owner: supplier visible by default

## Procurement financial header block

- Viewer: hidden
- Contractor: hidden
- Co-owner: visible
- Owner: visible

## Procurement actions

### Viewer

By default:

- `order`: hidden
- `receive`: hidden
- `use_from_stock`: hidden

### Contractor

By default:

- `order`: disabled_visible
- `receive`: disabled_visible
- `use_from_stock`: disabled_visible

May be explicitly enabled in advanced permissions.

### Co-owner

By default:

- `order`: enabled
- `receive`: enabled
- `use_from_stock`: enabled

May be explicitly disabled.

### Owner

By default:

- `order`: enabled
- `receive`: enabled
- `use_from_stock`: enabled

---

# HR

## Main surfaces

- HR list/table
- HR item detail
- HR payment surfaces

## Visibility

- Viewer: hidden
- Contractor: hidden
- Co-owner: manage baseline
- Owner: manage baseline

## Hidden HR rule

If HR is hidden:

- names of assignees may still appear in Estimate/Tasks where operationally necessary
- no compensation, payroll, payment amounts, or HR financial detail may be shown

---

# Documents / Media

## Main surfaces

- project documents
- project gallery/media
- media preview
- upload flows

## Classification model

Current classification model is:

- `shared_project`
- `internal`

No richer classification model is implied.

## Visibility semantics

If classification exists, it must be applied in:

- UI
- API-backed visibility
- AI behavior

## Upload semantics

At upload time, current visibility selection is:

- `shared_project`
- `internal`

## Visual labeling

UI should visually indicate the document/media visibility class so users understand who can see the content.

## Fallback rule

If classification is missing or legacy content is unclassified:

- fallback behavior must be explicitly defined by implementation
- UI must not imply a richer or more reliable classification model than currently exists

---

# Participants / Invites / Permissions

## Viewer

- Participants hidden
- Invites hidden
- Permissions hidden
- assignees may still be visible inside Estimate/Tasks

## Contractor

- Participants hidden
- Invites hidden
- Permissions hidden
- assignees may still be visible inside Estimate/Tasks

## Co-owner

- Participants manage
- Invites manage
- Permissions manage within their authority ceiling
- may create/promote contractor and viewer only

## Owner

- full manage
- may create/promote co-owner

---

# Activity

## General rule

Activity visibility must never leak hidden sensitive data through titles, captions, snippets, or summaries.

If activity detail is hidden by access level:

- generic event text may remain
- sensitive payload details must not remain

AI must follow the same rule.

---

# AI

AI uses the same domain and field restrictions as the current user.

AI must not:

- reveal hidden data
- summarize hidden values
- execute hidden actions
- execute disabled actions
- use chat as a workaround around missing buttons or hidden tabs

AI may only operate within the exact current access envelope of the user.

---

## Role presets

The following are default presets.

They are convenient defaults and may be refined through advanced permissions within allowed boundaries.

### Viewer preset

- client-safe read role
- no participants/invites/permissions
- no HR
- no procurement actions
- estimate visible in client-safe form
- tasks visible
- documents/media visible according to domain + classification rules

### Contractor preset

- viewer baseline
- plus operational contribution:
  - task status
  - checklist
  - comments
  - document/media upload
- procurement actions visible but disabled by default
- no participant management
- no invite management
- no permissions management

### Co-owner preset

- broad operational management
- participant management
- contractor/viewer invite and promotion
- no co-owner creation/promotion
- no ownership transfer

### Owner preset

- highest authority
- may manage all project roles and advanced permissions within system invariants

---

## Advanced permissions rules

Advanced permissions may refine a preset role.

They may:

- enable/disable specific actions
- refine selected domain defaults
- expose non-default but valid access combinations

They must not:

- exceed the acting user’s authority
- conflict with hidden-domain rules
- conflict with AI enforcement rules
- create states where UI says no but backend/AI says yes

---

## Notes for implementation and agents

When implementing permissions:

- do not infer semantics from role names alone
- do not infer money visibility from domain visibility alone
- do not infer client-facing values from internal values
- do not treat `summary` as globally identical across all domains
- do not let AI act outside the same effective constraints as the current user

This document must be paired with a machine-readable permissions contract for agent execution.