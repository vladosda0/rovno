export type AIMessageRole = "user" | "assistant";
export type AIProposalType = "add_task" | "update_estimate" | "add_procurement" | "generate_document";
export type AIProposalStatus = "pending" | "confirmed" | "cancelled";
export type ProposalChangeAction = "create" | "update" | "delete";

export interface ProposalChange {
  entity_type: string;
  action: ProposalChangeAction;
  label: string;
  before?: string;
  after?: string;
}

export interface AIProposal {
  id: string;
  project_id: string;
  type: AIProposalType;
  summary: string;
  changes: ProposalChange[];
  status: AIProposalStatus;
}

export interface AIMessage {
  id: string;
  role: AIMessageRole;
  content: string;
  timestamp: string;
  proposal?: AIProposal;
}
