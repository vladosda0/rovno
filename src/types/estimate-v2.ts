export type ResourceLineType = "material" | "tool" | "labor" | "subcontractor" | "other";

export type Regime = "contractor" | "client" | "build_myself";

export type EstimateV2VersionStatus = "proposed" | "approved";

export interface EstimateV2Project {
  id: string;
  projectId: string;
  title: string;
  currency: string;
  regime: Regime;
  taxBps: number;
  discountBps: number;
  markupBps: number;
  estimateStatus: string;
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

export interface EstimateV2DiffResult {
  stageChanges: EstimateV2DiffEntityChange[];
  workChanges: EstimateV2DiffEntityChange[];
  lineChanges: EstimateV2DiffEntityChange[];
  changedStageIds: string[];
  changedWorkIds: string[];
  changedLineIds: string[];
}
