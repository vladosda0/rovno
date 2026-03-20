<!-- Generated file. Read-only. Regenerate from rovno-db. -->
<!-- Secondary summary view. Structured JSON and mirrored SQL are authoritative over this markdown. -->

# Planning Contract

Generated secondary summary view for a derived contract bundle.
Mirrored SQL and normalized JSON remain authoritative over this markdown.

## Source Migrations

- `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql`
- `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql`
- `supabase/migrations/20260306162500_estimates_core.sql`
- `supabase/migrations/20260306164000_hr_domain.sql`
- `supabase/migrations/20260313183000_tasks_estimate_work_lineage.sql`
- `supabase/migrations/20260320110000_task_final_media_contract.sql`
- `supabase/migrations/20260306170000_grants_rls_enablement_and_policies.sql`

## Tables

### public.project_stages

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | no | `''` | no |
| `sort_order` | `integer` | no |   | no |
| `status` | `text` | no | `'open'` | no |
| `discount_bps` | `integer` | no | `0` | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `sort_order > 0`)
- unnamed check (expression `status in ('open', 'completed', 'archived')`)
- unnamed check (expression `discount_bps >= 0`)
- `project_stages_project_id_sort_order_key` unique (using index `idx_project_stages_sort_order`)

Indexes:
- `idx_project_stages_project_id` on (`project_id`)
- `idx_project_stages_sort_order` on (`project_id`, `sort_order`), unique, attached to `project_stages_project_id_sort_order_key`

Triggers:
- `set_project_stages_updated_at`: before update, executes `public.set_updated_at()`

### public.tasks

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `stage_id` | `uuid` | no |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | no | `''` | no |
| `status` | `text` | no | `'not_started'` | no |
| `assignee_profile_id` | `uuid` | yes |   | no |
| `created_by` | `uuid` | no |   | no |
| `start_at` | `timestamptz` | yes |   | no |
| `due_at` | `timestamptz` | yes |   | no |
| `completed_at` | `timestamptz` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `status in ('not_started', 'in_progress', 'done', 'blocked')`)

Indexes:
- `idx_tasks_project_id` on (`project_id`)
- `idx_tasks_stage_id` on (`stage_id`)
- `idx_tasks_assignee_profile_id` on (`assignee_profile_id`)

Triggers:
- `set_tasks_updated_at`: before update, executes `public.set_updated_at()`

### public.task_comments

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `task_id` | `uuid` | no |   | no |
| `author_profile_id` | `uuid` | no |   | no |
| `body` | `text` | no |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

### public.task_checklist_items

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `task_id` | `uuid` | no |   | no |
| `title` | `text` | no |   | no |
| `is_done` | `boolean` | no | `false` | no |
| `procurement_item_id` | `uuid` | yes |   | no |
| `estimate_resource_line_id` | `uuid` | yes |   | no |
| `estimate_work_id` | `uuid` | yes |   | no |
| `sort_order` | `integer` | no |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `sort_order > 0`)
- unnamed unique (columns `task_id`, `sort_order`)

Indexes:
- `idx_task_checklist_items_task_id` on (`task_id`)
- `idx_task_checklist_items_procurement_item_id` on (`procurement_item_id`)
- `idx_task_checklist_items_estimate_resource_line_id` on (`estimate_resource_line_id`)
- `idx_task_checklist_items_estimate_work_id` on (`estimate_work_id`)

Triggers:
- `set_task_checklist_items_updated_at`: before update, executes `public.set_updated_at()`

## Relations

| From | To | On Delete | Source |
| --- | --- | --- | --- |
| `public.project_stages(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql` |
| `public.projects(current_stage_id)` | `public.project_stages(id)` | `set null` | `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql` |
| `public.tasks(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql` |
| `public.tasks(stage_id)` | `public.project_stages(id)` | `restrict` | `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql` |
| `public.tasks(assignee_profile_id)` | `public.profiles(id)` | `set` | `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql` |
| `public.tasks(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql` |
| `public.task_comments(task_id)` | `public.tasks(id)` | `cascade` | `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql` |
| `public.task_comments(author_profile_id)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql` |
| `public.estimate_works(project_stage_id)` | `public.project_stages(id)` | `set` | `supabase/migrations/20260306162500_estimates_core.sql` |
| `public.procurement_items(task_id)` | `public.tasks(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.task_checklist_items(task_id)` | `public.tasks(id)` | `cascade` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.task_checklist_items(procurement_item_id)` | `public.procurement_items(id)` | `set null` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.task_checklist_items(estimate_resource_line_id)` | `public.estimate_resource_lines(id)` | `set null` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.task_checklist_items(estimate_work_id)` | `public.estimate_works(id)` | `set null` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.hr_items(project_stage_id)` | `public.project_stages(id)` | `set null` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.hr_items(task_id)` | `public.tasks(id)` | `set null` | `supabase/migrations/20260306164000_hr_domain.sql` |
| `public.tasks(estimate_work_id)` | `public.estimate_works(id)` | `set null` | `supabase/migrations/20260313183000_tasks_estimate_work_lineage.sql` |
| `public.project_media_upload_intents(task_id)` | `public.tasks(id)` | `set null` | `supabase/migrations/20260320110000_task_final_media_contract.sql` |
| `public.project_media(task_id)` | `public.tasks(id)` | `set null` | `supabase/migrations/20260320110000_task_final_media_contract.sql` |

## Functions

- None

## RLS and Grants

### public.project_stages

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `project_stages_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`
  - `project_stages_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id)`
  - `project_stages_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `project_stages_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`

### public.tasks

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `tasks_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`
  - `tasks_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id) and created_by = auth.uid()`
  - `tasks_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `tasks_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`

### public.task_comments

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `task_comments_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.tasks t where t.id = task_id and public.can_access_project(t.project_id) )`
  - `task_comments_insert` for `insert` to `authenticated`
    with check: `author_profile_id = auth.uid() and exists ( select 1 from public.tasks t where t.id = task_id and public.can_write_project_content(t.project_id) )`
  - `task_comments_update` for `update` to `authenticated`
    using: `author_profile_id = auth.uid() or exists ( select 1 from public.tasks t where t.id = task_id and public.can_manage_project(t.project_id) )`
    with check: `author_profile_id = auth.uid() or exists ( select 1 from public.tasks t where t.id = task_id and public.can_manage_project(t.project_id) )`
  - `task_comments_delete` for `delete` to `authenticated`
    using: `author_profile_id = auth.uid() or exists ( select 1 from public.tasks t where t.id = task_id and public.can_manage_project(t.project_id) )`

### public.task_checklist_items

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `task_checklist_items_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.tasks t where t.id = task_id and public.can_access_project(t.project_id) )`
  - `task_checklist_items_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.tasks t where t.id = task_id and public.can_write_project_content(t.project_id) )`
  - `task_checklist_items_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.tasks t where t.id = task_id and public.can_write_project_content(t.project_id) )`
    with check: `exists ( select 1 from public.tasks t where t.id = task_id and public.can_write_project_content(t.project_id) )`
  - `task_checklist_items_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.tasks t where t.id = task_id and public.can_write_project_content(t.project_id) )`

