<!-- Generated file. Read-only. Regenerate from rovno-db. -->
<!-- Secondary summary view. Structured JSON and mirrored SQL are authoritative over this markdown. -->

# Procurement Inventory Contract

Generated secondary summary view for a derived contract bundle.
Mirrored SQL and normalized JSON remain authoritative over this markdown.

## Source Migrations

- `supabase/migrations/20260306163000_inventory_foundation.sql`
- `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql`
- `supabase/migrations/20260403191500_phase6_operational_summary_subcontractor_and_client_amounts.sql`
- `supabase/migrations/20260306170000_grants_rls_enablement_and_policies.sql`
- `supabase/migrations/20260325100000_sensitive_visibility_and_document_classification.sql`

## Tables

### public.inventory_items

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `title` | `text` | no |   | no |
| `sku` | `text` | yes |   | no |
| `unit` | `text` | no |   | no |
| `notes` | `text` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Indexes:
- `idx_inventory_items_project_id` on (`project_id`)

Triggers:
- `set_inventory_items_updated_at`: before update, executes `public.set_updated_at()`

### public.inventory_locations

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Indexes:
- `idx_inventory_locations_project_id` on (`project_id`)

### public.inventory_balances

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `inventory_item_id` | `uuid` | no |   | no |
| `inventory_location_id` | `uuid` | yes |   | no |
| `quantity` | `numeric(14,3)` | no | `0` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `quantity >= 0`)
- `inventory_balances_project_item_location_key` unique (columns `project_id`, `inventory_item_id`, `inventory_location_id`)

Indexes:
- `idx_inventory_balances_project_id` on (`project_id`)
- `idx_inventory_balances_inventory_item_id` on (`inventory_item_id`)
- `idx_inventory_balances_inventory_location_id` on (`inventory_location_id`)

Triggers:
- `set_inventory_balances_updated_at`: before update, executes `public.set_updated_at()`

### public.procurement_items

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `estimate_resource_line_id` | `uuid` | yes |   | no |
| `task_id` | `uuid` | yes |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | yes |   | no |
| `category` | `text` | yes |   | no |
| `quantity` | `numeric(14,3)` | no |   | no |
| `unit` | `text` | yes |   | no |
| `planned_unit_price_cents` | `bigint` | yes |   | no |
| `planned_total_price_cents` | `bigint` | yes |   | no |
| `status` | `text` | no | `'requested'` | no |
| `created_by` | `uuid` | no |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `quantity >= 0`)
- unnamed check (expression `planned_unit_price_cents is null or planned_unit_price_cents >= 0`)
- unnamed check (expression `planned_total_price_cents is null or planned_total_price_cents >= 0`)
- unnamed check (expression `status in ('requested', 'ordered', 'partially_received', 'received', 'cancelled')`)

Indexes:
- `idx_procurement_items_project_id` on (`project_id`)
- `idx_procurement_items_estimate_resource_line_id` on (`estimate_resource_line_id`)
- `idx_procurement_items_task_id` on (`task_id`)
- `idx_procurement_items_estimate_resource_line_id_unique` on (`estimate_resource_line_id`), unique, where `estimate_resource_line_id is not null`

Triggers:
- `set_procurement_items_updated_at`: before update, executes `public.set_updated_at()`

### public.orders

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `supplier_name` | `text` | no |   | no |
| `supplier_contact` | `text` | yes |   | no |
| `status` | `text` | no | `'draft'` | no |
| `ordered_at` | `timestamptz` | yes |   | no |
| `delivery_due_at` | `timestamptz` | yes |   | no |
| `created_by` | `uuid` | no |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `status in ('draft', 'placed', 'partially_received', 'received', 'cancelled')`)

Indexes:
- `idx_orders_project_id` on (`project_id`)

Triggers:
- `set_orders_updated_at`: before update, executes `public.set_updated_at()`

### public.order_lines

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `order_id` | `uuid` | no |   | no |
| `procurement_item_id` | `uuid` | yes |   | no |
| `title` | `text` | no |   | no |
| `quantity` | `numeric(14,3)` | no |   | no |
| `unit` | `text` | yes |   | no |
| `unit_price_cents` | `bigint` | yes |   | no |
| `total_price_cents` | `bigint` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `quantity >= 0`)
- unnamed check (expression `unit_price_cents is null or unit_price_cents >= 0`)
- unnamed check (expression `total_price_cents is null or total_price_cents >= 0`)

Indexes:
- `idx_order_lines_order_id` on (`order_id`)
- `idx_order_lines_procurement_item_id` on (`procurement_item_id`)

### public.inventory_movements

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `inventory_item_id` | `uuid` | no |   | no |
| `inventory_location_id` | `uuid` | yes |   | no |
| `order_line_id` | `uuid` | yes |   | no |
| `procurement_item_id` | `uuid` | yes |   | no |
| `movement_type` | `text` | no |   | no |
| `delta_qty` | `numeric(14,3)` | no |   | no |
| `notes` | `text` | yes |   | no |
| `created_by` | `uuid` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `movement_type in ('receipt', 'issue', 'transfer', 'adjustment')`)

Indexes:
- `idx_inventory_movements_project_id` on (`project_id`)
- `idx_inventory_movements_inventory_item_id` on (`inventory_item_id`)
- `idx_inventory_movements_inventory_location_id` on (`inventory_location_id`)
- `idx_inventory_movements_order_line_id` on (`order_line_id`)
- `idx_inventory_movements_procurement_item_id` on (`procurement_item_id`)

Triggers:
- `on_inventory_movements_sync_balances`: after insert or update or delete, executes `public.sync_inventory_balances()`

## Relations

| From | To | On Delete | Source |
| --- | --- | --- | --- |
| `public.inventory_items(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306163000_inventory_foundation.sql` |
| `public.inventory_locations(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306163000_inventory_foundation.sql` |
| `public.inventory_balances(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306163000_inventory_foundation.sql` |
| `public.inventory_balances(inventory_item_id)` | `public.inventory_items(id)` | `cascade` | `supabase/migrations/20260306163000_inventory_foundation.sql` |
| `public.inventory_balances(inventory_location_id)` | `public.inventory_locations(id)` | `cascade` | `supabase/migrations/20260306163000_inventory_foundation.sql` |
| `public.procurement_items(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.procurement_items(estimate_resource_line_id)` | `public.estimate_resource_lines(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.procurement_items(task_id)` | `public.tasks(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.procurement_items(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.orders(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.orders(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.order_lines(order_id)` | `public.orders(id)` | `cascade` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.order_lines(procurement_item_id)` | `public.procurement_items(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.inventory_movements(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.inventory_movements(inventory_item_id)` | `public.inventory_items(id)` | `cascade` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.inventory_movements(inventory_location_id)` | `public.inventory_locations(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.inventory_movements(order_line_id)` | `public.order_lines(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.inventory_movements(procurement_item_id)` | `public.procurement_items(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.inventory_movements(created_by)` | `public.profiles(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |
| `public.task_checklist_items(procurement_item_id)` | `public.procurement_items(id)` | `set` | `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql` |

## Functions

| Function | Returns | Auth Execute | Kind | Source |
| --- | --- | --- | --- | --- |
| `public.apply_inventory_balance_delta(uuid, uuid, uuid, numeric)` | `void` | no | `helper` | `supabase/migrations/20260306163000_inventory_foundation.sql` |
| `public.sync_inventory_balances()` | `trigger` | no | `trigger_helper` | `supabase/migrations/20260306163000_inventory_foundation.sql` |
| `public.get_procurement_operational_summary(uuid, integer, integer)` | `jsonb` | yes | `rpc` | `supabase/migrations/20260403191500_phase6_operational_summary_subcontractor_and_client_amounts.sql` |

## RLS and Grants

### public.inventory_items

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `inventory_items_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`
  - `inventory_items_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id)`
  - `inventory_items_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `inventory_items_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`

### public.inventory_locations

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `inventory_locations_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`
  - `inventory_locations_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id)`
  - `inventory_locations_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `inventory_locations_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`

### public.inventory_balances

- RLS enabled: yes
- Authenticated grants: `select`
- Policies:
  - `inventory_balances_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`

### public.procurement_items

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `procurement_items_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id) and created_by = auth.uid()`
  - `procurement_items_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `procurement_items_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`
  - `procurement_items_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id) and public.can_view_sensitive_detail(project_id)`

### public.orders

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `orders_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`
  - `orders_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id) and created_by = auth.uid()`
  - `orders_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `orders_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`

### public.order_lines

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `order_lines_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.orders o where o.id = order_id and public.can_write_project_content(o.project_id) )`
  - `order_lines_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.orders o where o.id = order_id and public.can_write_project_content(o.project_id) )`
    with check: `exists ( select 1 from public.orders o where o.id = order_id and public.can_write_project_content(o.project_id) )`
  - `order_lines_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.orders o where o.id = order_id and public.can_write_project_content(o.project_id) )`
  - `order_lines_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.orders o where o.id = order_id and public.can_access_project(o.project_id) and public.can_view_sensitive_detail(o.project_id) )`

### public.inventory_movements

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `inventory_movements_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`
  - `inventory_movements_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id) and (created_by is null or created_by = auth.uid())`
  - `inventory_movements_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `inventory_movements_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`

