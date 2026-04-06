<!-- Generated file. Read-only. Regenerate from rovno-db. -->
<!-- Secondary summary view. Structured JSON and mirrored SQL are authoritative over this markdown. -->

# HR Contract

Generated secondary summary view for a derived contract bundle.
Mirrored SQL and normalized JSON remain authoritative over this markdown.

## Source Migrations

- `supabase/migrations/20260306164000_hr_domain.sql`
- `supabase/migrations/20260330160000_wave2_hr_lineage_and_projection_uniqueness.sql`
- `supabase/migrations/20260406184500_track1_hr_operational_summary_role_gate.sql`
- `supabase/migrations/20260306170000_grants_rls_enablement_and_policies.sql`
- `supabase/migrations/20260325100000_sensitive_visibility_and_document_classification.sql`

## Tables

### public.hr_items

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `project_stage_id` | `uuid` | yes |   | no |
| `estimate_work_id` | `uuid` | yes |   | no |
| `task_id` | `uuid` | yes |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | yes |   | no |
| `compensation_type` | `text` | no | `'fixed'` | no |
| `planned_cost_cents` | `bigint` | yes |   | no |
| `actual_cost_cents` | `bigint` | yes |   | no |
| `status` | `text` | no | `'planned'` | no |
| `start_at` | `timestamptz` | yes |   | no |
| `end_at` | `timestamptz` | yes |   | no |
| `created_by` | `uuid` | no |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |
| `estimate_resource_line_id` | `uuid` | yes |   | no |

Constraints:
- unnamed check (expression `compensation_type in ('hourly', 'daily', 'fixed')`)
- unnamed check (expression `planned_cost_cents is null or planned_cost_cents >= 0`)
- unnamed check (expression `actual_cost_cents is null or actual_cost_cents >= 0`)
- unnamed check (expression `status in ('planned', 'in_progress', 'completed', 'cancelled')`)

Indexes:
- `idx_hr_items_project_id` on (`project_id`)
- `idx_hr_items_project_stage_id` on (`project_stage_id`)
- `idx_hr_items_estimate_work_id` on (`estimate_work_id`)
- `idx_hr_items_task_id` on (`task_id`)
- `idx_hr_items_estimate_resource_line_id_unique` on (`estimate_resource_line_id`), unique, where `estimate_resource_line_id is not null`

Triggers:
- `set_hr_items_updated_at`: before update, executes `public.set_updated_at()`
- `enforce_hr_item_estimate_lineage_scope`: before insert or update of project_id, estimate_work_id, estimate_resource_line_id, task_id, executes `public.enforce_hr_item_estimate_lineage_scope()`

### public.hr_item_assignees

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `hr_item_id` | `uuid` | no |   | no |
| `profile_id` | `uuid` | no |   | no |
| `role_label` | `text` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed unique (columns `hr_item_id`, `profile_id`)

Indexes:
- `idx_hr_item_assignees_hr_item_id` on (`hr_item_id`)
- `idx_hr_item_assignees_profile_id` on (`profile_id`)

### public.hr_payments

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `hr_item_id` | `uuid` | yes |   | no |
| `paid_to_profile_id` | `uuid` | yes |   | no |
| `amount_cents` | `bigint` | no |   | no |
| `status` | `text` | no | `'planned'` | no |
| `paid_at` | `timestamptz` | yes |   | no |
| `notes` | `text` | yes |   | no |
| `created_by` | `uuid` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `amount_cents >= 0`)
- unnamed check (expression `status in ('planned', 'paid', 'cancelled')`)

Indexes:
- `idx_hr_payments_project_id` on (`project_id`)
- `idx_hr_payments_hr_item_id` on (`hr_item_id`)
- `idx_hr_payments_paid_to_profile_id` on (`paid_to_profile_id`)

## Relations

| From | To | On Delete | Source |
| --- | --- | --- | --- |
| `public.hr_items(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_items(project_stage_id)` | `public.project_stages(id)` | `set` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_items(estimate_work_id)` | `public.estimate_works(id)` | `set` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_items(task_id)` | `public.tasks(id)` | `set` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_items(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_item_assignees(hr_item_id)` | `public.hr_items(id)` | `cascade` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_item_assignees(profile_id)` | `public.profiles(id)` | `cascade` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_payments(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_payments(hr_item_id)` | `public.hr_items(id)` | `set null` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_payments(paid_to_profile_id)` | `public.profiles(id)` | `set null` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_payments(created_by)` | `public.profiles(id)` | `set null` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_items(estimate_resource_line_id)` | `public.estimate_resource_lines(id)` | `set null` | `supabase/migrations/20260330160000_wave2_hr_lineage_and_projection_uniqueness.sql` |

## Functions

| Function | Returns | Auth Execute | Kind | Source |
| --- | --- | --- | --- | --- |
| `public.get_hr_operational_summary(uuid, integer, integer)` | `jsonb` | yes | `rpc` | `supabase/migrations/20260406184500_track1_hr_operational_summary_role_gate.sql` |

## RLS and Grants

### public.hr_items

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `hr_items_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id) and created_by = auth.uid()`
  - `hr_items_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `hr_items_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`
  - `hr_items_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id) and public.can_view_sensitive_detail(project_id)`

### public.hr_item_assignees

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `hr_item_assignees_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.hr_items hi where hi.id = hr_item_id and public.can_access_project(hi.project_id) )`
  - `hr_item_assignees_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.hr_items hi where hi.id = hr_item_id and public.can_write_project_content(hi.project_id) )`
  - `hr_item_assignees_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.hr_items hi where hi.id = hr_item_id and public.can_write_project_content(hi.project_id) )`
    with check: `exists ( select 1 from public.hr_items hi where hi.id = hr_item_id and public.can_write_project_content(hi.project_id) )`
  - `hr_item_assignees_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.hr_items hi where hi.id = hr_item_id and public.can_write_project_content(hi.project_id) )`

### public.hr_payments

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `hr_payments_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id) and (created_by is null or created_by = auth.uid())`
  - `hr_payments_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `hr_payments_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`
  - `hr_payments_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id) and public.can_view_sensitive_detail(project_id)`

