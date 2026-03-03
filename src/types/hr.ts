export type HRItemStatus = "planned" | "requested" | "approved" | "paid" | "cancelled";
export type HRItemType = "labor" | "subcontractor";

export interface HRPlannedItem {
  id: string;
  projectId: string;
  stageId: string;
  workId: string;
  title: string;
  type: HRItemType;
  plannedQty: number;
  plannedRate: number;
  assignee: string | null;
  status: HRItemStatus;
  lockedFromEstimate: boolean;
  sourceEstimateV2LineId: string | null;
  orphaned: boolean;
  orphanedAt: string | null;
  orphanedReason: "estimate_line_deleted" | "estimate_line_type_changed" | null;
  createdAt: string;
  updatedAt: string;
}

export interface HRPayment {
  id: string;
  projectId: string;
  hrItemId: string;
  amount: number;
  paidAt: string;
  note: string | null;
  createdAt: string;
}
