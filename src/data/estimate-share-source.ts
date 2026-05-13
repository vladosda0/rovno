import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type {
  ApprovalStamp,
  EstimateV2Snapshot,
  EstimateV2Version,
  EstimateV2VersionShareApprovalDisabledReason,
  EstimateV2VersionShareApprovalPolicy,
  EstimateV2VersionStatus,
} from "@/types/estimate-v2";

// The share endpoint tables/RPCs are not yet present in the generated
// Database type (the rovno-db `feat(estimates): real share endpoint`
// migration must merge first, then the backend-truth sync PR regenerates
// types). Until then, use an untyped client — same pattern as
// org-source.ts and workspace-documents-source.ts.
const rawSupabase = supabase as unknown as SupabaseClient;

interface SharedSnapshotRow {
  share_token: string;
  project_id: string;
  version_number: number;
  status: string;
  share_approval_policy: string;
  share_approval_disabled_reason: string | null;
  snapshot: EstimateV2Snapshot;
  approval_stamp: ApprovalStamp | null;
  submitted: boolean;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function normalizeStatus(raw: string): EstimateV2VersionStatus {
  return raw === "approved" ? "approved" : "proposed";
}

function normalizePolicy(raw: string): EstimateV2VersionShareApprovalPolicy {
  return raw === "disabled" ? "disabled" : "registered";
}

function normalizeDisabledReason(raw: string | null): EstimateV2VersionShareApprovalDisabledReason {
  return raw === "no_participant_slot" ? "no_participant_slot" : null;
}

function rowToVersion(row: SharedSnapshotRow): { projectId: string; version: EstimateV2Version } {
  const version: EstimateV2Version = {
    id: `share-${row.share_token}`,
    projectId: row.project_id,
    number: row.version_number,
    status: normalizeStatus(row.status),
    snapshot: row.snapshot,
    shareId: row.share_token,
    shareApprovalPolicy: normalizePolicy(row.share_approval_policy),
    shareApprovalDisabledReason: normalizeDisabledReason(row.share_approval_disabled_reason),
    approvalStamp: row.approval_stamp,
    archived: row.archived,
    submitted: row.submitted,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return { projectId: row.project_id, version };
}

export async function fetchSharedEstimateVersion(
  shareToken: string,
): Promise<{ projectId: string; version: EstimateV2Version } | null> {
  if (!shareToken) return null;
  const { data, error } = await rawSupabase.rpc("get_shared_estimate_version", {
    p_share_token: shareToken,
  });
  if (error) throw error;
  if (data == null) return null;
  return rowToVersion(data as SharedSnapshotRow);
}

export interface PublishEstimateShareSnapshotInput {
  projectId: string;
  shareToken: string;
  versionNumber: number;
  snapshot: EstimateV2Snapshot;
  shareApprovalPolicy: EstimateV2VersionShareApprovalPolicy;
  shareApprovalDisabledReason?: EstimateV2VersionShareApprovalDisabledReason;
}

export async function publishEstimateShareSnapshot(
  input: PublishEstimateShareSnapshotInput,
): Promise<{ projectId: string; version: EstimateV2Version }> {
  const { data, error } = await rawSupabase.rpc("publish_estimate_share_snapshot", {
    p_project_id: input.projectId,
    p_share_token: input.shareToken,
    p_version_number: input.versionNumber,
    p_snapshot: input.snapshot,
    p_share_approval_policy: input.shareApprovalPolicy,
    p_share_approval_disabled_reason: input.shareApprovalDisabledReason ?? null,
  });
  if (error) throw error;
  if (data == null) {
    throw new Error("publish_estimate_share_snapshot returned no row");
  }
  return rowToVersion(data as SharedSnapshotRow);
}

export async function approveSharedEstimateVersion(
  shareToken: string,
  stamp: ApprovalStamp,
): Promise<{ projectId: string; version: EstimateV2Version }> {
  const { data, error } = await rawSupabase.rpc("approve_estimate_version_by_share_token", {
    p_share_token: shareToken,
    p_payload: stamp,
  });
  if (error) throw error;
  if (data == null) {
    throw new Error("approve_estimate_version_by_share_token returned no row");
  }
  return rowToVersion(data as SharedSnapshotRow);
}
