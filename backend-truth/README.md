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
- `supabase/migrations/20260320130000_codex_review_findings_fixes.sql`
- `supabase/migrations/20260320143000_add_sanitize_uploaded_filename.sql`
- `supabase/migrations/20260323110000_storage_project_media_insert_policy.sql`
- `supabase/migrations/20260323113000_finalize_media_bucket_ambiguity_fix.sql`
- `supabase/migrations/20260324140000_project_launch_authority.sql`
- `supabase/migrations/20260325100000_sensitive_visibility_and_document_classification.sql`
- `supabase/migrations/20260325120000_doc_media_visibility_write_enforcement.sql`
- `supabase/migrations/20260325123000_restore_projects_select_membership_visibility.sql`
- `supabase/migrations/20260325126000_fix_project_members_co_owner_policy_recursion.sql`
- `supabase/migrations/20260325130000_remove_co_owner_project_members_policy_branch.sql`
- `supabase/migrations/20260325133000_break_projects_project_members_rls_cycle.sql`
- `supabase/migrations/20260326190000_restore_co_owner_project_members_rls_subset.sql`
- `supabase/migrations/20260326203000_owner_transfer_and_member_identity_guard.sql`
- `supabase/migrations/20260326213000_internal_visibility_write_boundary.sql`
- `supabase/migrations/20260330160000_wave2_hr_lineage_and_projection_uniqueness.sql`
- `supabase/migrations/20260403103000_phase6_operational_summary_read_rpcs.sql`
- `supabase/migrations/20260403191500_phase6_operational_summary_subcontractor_and_client_amounts.sql`
- `supabase/migrations/20260405120000_resource_type_operational_visibility_and_hr_rpc.sql`
- `supabase/migrations/20260406183000_procurement_operational_summary_requested_and_ordered_line_types.sql`
- `supabase/migrations/20260406184500_track1_hr_operational_summary_role_gate.sql`
- `supabase/migrations/20260406200000_track1_estimate_operational_summary_finance_visibility.sql`
- `supabase/migrations/20260407190000_track4_upload_visibility_class.sql`
- `supabase/migrations/20260408100000_document_versions_insert_internal_visibility_parity.sql`
- `supabase/migrations/20260408120000_estimate_line_pricing_params.sql`
- `supabase/migrations/20260409120000_hr_select_policies_align_can_access_hr_domain.sql`
- `supabase/migrations/20260409140000_hr_write_policies_align_can_access_hr_domain.sql`
- `supabase/migrations/20260414120000_wave1_get_ai_project_snapshot.sql`
- `supabase/migrations/20260414140000_wave3_procurement_ai_operational_evidence_rpc.sql`
- `supabase/migrations/20260414150000_wave4_tasks_ai_operational_evidence_rpc.sql`
- `supabase/migrations/20260415100000_wave5_ai_chat_session_continuity.sql`
- `supabase/migrations/20260415120000_wave6_participants_activity_ai_evidence_rpcs.sql`
- `supabase/migrations/20260415130000_wave7_documents_media_ai_metadata_evidence.sql`
- `supabase/migrations/20260416100000_wave9_closeout_hardening.sql`
- `supabase/migrations/20260416120000_session2_ai_humanize_tasks_hr.sql`
- `supabase/migrations/20260416140000_session21_estimate_assignee_display_name.sql`
- `supabase/migrations/20260417120000_estimate_resource_line_assignee_profile.sql`
- `supabase/migrations/20260418120000_estimate_resource_line_assignee_label.sql`
- `supabase/migrations/20260419120000_session3c_procurement_ai_in_stock_evidence.sql`
- `supabase/migrations/20260425092624_profile_tutorial_state.sql`

## Exclusions

- Draft or imported reset schema files
- Seeds, runtime config, Docker, deployment, and VPS files
- The rest of the `supabase/` tree outside the curated migration allowlist

## External Schema References

- Table `auth.users` referenced from `supabase/migrations/20260306160500_core_profiles_and_preferences.sql`
- Table `storage.objects` referenced from `supabase/migrations/20260323110000_storage_project_media_insert_policy.sql`

## Platform Dependencies

- Extension `pgcrypto` from `supabase/migrations/20260306160000_extensions_and_base_helpers.sql`

## Derived Contract Bundles

- `slices/*.json` are derived contract bundles filtered from the canonical structured artifacts.
- `contracts/*.md` are secondary summary views rendered mechanically from those structured artifacts.

