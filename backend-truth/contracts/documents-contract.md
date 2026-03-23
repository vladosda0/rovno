<!-- Generated file. Read-only. Regenerate from rovno-db. -->
<!-- Secondary summary view. Structured JSON and mirrored SQL are authoritative over this markdown. -->

# Documents Contract

Generated secondary summary view for a derived contract bundle.
Mirrored SQL and normalized JSON remain authoritative over this markdown.

## Source Migrations

- `supabase/migrations/20260306162000_storage_documents_and_media.sql`
- `supabase/migrations/20260317120000_storage_upload_intents.sql`
- `supabase/migrations/20260320110000_task_final_media_contract.sql`
- `supabase/migrations/20260306165500_auth_bootstrap_and_domain_rpc.sql`
- `supabase/migrations/20260317133000_storage_bucket_config_table.sql`
- `supabase/migrations/20260317121000_storage_upload_rpcs.sql`
- `supabase/migrations/20260323113000_finalize_media_bucket_ambiguity_fix.sql`
- `supabase/migrations/20260306170000_grants_rls_enablement_and_policies.sql`

## Tables

### public.storage_objects

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `bucket` | `text` | no |   | no |
| `object_path` | `text` | no |   | no |
| `filename` | `text` | no |   | no |
| `mime_type` | `text` | yes |   | no |
| `size_bytes` | `bigint` | yes |   | no |
| `checksum` | `text` | yes |   | no |
| `uploaded_by` | `uuid` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `size_bytes is null or size_bytes >= 0`)
- unnamed unique (columns `bucket`, `object_path`)

Indexes:
- `idx_storage_objects_uploaded_by` on (`uploaded_by`)

### public.documents

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `type` | `text` | no |   | no |
| `title` | `text` | no |   | no |
| `origin` | `text` | no | `'manual'` | no |
| `description` | `text` | yes |   | no |
| `created_by` | `uuid` | no |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `updated_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `origin in ('project_creation', 'uploaded', 'manual', 'ai_generated')`)

Indexes:
- `idx_documents_project_id` on (`project_id`)

Triggers:
- `set_documents_updated_at`: before update, executes `public.set_updated_at()`

### public.document_versions

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `document_id` | `uuid` | no |   | no |
| `storage_object_id` | `uuid` | yes |   | no |
| `version_number` | `integer` | no |   | no |
| `is_current` | `boolean` | no | `false` | no |
| `created_by` | `uuid` | no |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |

Constraints:
- unnamed check (expression `version_number > 0`)
- unnamed unique (columns `document_id`, `version_number`)

Indexes:
- `idx_document_versions_document_id` on (`document_id`)
- `idx_document_versions_current_per_document` on (`document_id`), unique, where `is_current = true`

### public.project_media

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `storage_object_id` | `uuid` | no |   | no |
| `uploaded_by` | `uuid` | yes |   | no |
| `media_type` | `text` | no |   | no |
| `caption` | `text` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `task_id` | `uuid` | yes |   | no |
| `is_final` | `boolean` | no | `false` | no |

Constraints:
- unnamed check (expression `not is_final or task_id is not null`)

Indexes:
- `idx_project_media_project_id` on (`project_id`)
- `idx_project_media_storage_object_id` on (`storage_object_id`)
- `idx_project_media_task_id` on (`task_id`)
- `idx_project_media_task_id_is_final` on (`task_id`, `is_final`)

### public.project_media_upload_intents

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `bucket` | `text` | no |   | no |
| `object_path` | `text` | no |   | no |
| `filename` | `text` | no |   | no |
| `mime_type` | `text` | yes |   | no |
| `size_bytes` | `bigint` | yes |   | no |
| `media_type` | `text` | no |   | no |
| `caption` | `text` | yes |   | no |
| `created_by` | `uuid` | no |   | no |
| `project_media_id` | `uuid` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `finalized_at` | `timestamptz` | yes |   | no |
| `task_id` | `uuid` | yes |   | no |
| `is_final` | `boolean` | no | `false` | no |

Constraints:
- unnamed check (expression `length(btrim(filename)) > 0 and filename !~ '[\\/]'`)
- unnamed check (expression `size_bytes is null or size_bytes >= 0`)
- unnamed check (expression `not is_final or task_id is not null`)

Indexes:
- `idx_project_media_upload_intents_task_id` on (`task_id`)
- `idx_project_media_upload_intents_task_id_is_final` on (`task_id`, `is_final`)

### public.document_upload_intents

| Column | Type | Nullable | Default | Primary Key |
| --- | --- | --- | --- | --- |
| `id` | `uuid` | no | `gen_random_uuid()` | yes |
| `project_id` | `uuid` | no |   | no |
| `type` | `text` | no |   | no |
| `title` | `text` | no |   | no |
| `description` | `text` | yes |   | no |
| `bucket` | `text` | no |   | no |
| `object_path` | `text` | no |   | no |
| `filename` | `text` | no |   | no |
| `mime_type` | `text` | yes |   | no |
| `size_bytes` | `bigint` | yes |   | no |
| `created_by` | `uuid` | no |   | no |
| `document_id` | `uuid` | yes |   | no |
| `created_at` | `timestamptz` | no | `now()` | no |
| `finalized_at` | `timestamptz` | yes |   | no |

Constraints:
- unnamed check (expression `length(btrim(filename)) > 0 and filename !~ '[\\/]'`)
- unnamed check (expression `size_bytes is null or size_bytes >= 0`)

## Relations

| From | To | On Delete | Source |
| --- | --- | --- | --- |
| `public.storage_objects(uploaded_by)` | `public.profiles(id)` | `set` | `supabase/migrations/20260306162000_storage_documents_and_media.sql` |
| `public.documents(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306162000_storage_documents_and_media.sql` |
| `public.documents(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260306162000_storage_documents_and_media.sql` |
| `public.document_versions(document_id)` | `public.documents(id)` | `cascade` | `supabase/migrations/20260306162000_storage_documents_and_media.sql` |
| `public.document_versions(storage_object_id)` | `public.storage_objects(id)` | `set` | `supabase/migrations/20260306162000_storage_documents_and_media.sql` |
| `public.document_versions(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260306162000_storage_documents_and_media.sql` |
| `public.project_media(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260306162000_storage_documents_and_media.sql` |
| `public.project_media(storage_object_id)` | `public.storage_objects(id)` | `cascade` | `supabase/migrations/20260306162000_storage_documents_and_media.sql` |
| `public.project_media(uploaded_by)` | `public.profiles(id)` | `set null` | `supabase/migrations/20260306162000_storage_documents_and_media.sql` |
| `public.project_media_upload_intents(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260317120000_storage_upload_intents.sql` |
| `public.project_media_upload_intents(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260317120000_storage_upload_intents.sql` |
| `public.project_media_upload_intents(project_media_id)` | `public.project_media(id)` | `set null` | `supabase/migrations/20260317120000_storage_upload_intents.sql` |
| `public.document_upload_intents(project_id)` | `public.projects(id)` | `cascade` | `supabase/migrations/20260317120000_storage_upload_intents.sql` |
| `public.document_upload_intents(created_by)` | `public.profiles(id)` | `restrict` | `supabase/migrations/20260317120000_storage_upload_intents.sql` |
| `public.document_upload_intents(document_id)` | `public.documents(id)` | `set null` | `supabase/migrations/20260317120000_storage_upload_intents.sql` |
| `public.project_media_upload_intents(task_id)` | `public.tasks(id)` | `set null` | `supabase/migrations/20260320110000_task_final_media_contract.sql` |
| `public.project_media(task_id)` | `public.tasks(id)` | `set null` | `supabase/migrations/20260320110000_task_final_media_contract.sql` |

## Functions

| Function | Returns | Auth Execute | Kind | Source |
| --- | --- | --- | --- | --- |
| `public.can_access_storage_object(uuid)` | `boolean` | yes | `rpc` | `supabase/migrations/20260306165500_auth_bootstrap_and_domain_rpc.sql` |
| `public.prepare_project_media_upload(uuid, text, text, text, bigint, text)` | `table ( upload_intent_id uuid, bucket text, object_path text, filename text, mime_type text, size_bytes bigint )` | yes | `rpc` | `supabase/migrations/20260317133000_storage_bucket_config_table.sql` |
| `public.finalize_project_media_upload(uuid)` | `table ( project_media_id uuid, storage_object_id uuid, project_id uuid, bucket text, object_path text, filename text )` | yes | `rpc` | `supabase/migrations/20260317121000_storage_upload_rpcs.sql` |
| `public.prepare_document_upload(uuid, text, text, text, text, bigint, text)` | `table ( upload_intent_id uuid, bucket text, object_path text, filename text, mime_type text, size_bytes bigint )` | yes | `rpc` | `supabase/migrations/20260317133000_storage_bucket_config_table.sql` |
| `public.finalize_document_upload(uuid)` | `table ( document_id uuid, document_version_id uuid, storage_object_id uuid, project_id uuid, bucket text, object_path text, filename text )` | yes | `rpc` | `supabase/migrations/20260317121000_storage_upload_rpcs.sql` |
| `public.prepare_project_media_upload(uuid, text, text, text, bigint, text, uuid, boolean)` | `table ( upload_intent_id uuid, bucket text, object_path text, filename text, mime_type text, size_bytes bigint )` | yes | `rpc` | `supabase/migrations/20260320110000_task_final_media_contract.sql` |
| `public.finalize_project_media_upload(uuid, uuid, boolean)` | `table ( project_media_id uuid, storage_object_id uuid, project_id uuid, bucket text, object_path text, filename text )` | yes | `rpc` | `supabase/migrations/20260323113000_finalize_media_bucket_ambiguity_fix.sql` |

## RLS and Grants

### public.storage_objects

- RLS enabled: yes
- Authenticated grants: `select`
- Policies:
  - `storage_objects_select` for `select` to `authenticated`
    using: `public.can_access_storage_object(id)`

### public.documents

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `documents_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`
  - `documents_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id) and created_by = auth.uid()`
  - `documents_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `documents_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`

### public.document_versions

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `document_versions_select` for `select` to `authenticated`
    using: `exists ( select 1 from public.documents d where d.id = document_id and public.can_access_project(d.project_id) )`
  - `document_versions_insert` for `insert` to `authenticated`
    with check: `created_by = auth.uid() and exists ( select 1 from public.documents d where d.id = document_id and public.can_write_project_content(d.project_id) )`
  - `document_versions_update` for `update` to `authenticated`
    using: `exists ( select 1 from public.documents d where d.id = document_id and public.can_write_project_content(d.project_id) )`
    with check: `exists ( select 1 from public.documents d where d.id = document_id and public.can_write_project_content(d.project_id) )`
  - `document_versions_delete` for `delete` to `authenticated`
    using: `exists ( select 1 from public.documents d where d.id = document_id and public.can_write_project_content(d.project_id) )`

### public.project_media

- RLS enabled: yes
- Authenticated grants: `delete`, `insert`, `select`, `update`
- Policies:
  - `project_media_select` for `select` to `authenticated`
    using: `public.can_access_project(project_id)`
  - `project_media_insert` for `insert` to `authenticated`
    with check: `public.can_write_project_content(project_id) and uploaded_by = auth.uid()`
  - `project_media_update` for `update` to `authenticated`
    using: `public.can_write_project_content(project_id)`
    with check: `public.can_write_project_content(project_id)`
  - `project_media_delete` for `delete` to `authenticated`
    using: `public.can_write_project_content(project_id)`

### public.project_media_upload_intents

- RLS enabled: yes
- Authenticated grants: none
- Policies: none

### public.document_upload_intents

- RLS enabled: yes
- Authenticated grants: none
- Policies: none

