<!-- Generated file. Read-only. Regenerate from rovno-db. -->
<!-- Secondary summary view. Structured JSON and mirrored SQL are authoritative over this markdown. -->

# Estimates Contract

Generated secondary summary view for a derived contract bundle.
Mirrored SQL and normalized JSON remain authoritative over this markdown.

## Source Migrations

- `supabase/migrations/20260306162500_estimates_core.sql`
- `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql`
- `supabase/migrations/20260306164000_hr_domain.sql`
- `supabase/migrations/20260306165500_auth_bootstrap_and_domain_rpc.sql`
- `supabase/migrations/20260306170000_grants_rls_enablement_and_policies.sql`

## Tables

### public.project_estimates

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | yes |   | no |
| `status` | `text` | no | `'draft'` | no |
| `created_by` | `uuid` | no |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `status in ('draft', 'approved', 'archived')`)

Indexes:
- `idx_project_estimates_project_id` on (`project_id`)

Triggers:
- `set_project_estimates_updated_at`: before update, executes `public.set_updated_at()`

### public.estimate_versions

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `estimate_id` | `uuid` | no |   | no |
| `version_number` | `integer` | no |   | no |
| `is_current` | `boolean` | no | `false` | no |
| `created_by` | `uuid` | no |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed unique (columns `estimate_id`, `version_number`)

Indexes:
- `idx_estimate_versions_estimate_id` on (`estimate_id`)
- `idx_estimate_versions_current_per_estimate` on (`estimate_id`), unique, where `is_current = true`

### public.estimate_works

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `estimate_version_id` | `uuid` | no |   | no |
| `project_stage_id` | `uuid` | yes |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | yes |   | no |
| `sort_order` | `integer` | no |   | no |
| `planned_cost_cents` | `bigint` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `sort_order > 0`)
- unnamed check (expression `planned_cost_cents is null or planned_cost_cents >= 0`)

Indexes:
- `idx_estimate_works_estimate_version_id` on (`estimate_version_id`)
- `idx_estimate_works_project_stage_id` on (`project_stage_id`)

Triggers:
- `guard_estimate_work_stage_reassignment`: before update of project_stage_id, executes `public.guard_estimate_work_stage_reassignment()`

### public.estimate_resource_lines

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `estimate_work_id` | `uuid` | no |   | no |
| `resource_type` | `text` | no |   | no |
| `title` | `text` | no |   | no |
| `quantity` | `numeric(14,3)` | no |   | no |
| `unit` | `text` | yes |   | no |
| `unit_price_cents` | `bigint` | yes |   | no |
| `total_price_cents` | `bigint` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `resource_type in ('material', 'labor', 'equipment', 'other')`)
- unnamed check (expression `quantity >= 0`)
- unnamed check (expression `unit_price_cents is null or unit_price_cents >= 0`)
- unnamed check (expression `total_price_cents is null or total_price_cents >= 0`)

Indexes:
- `idx_estimate_resource_lines_estimate_work_id` on (`estimate_work_id`)

### public.estimate_dependencies

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `estimate_version_id` | `uuid` | no |   | no |
| `from_work_id` | `uuid` | no |   | no |
| `to_work_id` | `uuid` | no |   | no |
| `dependency_type` | `text` | no | `'finish_to_start'` | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `dependency_type in ('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish')`)

Indexes:
- `idx_estimate_dependencies_estimate_version_id` on (`estimate_version_id`)
- `idx_estimate_dependencies_from_work_id` on (`from_work_id`)
- `idx_estimate_dependencies_to_work_id` on (`to_work_id`)

## Relations

| From | To | On Delete | Source |
| --- | --- | --- | --- |
| `public.project_estimates(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.project_estimates(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.estimate_versions(estimate_id)` | `public.project_estimates(id)` | `cascade` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.estimate_versions(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.estimate_works(estimate_version_id)` | `public.estimate_versions(id)` | `cascade` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.estimate_works(project_stage_id)` | `public.project_stages(id)` | `set` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.estimate_resource_lines(estimate_work_id)` | `public.estimate_works(id)` | `cascade` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.estimate_dependencies(estimate_version_id)` | `public.estimate_versions(id)` | `cascade` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.estimate_dependencies(from_work_id)` | `public.estimate_works(id)` | `cascade` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.estimate_dependencies(to_work_id)` | `public.estimate_works(id)` | `cascade` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.procurement_items(estimate_resource_line_id)` | `public.estimate_resource_lines(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.task_checklist_items(estimate_resource_line_id)` | `public.estimate_resource_lines(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.task_checklist_items(estimate_work_id)` | `public.estimate_works(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.hr_items(estimate_work_id)` | `public.estimate_works(id)` | `set` | `supabase/migrations/20260306164000_hr_domain.sql` |

## Functions

| Function | Returns | Auth Execute | Kind | Source |
| --- | --- | --- | --- | --- |
| `public.get_shared_estimate_version(text)` | `public.estimate_versions` | yes | `rpc` | `supabase/migrations/20260306165500_auth_bootstrap_and_domain_rpc.sql` |
| `public.approve_estimate_version_by_share_token(text, jsonb)` | `uuid` | yes | `rpc` | `supabase/migrations/20260306165500_auth_bootstrap_and_domain_rpc.sql` |

## RLS and Grants

### public.project_estimates

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `project_estimates_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`
  - `project_estimates_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id) and created_by = auth.uid()`
  - `project_estimates_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `project_estimates_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`

### public.estimate_versions

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `estimate_versions_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.project_estimates pe where pe.id = estimate_id and public.can_access_project(pe.project_id) )`
  - `estimate_versions_insert` for `insert` to `authenticated`
    with check: `created_by = auth.uid() and exists ( select 1 from public.project_estimates pe where pe.id = estimate_id and public.can_write_project_content(pe.project_id) )`
  - `estimate_versions_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.project_estimates pe where pe.id = estimate_id and public.can_write_project_content(pe.project_id) )`
    with check: `exists ( select 1 from public.project_estimates pe where pe.id = estimate_id and public.can_write_project_content(pe.project_id) )`
  - `estimate_versions_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.project_estimates pe where pe.id = estimate_id and public.can_write_project_content(pe.project_id) )`

### public.estimate_works

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `estimate_works_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_access_project(pe.project_id) )`
  - `estimate_works_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_write_project_content(pe.project_id) )`
  - `estimate_works_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_write_project_content(pe.project_id) )`
    with check: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_write_project_content(pe.project_id) )`
  - `estimate_works_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_write_project_content(pe.project_id) )`

### public.estimate_resource_lines

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `estimate_resource_lines_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.estimate_works ew join public.estimate_versions ev on ev.id = ew.estimate_version_id join public.project_estimates pe on pe.id = ev.estimate_id where ew.id = estimate_work_id and public.can_access_project(pe.project_id) )`
  - `estimate_resource_lines_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.estimate_works ew join public.estimate_versions ev on ev.id = ew.estimate_version_id join public.project_estimates pe on pe.id = ev.estimate_id where ew.id = estimate_work_id and public.can_write_project_content(pe.project_id) )`
  - `estimate_resource_lines_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.estimate_works ew join public.estimate_versions ev on ev.id = ew.estimate_version_id join public.project_estimates pe on pe.id = ev.estimate_id where ew.id = estimate_work_id and public.can_write_project_content(pe.project_id) )`
    with check: `exists ( select 1 from public.estimate_works ew join public.estimate_versions ev on ev.id = ew.estimate_version_id join public.project_estimates pe on pe.id = ev.estimate_id where ew.id = estimate_work_id and public.can_write_project_content(pe.project_id) )`
  - `estimate_resource_lines_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.estimate_works ew join public.estimate_versions ev on ev.id = ew.estimate_version_id join public.project_estimates pe on pe.id = ev.estimate_id where ew.id = estimate_work_id and public.can_write_project_content(pe.project_id) )`

### public.estimate_dependencies

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `estimate_dependencies_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_access_project(pe.project_id) )`
  - `estimate_dependencies_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_write_project_content(pe.project_id) )`
  - `estimate_dependencies_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_write_project_content(pe.project_id) )`
    with check: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_write_project_content(pe.project_id) )`
  - `estimate_dependencies_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.estimate_versions ev join public.project_estimates pe on pe.id = ev.estimate_id where ev.id = estimate_version_id and public.can_write_project_content(pe.project_id) )`

