export type ResourceLineType = "material" | "tool" | "labor" | "subcontractor" | "other";

export type Regime = "contractor" | "client" | "build_myself";

export type EstimateV2VersionStatus = "proposed" | "approved";
export type EstimateExecutionStatus = "planning" | "in_work" | "paused" | "finished";
export type EstimateV2WorkStatus = "not_started" | "in_progress" | "done" | "blocked";

export interface EstimateV2Project {
  id: string;
  projectId: string;
  title: string;
  currency: string;
  regime: Regime;
  taxBps: number;
  discountBps: number;
  markupBps: number;
  estimateStatus: EstimateExecutionStatus;
  receivedCents: number;
  pnlPlaceholderCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateV2Stage {
  id: string;
  projectId: string;
  title: string;
  order: number;
  discountBps: number;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateV2Work {
  id: string;
  projectId: string;
  stageId: string;
  title: string;
  order: number;
  discountBps: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  taskId: string | null;
  status: EstimateV2WorkStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateV2ResourceLine {
  id: string;
  projectId: string;
  stageId: string;
  workId: string;
  title: string;
  type: ResourceLineType;
  unit: string;
  qtyMilli: number;
  costUnitCents: number;
  markupBps: number;
  discountBpsOverride: number | null;
  receivedCents: number;
  pnlPlaceholderCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateV2Dependency {
  id: string;
  projectId: string;
  kind: "FS";
  fromWorkId: string;
  toWorkId: string;
  lagDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalStamp {
  name: string;
  surname: string;
  email: string;
  timestamp: string;
}

export interface EstimateV2Snapshot {
  project: EstimateV2Project;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  lines: EstimateV2ResourceLine[];
  dependencies: EstimateV2Dependency[];
}

export interface ScheduleBaselineWork {
  workId: string;
  baselineStart: string | null;
  baselineEnd: string | null;
}

export interface ScheduleBaseline {
  capturedAt: string;
  projectBaselineStart: string | null;
  projectBaselineEnd: string | null;
  works: ScheduleBaselineWork[];
}

export interface EstimateV2Version {
  id: string;
  projectId: string;
  number: number;
  status: EstimateV2VersionStatus;
  snapshot: EstimateV2Snapshot;
  shareId: string;
  approvalStamp: ApprovalStamp | null;
  archived: boolean;
  submitted: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EstimateV2DiffEntityChange {
  id: string;
  type: "added" | "removed" | "updated";
}

export interface EstimateV2DiffFieldChange {
  field: string;
  before: unknown;
  after: unknown;
  label: string;
}

export interface EstimateV2StructuredChange {
  entityKind: "stage" | "work" | "line";
  entityId: string;
  changeType: "added" | "removed" | "updated";
  stageId: string | null;
  stageTitle: string | null;
  workId: string | null;
  workTitle: string | null;
  title: string;
  stageNumber: number | null;
  workNumber: string | null;
  fieldChanges: EstimateV2DiffFieldChange[];
}

export interface EstimateV2DiffResult {
  stageChanges: EstimateV2DiffEntityChange[];
  workChanges: EstimateV2DiffEntityChange[];
  lineChanges: EstimateV2DiffEntityChange[];
  changedStageIds: string[];
  changedWorkIds: string[];
  changedLineIds: string[];
  changes: EstimateV2StructuredChange[];
}
