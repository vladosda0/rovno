<!-- Generated file. Read-only. Regenerate from rovno-db. -->
<!-- Secondary summary view. Structured JSON and mirrored SQL are authoritative over this markdown. -->

# Templates Contract

Generated secondary summary view for a derived contract bundle.
Mirrored SQL and normalized JSON remain authoritative over this markdown.

## Source Migrations

- `supabase/migrations/20260511120000_system_resource_articles_and_unit_conversions.sql`
- `supabase/migrations/20260512132310_estimate_templates_schema.sql`
- `supabase/migrations/20260512132330_contractor_profiles_schema.sql`
- `supabase/migrations/20260512132320_template_rls.sql`
- `supabase/migrations/20260512132340_template_rpcs.sql`
- `supabase/migrations/20260512140000_template_check_constraints_and_apply_rpc_hardening.sql`

## Tables

### public.system_resource_articles

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `rovno_sku` | `text` | no |   | no |
| `name` | `text` | no |   | no |
| `category_path` | `text` | no |   | no |
| `unit_display` | `text` | no |   | no |
| `unit_original` | `text` | no |   | no |
| `conversion_factor` | `numeric(14,4)` | no | `1` | no |
| `okpd2_code` | `text` | yes |   | no |
| `source` | `text` | no | `'fgis_ksr'` | no |
| `source_version` | `text` | yes |   | no |
| `archived` | `boolean` | no | `false` | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- `system_resource_articles_rovno_sku_nonempty` check (expression `length(trim(rovno_sku)) > 0`)
- `system_resource_articles_name_nonempty` check (expression `length(trim(name)) > 0`)
- `system_resource_articles_category_path_nonempty` check (expression `length(trim(category_path)) > 0`)
- `system_resource_articles_unit_factor_positive` check (expression `conversion_factor > 0`)

Indexes:
- `idx_system_resource_articles_rovno_sku` on (`rovno_sku`)
- `idx_system_resource_articles_name` on (`name`)
- `idx_system_resource_articles_category_path` on (`category_path text_pattern_ops`)
- `idx_system_resource_articles_source_version` on (`source_version`)
- `idx_system_resource_articles_archived` on (`archived`), where `archived = false`

Triggers:
- `set_system_resource_articles_updated_at`: before update, executes `public.set_updated_at()`

### public.unit_conversions

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `unit_original` | `text` | no |   | yes |
| `unit_display` | `text` | no |   | no |
| `factor` | `numeric(14,4)` | no |   | no |

Constraints:
- `unit_conversions_unit_display_nonempty` check (expression `length(trim(unit_display)) > 0`)
- `unit_conversions_factor_positive` check (expression `factor > 0`)

### public.estimate_templates

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `owner_kind` | `text` | no |   | no |
| `owner_id` | `uuid` | yes |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | no | `''` | no |
| `scope` | `text` | no | `'general'` | no |
| `cover_image_url` | `text` | yes |   | no |
| `published_to_public` | `boolean` | no | `false` | no |
| `contact_block` | `jsonb` | yes |   | no |
| `source` | `text` | no | `'user'` | no |
| `source_version` | `text` | yes |   | no |
| `created_by` | `uuid` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `owner_kind in ('system','org','profile')`)
- unnamed check (expression `scope in ('ИЖС','ремонт','ландшафт','баня','гараж','инженерка','коммерческое','general')`)
- unnamed check (expression `source in ('system','user','imported_xlsx')`)
- `estimate_templates_owner_id_consistency` check (expression `(owner_kind = 'system' and owner_id is null) or (owner_kind = 'org' and owner_id is not null) or (owner_kind = 'profile' and owner_id is not null)`)
- `estimate_templates_title_nonempty` check (expression `length(trim(title)) > 0`)

Indexes:
- `idx_estimate_templates_owner` on (`owner_kind`, `owner_id`)
- `idx_estimate_templates_scope` on (`scope`)
- `idx_estimate_templates_published` on (`published_to_public`), where `published_to_public = true`
- `estimate_templates_system_singleton` on (`owner_kind`), unique, where `owner_kind = 'system'`

Triggers:
- `set_estimate_templates_updated_at`: before update, executes `public.set_updated_at()`

### public.template_stages

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `estimate_template_id` | `uuid` | no |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | no | `''` | no |
| `scope_tag` | `text` | no | `'general'` | no |
| `sort_hint` | `integer` | no | `100` | no |
| `parameter_definitions` | `jsonb` | no | `'[]'::jsonb` | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- `template_stages_title_nonempty` check (expression `length(trim(title)) > 0`)
- `template_stages_sort_hint_positive` check (expression `sort_hint > 0`)
- `template_stages_scope_tag_enum` check (expression `scope_tag in ('ИЖС','ремонт','ландшафт','баня','гараж','инженерка','коммерческое','general')`)

Indexes:
- `idx_template_stages_template` on (`estimate_template_id`)

Triggers:
- `set_template_stages_updated_at`: before update, executes `public.set_updated_at()`

### public.template_works

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `template_stage_id` | `uuid` | no |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | no | `''` | no |
| `sort_hint` | `integer` | no | `100` | no |
| `parameter_definitions` | `jsonb` | no | `'[]'::jsonb` | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- `template_works_title_nonempty` check (expression `length(trim(title)) > 0`)
- `template_works_sort_hint_positive` check (expression `sort_hint > 0`)

Indexes:
- `idx_template_works_stage` on (`template_stage_id`)

Triggers:
- `set_template_works_updated_at`: before update, executes `public.set_updated_at()`

### public.template_resource_lines

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `template_work_id` | `uuid` | no |   | no |
| `system_resource_article_id` | `uuid` | yes |   | no |
| `title` | `text` | no |   | no |
| `resource_type` | `text` | no |   | no |
| `unit_display` | `text` | no |   | no |
| `qty_default` | `numeric(14,3)` | no | `1` | no |
| `default_cost_unit_cents` | `bigint` | yes |   | no |
| `default_markup_bps` | `integer` | yes |   | no |
| `default_discount_bps` | `integer` | yes |   | no |
| `sort_hint` | `integer` | no | `100` | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `resource_type in ('material','tool','labor','subcontractor','overhead','other')`)
- unnamed check (expression `qty_default >= 0`)
- unnamed check (expression `default_cost_unit_cents is null or default_cost_unit_cents >= 0`)
- unnamed check (expression `default_markup_bps is null or (default_markup_bps >= 0 and default_markup_bps <= 10000)`)
- unnamed check (expression `default_discount_bps is null or (default_discount_bps >= 0 and default_discount_bps <= 10000)`)
- `template_resource_lines_title_nonempty` check (expression `length(trim(title)) > 0`)
- `template_resource_lines_sort_hint_positive` check (expression `sort_hint > 0`)

Indexes:
- `idx_template_resource_lines_work` on (`template_work_id`)
- `idx_template_resource_lines_article` on (`system_resource_article_id`), where `system_resource_article_id is not null`

Triggers:
- `set_template_resource_lines_updated_at`: before update, executes `public.set_updated_at()`

### public.contractor_profiles

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `org_id` | `uuid` | no |   | no |
| `display_name` | `text` | no |   | no |
| `contacts` | `jsonb` | no | `'{}'::jsonb` | no |
| `region` | `text` | yes |   | no |
| `specializations` | `text[]` | no | `'{}'` | no |
| `experience_years` | `integer` | yes |   | no |
| `avatar_url` | `text` | yes |   | no |
| `description` | `text` | yes |   | no |
| `status` | `text` | no | `'draft'` | no |
| `moderated_at` | `timestamptz` | yes |   | no |
| `moderated_by` | `uuid` | yes |   | no |
| `created_by` | `uuid` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `status in ('draft','pending_moderation','published','archived')`)
- `contractor_profiles_display_name_nonempty` check (expression `length(trim(display_name)) > 0`)
- `contractor_profiles_experience_years_nonnegative` check (expression `experience_years is null or experience_years >= 0`)

Indexes:
- `idx_contractor_profiles_one_per_org` on (`org_id`), unique
- `idx_contractor_profiles_status` on (`status`)
- `idx_contractor_profiles_published` on (`status`), where `status = 'published'`

Triggers:
- `set_contractor_profiles_updated_at`: before update, executes `public.set_updated_at()`

## Relations

| From | To | On Delete | Source |
| --- | --- | --- | --- |
| `public.estimate_templates(created_by)` | `public.profiles(id)` | `set null` | `supabase/migrations/20260512132310_estimate_templates_schema.sql` |
| `public.template_stages(estimate_template_id)` | `public.estimate_templates(id)` | `cascade` | `supabase/migrations/20260512132310_estimate_templates_schema.sql` |
| `public.template_works(template_stage_id)` | `public.template_stages(id)` | `cascade` | `supabase/migrations/20260512132310_estimate_templates_schema.sql` |
| `public.template_resource_lines(template_work_id)` | `public.template_works(id)` | `cascade` | `supabase/migrations/20260512132310_estimate_templates_schema.sql` |
| `public.template_resource_lines(system_resource_article_id)` | `public.system_resource_articles(id)` | `set null` | `supabase/migrations/20260512132310_estimate_templates_schema.sql` |
| `public.contractor_profiles(org_id)` | `public.organizations(id)` | `cascade` | `supabase/migrations/20260512132330_contractor_profiles_schema.sql` |
| `public.contractor_profiles(moderated_by)` | `public.profiles(id)` | `set null` | `supabase/migrations/20260512132330_contractor_profiles_schema.sql` |
| `public.contractor_profiles(created_by)` | `public.profiles(id)` | `set null` | `supabase/migrations/20260512132330_contractor_profiles_schema.sql` |

## Functions

| Function | Returns | Auth Execute | Kind | Source |
| --- | --- | --- | --- | --- |
| `public.can_read_template(text, uuid)` | `boolean` | yes | `rpc` | `supabase/migrations/20260512132320_template_rls.sql` |
| `public.can_manage_template(text, uuid)` | `boolean` | yes | `rpc` | `supabase/migrations/20260512132320_template_rls.sql` |
| `public.list_estimate_templates(text)` | `table ( id uuid, owner_kind text, owner_label text, title text, description text, scope text, published_to_public boolean, cover_image_url text, stage_count integer, is_manageable boolean, updated_at timestamptz )` | yes | `rpc` | `supabase/migrations/20260512132340_template_rpcs.sql` |
| `public.get_estimate_template_detail(uuid)` | `jsonb` | yes | `rpc` | `supabase/migrations/20260512132340_template_rpcs.sql` |
| `public.apply_template_stage_to_estimate(uuid, uuid, integer)` | `jsonb` | yes | `rpc` | `supabase/migrations/20260512140000_template_check_constraints_and_apply_rpc_hardening.sql` |

## RLS and Grants

### public.system_resource_articles

- RLS enabled: yes
- Authenticated grants: `select`
- Policies:
  - `system_resource_articles_select` for `select` to `authenticated`
    using: `true`

### public.unit_conversions

- RLS enabled: yes
- Authenticated grants: `select`
- Policies:
  - `unit_conversions_select` for `select` to `authenticated`
    using: `true`

### public.estimate_templates

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `estimate_templates_select` for `select` to `authenticated`
    using: `public.can_read_template(owner_kind, owner_id)`
  - `estimate_templates_insert` for `insert` to `authenticated`
    with check: `public.can_manage_template(owner_kind, owner_id)`
  - `estimate_templates_update` for `update` to `authenticated`
    using: `public.can_manage_template(owner_kind, owner_id)`
    with check: `public.can_manage_template(owner_kind, owner_id)`
  - `estimate_templates_delete` for `delete` to `authenticated`
    using: `public.can_manage_template(owner_kind, owner_id)`

### public.template_stages

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `template_stages_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.estimate_templates et where et.id = template_stages.estimate_template_id and public.can_read_template(et.owner_kind, et.owner_id) )`
  - `template_stages_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.estimate_templates et where et.id = template_stages.estimate_template_id and public.can_manage_template(et.owner_kind, et.owner_id) )`
  - `template_stages_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.estimate_templates et where et.id = template_stages.estimate_template_id and public.can_manage_template(et.owner_kind, et.owner_id) )`
    with check: `exists ( select 1 from public.estimate_templates et where et.id = template_stages.estimate_template_id and public.can_manage_template(et.owner_kind, et.owner_id) )`
  - `template_stages_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.estimate_templates et where et.id = template_stages.estimate_template_id and public.can_manage_template(et.owner_kind, et.owner_id) )`

### public.template_works

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `template_works_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.template_stages ts join public.estimate_templates et on et.id = ts.estimate_template_id where ts.id = template_works.template_stage_id and public.can_read_template(et.owner_kind, et.owner_id) )`
  - `template_works_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.template_stages ts join public.estimate_templates et on et.id = ts.estimate_template_id where ts.id = template_works.template_stage_id and public.can_manage_template(et.owner_kind, et.owner_id) )`
  - `template_works_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.template_stages ts join public.estimate_templates et on et.id = ts.estimate_template_id where ts.id = template_works.template_stage_id and public.can_manage_template(et.owner_kind, et.owner_id) )`
    with check: `exists ( select 1 from public.template_stages ts join public.estimate_templates et on et.id = ts.estimate_template_id where ts.id = template_works.template_stage_id and public.can_manage_template(et.owner_kind, et.owner_id) )`
  - `template_works_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.template_stages ts join public.estimate_templates et on et.id = ts.estimate_template_id where ts.id = template_works.template_stage_id and public.can_manage_template(et.owner_kind, et.owner_id) )`

### public.template_resource_lines

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `template_resource_lines_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.template_works tw join public.template_stages ts on ts.id = tw.template_stage_id join public.estimate_templates et on et.id = ts.estimate_template_id where tw.id = template_resource_lines.template_work_id and public.can_read_template(et.owner_kind, et.owner_id) )`
  - `template_resource_lines_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.template_works tw join public.template_stages ts on ts.id = tw.template_stage_id join public.estimate_templates et on et.id = ts.estimate_template_id where tw.id = template_resource_lines.template_work_id and public.can_manage_template(et.owner_kind, et.owner_id) )`
  - `template_resource_lines_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.template_works tw join public.template_stages ts on ts.id = tw.template_stage_id join public.estimate_templates et on et.id = ts.estimate_template_id where tw.id = template_resource_lines.template_work_id and public.can_manage_template(et.owner_kind, et.owner_id) )`
    with check: `exists ( select 1 from public.template_works tw join public.template_stages ts on ts.id = tw.template_stage_id join public.estimate_templates et on et.id = ts.estimate_template_id where tw.id = template_resource_lines.template_work_id and public.can_manage_template(et.owner_kind, et.owner_id) )`
  - `template_resource_lines_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.template_works tw join public.template_stages ts on ts.id = tw.template_stage_id join public.estimate_templates et on et.id = ts.estimate_template_id where tw.id = template_resource_lines.template_work_id and public.can_manage_template(et.owner_kind, et.owner_id) )`

### public.contractor_profiles

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `contractor_profiles_select` for `select` to `authenticated`
    using: `status = 'published' or public.is_org_member(org_id)`
  - `contractor_profiles_insert` for `insert` to `authenticated`
    with check: `public.can_manage_org(org_id)`
  - `contractor_profiles_update` for `update` to `authenticated`
    using: `public.can_manage_org(org_id)`
    with check: `public.can_manage_org(org_id)`
  - `contractor_profiles_delete` for `delete` to `authenticated`
    using: `public.can_manage_org(org_id)`

