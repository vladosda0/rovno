<!-- Generated file. Read-only. Regenerate from rovno-db. -->
<!-- Secondary summary view. Structured JSON and mirrored SQL are authoritative over this markdown. -->

DO NOT EDIT.

Generated from rovno-db/scripts/generate-backend-truth.mjs

# Backend Truth

This directory is fully generated from a curated subset of `rovno-db` migrations.
It is an allowlist-specific extractor for the source migrations below, not a generic SQL migration parser.

## Read-Only

- Do not edit files in this directory by hand.
- Regenerate from `rovno-db` using `node scripts/generate-backend-truth.mjs`.
- The mirror is deterministic and should be fully replaced on sync.
- Unsupported or unexpected SQL in the curated allowlist causes generation to fail instead of writing partial output.

## Contract Precedence

1. Mirrored SQL for exact source auditability
2. Normalized JSON for machine-readable contract views
3. Generated TypeScript for reference-only developer inspection
4. Generated Markdown for human-readable secondary summaries

## Source Migrations

- `supabase/migrations/20260306160000_extensions_and_base_helpers.sql`
- `supabase/migrations/20260306160500_core_profiles_and_preferences.sql`
- `supabase/migrations/20260306161000_projects_membership_and_invites.sql`
- `supabase/migrations/20260306161500_project_planning_tasks_and_comments.sql`
- `supabase/migrations/20260306162000_storage_documents_and_media.sql`
- `supabase/migrations/20260306162500_estimates_core.sql`
- `supabase/migrations/20260306163000_inventory_foundation.sql`
- `supabase/migrations/20260306163500_procurement_orders_and_inventory_movements.sql`
- `supabase/migrations/20260306164000_hr_domain.sql`
- `supabase/migrations/20260306164500_activity_and_notifications.sql`
- `supabase/migrations/20260306165000_billing_launch_tables.sql`
- `supabase/migrations/20260306165500_auth_bootstrap_and_domain_rpc.sql`
- `supabase/migrations/20260306170000_grants_rls_enablement_and_policies.sql`
- `supabase/migrations/20260313180000_projects_owner_only_rls_hotfix.sql`
- `supabase/migrations/20260313183000_tasks_estimate_work_lineage.sql`
- `supabase/migrations/20260317120000_storage_upload_intents.sql`
- `supabase/migrations/20260317121000_storage_upload_rpcs.sql`
- `supabase/migrations/20260317122000_storage_upload_grants_rls.sql`
- `supabase/migrations/20260317130000_storage_bucket_settings_split.sql`
- `supabase/migrations/20260317133000_storage_bucket_config_table.sql`
- `supabase/migrations/20260320110000_task_final_media_contract.sql`

## Exclusions

- Draft or imported reset schema files
- Seeds, runtime config, Docker, deployment, and VPS files
- The rest of the `supabase/` tree outside the curated migration allowlist

## External Schema References

- Table `auth.users` referenced from `supabase/migrations/20260306160500_core_profiles_and_preferences.sql`

## Platform Dependencies

- Extension `pgcrypto` from `supabase/migrations/20260306160000_extensions_and_base_helpers.sql`

## Derived Contract Bundles

- `slices/*.json` are derived contract bundles filtered from the canonical structured artifacts.
- `contracts/*.md` are secondary summary views rendered mechanically from those structured artifacts.

