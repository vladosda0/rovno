<!-- Generated file. Read-only. Regenerate from rovno-db. -->
<!-- Secondary summary view. Structured JSON and mirrored SQL are authoritative over this markdown. -->

# User Catalogs Contract

Generated secondary summary view for a derived contract bundle.
Mirrored SQL and normalized JSON remain authoritative over this markdown.

## Source Migrations

- `supabase/migrations/20260706140000_user_catalogs.sql`

## Tables

### public.user_catalogs

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `owner_profile_id` | `uuid` | no |   | no |
| `name` | `text` | no |   | no |
| `source_filename` | `text` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `char_length(btrim(name)) between 1 and 200`)
- unnamed check (expression `source_filename is null or char_length(source_filename) <= 255`)

Indexes:
- `idx_user_catalogs_owner` on (`owner_profile_id`, `created_at desc`)

Triggers:
- `set_user_catalogs_updated_at`: before update, executes `public.set_updated_at()`

### public.user_catalog_items

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `catalog_id` | `uuid` | no |   | no |
| `position` | `integer` | no | `0` | no |
| `name` | `text` | no |   | no |
| `unit` | `text` | no | `''` | no |
| `price_cents` | `bigint` | no | `0` | no |
| `resource_type` | `text` | no | `'material'` | no |
| `supplier_sku` | `text` | yes |   | no |
| `matched_article_id` | `uuid` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `char_length(btrim(name)) between 1 and 500`)
- unnamed check (expression `char_length(unit) <= 50`)
- unnamed check (expression `resource_type in ('material', 'tool', 'labor', 'subcontractor', 'overhead', 'other')`)
- unnamed check (expression `supplier_sku is null or char_length(supplier_sku) <= 100`)
- `user_catalog_items_price_cents_bounds` check (expression `price_cents between -1000000000000 and 1000000000000`)

Indexes:
- `idx_user_catalog_items_catalog` on (`catalog_id`, `position`)
- `idx_user_catalog_items_matched_article` on (`matched_article_id`)

Triggers:
- `set_user_catalog_items_updated_at`: before update, executes `public.set_updated_at()`

## Relations

| From | To | On Delete | Source |
| --- | --- | --- | --- |
| `public.user_catalogs(owner_profile_id)` | `public.profiles(id)` | `cascade` | `supabase/migrations/20260706140000_user_catalogs.sql` |
| `public.user_catalog_items(catalog_id)` | `public.user_catalogs(id)` | `cascade` | `supabase/migrations/20260706140000_user_catalogs.sql` |
| `public.user_catalog_items(matched_article_id)` | `public.system_resource_articles(id)` | `set null` | `supabase/migrations/20260706140000_user_catalogs.sql` |

## Functions

| Function | Returns | Auth Execute | Kind | Source |
| --- | --- | --- | --- | --- |
| `public.create_user_catalog(text, text, jsonb)` | `uuid` | yes | `rpc` | `supabase/migrations/20260706140000_user_catalogs.sql` |

## RLS and Grants

### public.user_catalogs

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `user_catalogs_select` for `select` to `authenticated`
    using: `owner_profile_id = auth.uid()`
  - `user_catalogs_insert` for `insert` to `authenticated`
    with check: `owner_profile_id = auth.uid()`
  - `user_catalogs_update` for `update` to `authenticated`
    using: `owner_profile_id = auth.uid()`
    with check: `owner_profile_id = auth.uid()`
  - `user_catalogs_delete` for `delete` to `authenticated`
    using: `owner_profile_id = auth.uid()`

### public.user_catalog_items

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `user_catalog_items_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.user_catalogs uc where uc.id = user_catalog_items.catalog_id and uc.owner_profile_id = auth.uid() )`
  - `user_catalog_items_insert` for `insert` to `authenticated`
    with check: `exists ( select 1 from public.user_catalogs uc where uc.id = user_catalog_items.catalog_id and uc.owner_profile_id = auth.uid() )`
  - `user_catalog_items_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.user_catalogs uc where uc.id = user_catalog_items.catalog_id and uc.owner_profile_id = auth.uid() )`
    with check: `exists ( select 1 from public.user_catalogs uc where uc.id = user_catalog_items.catalog_id and uc.owner_profile_id = auth.uid() )`
  - `user_catalog_items_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.user_catalogs uc where uc.id = user_catalog_items.catalog_id and uc.owner_profile_id = auth.uid() )`

