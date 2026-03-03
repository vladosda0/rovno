// StroyAgent Domain Entities

export type UserPlan = "free" | "pro" | "business";
export type MemberRole = "owner" | "co_owner" | "contractor" | "viewer";
export type AIAccess = "none" | "consult_only" | "project_pool";
export type StageStatus = "open" | "completed" | "archived";
export type TaskStatus = "not_started" | "in_progress" | "done" | "blocked";
export type EstimateVersionStatus = "draft" | "approved" | "archived";
export type EstimateItemType = "work" | "material";
export type ProposalStatus = "submitted" | "accepted" | "rejected";
export type ProcurementStatus = "to_buy" | "ordered" | "in_stock";
export type ProcurementCreatedFrom = "estimate" | "task_material" | "manual" | "ai";
export type ProcurementItemType = "material" | "tool" | "other";
export type OrderStatus = "draft" | "placed" | "received" | "voided";
export type OrderKind = "supplier" | "stock";
export type ChecklistItemType = "subtask" | "material" | "tool";
export type DocumentVersionStatus = "draft" | "active" | "archived" | "awaiting_approval";

export type EventType =
  | "task_created"
  | "task_updated"
  | "task_completed"
  | "task_moved"
  | "estimate_created"
  | "estimate_approved"
  | "estimate_archived"
  | "estimate_deleted"
  | "estimate_paid_updated"
  | "estimate.version_submitted"
  | "estimate.version_approved"
  | "estimate.status_changed"
  | "estimate.tax_changed"
  | "estimate.discount_changed"
  | "estimate.dependency_added"
  | "estimate.dependency_removed"
  | "estimate.viewer_regime_set"
  | "estimate.project_mode_set"
  | "procurement_created"
  | "procurement_updated"
  | "procurement_deleted"
  | "document_created"
  | "document_version_created"
  | "document_archived"
  | "document_deleted"
  | "document_acknowledged"
  | "photo_deleted"
  | "contractor_proposal_submitted"
  | "contractor_proposal_accepted"
  | "contractor_proposal_rejected"
  | "document_uploaded"
  | "member_added"
  | "comment_added"
  | "photo_uploaded"
  | "stage_created"
  | "stage_completed"
  | "stage_deleted"
  | "proposal_confirmed"
  | "proposal_cancelled"
  | "project_created";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  locale: string;
  timezone: string;
  plan: UserPlan;
  credits_free: number;
  credits_paid: number;
}

export interface Project {
  id: string;
  owner_id: string;
  title: string;
  type: string;
  project_mode?: "build_myself" | "contractor";
  automation_level: string;
  current_stage_id: string;
  progress_pct: number;
  address?: string;
  ai_description?: string;
}

export interface Member {
  project_id: string;
  user_id: string;
  role: MemberRole;
  viewer_regime?: "contractor" | "client" | "build_myself";
  ai_access: AIAccess;
  credit_limit: number;
  used_credits: number;
}

export interface Stage {
  id: string;
  project_id: string;
  title: string;
  description: string;
  order: number;
  status: StageStatus;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  type?: ChecklistItemType;
  procurementItemId?: string | null;
  estimateV2LineId?: string;
  estimateV2WorkId?: string;
  estimateV2ResourceType?: "material" | "tool" | "labor" | "subcontractor" | "other";
  estimateV2QtyMilli?: number;
  estimateV2Unit?: string;
}

export interface Comment {
  id: string;
  author_id: string;
  text: string;
  created_at: string;
}

export interface Task {
  id: string;
  project_id: string;
  stage_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee_id: string;
  checklist: ChecklistItem[];
  comments: Comment[];
  attachments: string[];
  photos: string[];
  linked_estimate_item_ids: string[];
  created_at: string;
  startDate?: string;
  deadline?: string;
}

export interface EstimateItem {
  id: string;
  version_id: string;
  stage_id?: string;
  task_id?: string;
  type: EstimateItemType;
  title: string;
  unit: string;
  qty: number;
  planned_cost: number;
  paid_cost: number;
}

export interface EstimateVersion {
  id: string;
  project_id: string;
  number: number;
  status: EstimateVersionStatus;
  items: EstimateItem[];
}

export interface Estimate {
  project_id: string;
  versions: EstimateVersion[];
}

export interface Proposal {
  id: string;
  project_id: string;
  estimate_version_id: string;
  author_id: string;
  payload: Record<string, unknown>;
  status: ProposalStatus;
}

export interface ContractorProposal {
  id: string;
  project_id: string;
  estimate_item_id: string;
  version_id: string;
  author_id: string;
  suggested_cost?: number;
  suggested_material?: string;
  comment: string;
  status: "pending" | "accepted" | "rejected";
  created_at: string;
}

export interface ProcurementItem {
  id: string;
  project_id: string;
  stage_id?: string;
  estimate_item_id?: string;
  title: string;
  unit: string;
  qty: number;
  in_stock: number;
  cost: number;
  status: "not_purchased" | "purchased";
}

export interface ProcurementAttachment {
  id: string;
  url: string;
  type: string;
  name?: string;
  isLocal?: boolean;
  createdAt: string;
}

export interface ProcurementItemV2 {
  id: string;
  projectId: string;
  stageId: string | null;
  categoryId: string | null;
  type: ProcurementItemType;
  name: string;
  spec: string | null;
  unit: string;
  requiredByDate?: string | null;
  requiredQty: number;
  orderedQty: number;
  receivedQty: number;
  plannedUnitPrice: number | null;
  actualUnitPrice: number | null;
  supplier: string | null;
  supplierPreferred?: string | null;
  locationPreferredId?: string | null;
  lockedFromEstimate?: boolean;
  sourceEstimateItemId?: string | null;
  sourceEstimateV2LineId?: string | null;
  orphaned?: boolean;
  orphanedAt?: string | null;
  orphanedReason?: "estimate_line_deleted" | "estimate_line_type_changed" | null;
  linkUrl: string | null;
  notes: string | null;
  attachments: ProcurementAttachment[];
  createdFrom: ProcurementCreatedFrom;
  linkedTaskIds: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLocation {
  id: string;
  name: string;
  address?: string;
  isDefault?: boolean;
}

export interface Order {
  id: string;
  projectId: string;
  status: OrderStatus;
  kind: OrderKind;
  supplierName?: string | null;
  deliverToLocationId?: string | null;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  dueDate?: string | null;
  deliveryDeadline?: string | null;
  invoiceAttachment?: ProcurementAttachment | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderLine {
  id: string;
  orderId: string;
  procurementItemId: string;
  qty: number;
  receivedQty: number;
  unit: string;
  plannedUnitPrice?: number | null;
  actualUnitPrice?: number | null;
}

export interface OrderReceiveEvent {
  id: string;
  orderId: string;
  orderLineId: string;
  procurementItemId: string;
  locationId: string;
  deltaQty: number;
  eventType: "receive" | "move_in" | "move_out" | "void_reversal";
  createdAt: string;
}

export interface OrderWithLines extends Order {
  lines: OrderLine[];
  receiveEvents?: OrderReceiveEvent[];
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  number: number;
  status: DocumentVersionStatus;
  content: string;
}

export interface Document {
  id: string;
  project_id: string;
  type: string;
  title: string;
  versions: DocumentVersion[];
  origin?: "project_creation" | "uploaded" | "manual" | "ai_generated";
  description?: string;
  created_at?: string;
  file_meta?: {
    filename: string;
    mime: string;
    size: number;
  };
  ai_flags?: {
    aiScan?: boolean;
    aiCreate?: boolean;
  };
}

export interface Media {
  id: string;
  project_id: string;
  task_id?: string;
  uploader_id: string;
  caption: string;
  description?: string;
  is_final: boolean;
  created_at: string;
  file_meta?: {
    filename: string;
    mime: string;
    size: number;
  };
}

export interface Event {
  id: string;
  project_id: string;
  actor_id: string;
  type: EventType;
  object_type: string;
  object_id: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface Notification {
  id: string;
  user_id: string;
  project_id: string;
  event_id: string;
  is_read: boolean;
}
