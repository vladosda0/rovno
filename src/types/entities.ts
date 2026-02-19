// StroyAgent Domain Entities

export type UserPlan = "free" | "pro" | "business";
export type MemberRole = "owner" | "contractor" | "participant";
export type AIAccess = "none" | "consult_only" | "project_pool";
export type StageStatus = "open" | "completed" | "archived";
export type TaskStatus = "not_started" | "in_progress" | "done" | "blocked";
export type EstimateVersionStatus = "draft" | "approved" | "archived";
export type EstimateItemType = "work" | "material";
export type ProposalStatus = "submitted" | "accepted" | "rejected";
export type ProcurementStatus = "not_purchased" | "purchased";
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
  automation_level: string;
  current_stage_id: string;
  progress_pct: number;
}

export interface Member {
  project_id: string;
  user_id: string;
  role: MemberRole;
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
  status: ProcurementStatus;
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
}

export interface Media {
  id: string;
  project_id: string;
  task_id?: string;
  uploader_id: string;
  caption: string;
  is_final: boolean;
  created_at: string;
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
