import { getAuthRole } from "@/lib/auth-state";
import { getStageEstimateItems } from "@/data/estimate-store";
import { addEvent, getCurrentUser, getProject, getProjects, getStages } from "@/data/store";
import {
  roundHalfUpDiv,
} from "@/lib/estimate-v2/pricing";
import type {
  ApprovalStamp,
  EstimateV2Dependency,
  EstimateV2DiffEntityChange,
  EstimateV2DiffResult,
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Snapshot,
  EstimateV2Stage,
  EstimateV2Version,
  EstimateV2Work,
  Regime,
  ResourceLineType,
} from "@/types/estimate-v2";

interface EstimateV2ProjectState {
  project: EstimateV2Project;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  lines: EstimateV2ResourceLine[];
  dependencies: EstimateV2Dependency[];
  versions: EstimateV2Version[];
}

export interface EstimateV2ProjectView {
  project: EstimateV2Project;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  lines: EstimateV2ResourceLine[];
  dependencies: EstimateV2Dependency[];
  versions: EstimateV2Version[];
}

interface ApproveVersionOptions {
  actorId?: string;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const statesByProjectId = new Map<string, EstimateV2ProjectState>();

function notify() {
  listeners.forEach((listener) => listener());
}

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function resolveCurrency(): string {
  // TODO: use persisted profile currency when mock auth/profile settings expose it.
  if (typeof window === "undefined") return "RUB";
  const raw = window.localStorage.getItem("profile-currency");
  if (!raw) return "RUB";
  const normalized = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) return "RUB";
  return normalized;
}

function mapLegacyType(type: "work" | "material" | "other"): ResourceLineType {
  if (type === "material") return "material";
  if (type === "work") return "labor";
  return "other";
}

function toQtyMilli(qty: number | null): number {
  if (qty == null || !Number.isFinite(qty) || qty <= 0) return 1_000;
  return Math.max(1, Math.round(qty * 1_000));
}

function toCostUnitCents(plannedMajor: number, qtyMilli: number): number {
  const totalCents = Math.max(0, Math.round((Number.isFinite(plannedMajor) ? plannedMajor : 0) * 100));
  if (qtyMilli <= 0) return totalCents;
  return roundHalfUpDiv(totalCents * 1_000, qtyMilli);
}

function cloneSnapshot(snapshot: EstimateV2Snapshot): EstimateV2Snapshot {
  return {
    project: { ...snapshot.project },
    stages: snapshot.stages.map((stage) => ({ ...stage })),
    works: snapshot.works.map((work) => ({ ...work })),
    lines: snapshot.lines.map((line) => ({ ...line })),
    dependencies: snapshot.dependencies.map((dep) => ({ ...dep })),
  };
}

function cloneState(state: EstimateV2ProjectState): EstimateV2ProjectView {
  return {
    project: { ...state.project },
    stages: state.stages.map((stage) => ({ ...stage })),
    works: state.works.map((work) => ({ ...work })),
    lines: state.lines.map((line) => ({ ...line })),
    dependencies: state.dependencies.map((dep) => ({ ...dep })),
    versions: state.versions.map((version) => ({
      ...version,
      approvalStamp: version.approvalStamp ? { ...version.approvalStamp } : null,
      snapshot: cloneSnapshot(version.snapshot),
    })),
  };
}

function getSnapshotFromState(state: EstimateV2ProjectState): EstimateV2Snapshot {
  return {
    project: { ...state.project },
    stages: state.stages.map((stage) => ({ ...stage })),
    works: state.works.map((work) => ({ ...work })),
    lines: state.lines.map((line) => ({ ...line })),
    dependencies: state.dependencies.map((dep) => ({ ...dep })),
  };
}

function isOwnerActionAllowed(projectId: string): boolean {
  const project = getProject(projectId);
  const user = getCurrentUser();
  if (!project || project.owner_id !== user.id) return false;

  const role = getAuthRole();
  return role === "owner";
}

function ensureProjectState(projectId: string): EstimateV2ProjectState {
  const existing = statesByProjectId.get(projectId);
  if (existing) return existing;

  const createdAt = nowIso();
  const projectEntity = getProject(projectId);
  const storeStages = getStages(projectId);
  const legacyItems = getStageEstimateItems(projectId);

  const fallbackStageIds = Array.from(new Set(legacyItems.map((item) => item.stageId)));
  const fallbackStages = fallbackStageIds.map((stageId, index) => ({
    id: stageId,
    project_id: projectId,
    title: `Stage ${index + 1}`,
    description: "",
    order: index + 1,
    status: "open" as const,
  }));

  const mergedStagesById = new Map<string, (typeof fallbackStages)[number]>();
  storeStages.forEach((stage) => mergedStagesById.set(stage.id, stage));
  fallbackStages.forEach((stage) => {
    if (!mergedStagesById.has(stage.id)) mergedStagesById.set(stage.id, stage);
  });

  const orderedStages = [...mergedStagesById.values()].sort((a, b) => a.order - b.order);

  const stages: EstimateV2Stage[] = orderedStages.map((stage) => ({
    id: stage.id,
    projectId,
    title: stage.title,
    order: stage.order,
    discountBps: 0,
    createdAt,
    updatedAt: createdAt,
  }));

  const works: EstimateV2Work[] = stages.map((stage, index) => ({
    id: `work-${projectId}-${stage.id}-default-${index}`,
    projectId,
    stageId: stage.id,
    title: "General work",
    order: 1,
    discountBps: 0,
    createdAt,
    updatedAt: createdAt,
  }));

  const workIdByStageId = new Map(works.map((work) => [work.stageId, work.id]));
  const lines: EstimateV2ResourceLine[] = legacyItems.map((item, index) => {
    const qtyMilli = toQtyMilli(item.qty);
    const costUnitCents = toCostUnitCents(item.planned, qtyMilli);
    const stageId = item.stageId;
    const workId = workIdByStageId.get(stageId) ?? works[0]?.id ?? id("work-fallback");

    return {
      id: `line-${projectId}-${index}-${item.id}`,
      projectId,
      stageId,
      workId,
      title: item.itemName,
      type: mapLegacyType(item.type),
      unit: item.unit ?? "unit",
      qtyMilli,
      costUnitCents,
      markupBps: 0,
      discountBpsOverride: null,
      receivedCents: Math.max(0, Math.round((item.paid ?? 0) * 100)),
      pnlPlaceholderCents: 0,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });

  const project: EstimateV2Project = {
    id: `estimate-v2-${projectId}`,
    projectId,
    title: projectEntity?.title ?? "Estimate",
    currency: resolveCurrency(),
    regime: "contractor",
    taxBps: 2000,
    discountBps: 0,
    markupBps: 0,
    estimateStatus: "draft",
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt,
    updatedAt: createdAt,
  };

  const state: EstimateV2ProjectState = {
    project,
    stages,
    works,
    lines,
    dependencies: [],
    versions: [],
  };

  statesByProjectId.set(projectId, state);
  return state;
}

function shallowEqualExcludingUpdatedAt(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete("updatedAt");
  for (const key of keys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function diffById<T extends { id: string }>(
  prevItems: T[],
  nextItems: T[],
): EstimateV2DiffEntityChange[] {
  const prevById = new Map(prevItems.map((item) => [item.id, item]));
  const nextById = new Map(nextItems.map((item) => [item.id, item]));
  const allIds = new Set([...prevById.keys(), ...nextById.keys()]);
  const result: EstimateV2DiffEntityChange[] = [];

  allIds.forEach((entityId) => {
    const prev = prevById.get(entityId);
    const next = nextById.get(entityId);
    if (!prev && next) {
      result.push({ id: entityId, type: "added" });
      return;
    }
    if (prev && !next) {
      result.push({ id: entityId, type: "removed" });
      return;
    }
    if (prev && next) {
      if (!shallowEqualExcludingUpdatedAt(prev as Record<string, unknown>, next as Record<string, unknown>)) {
        result.push({ id: entityId, type: "updated" });
      }
    }
  });

  return result;
}

export function subscribeEstimateV2(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEstimateV2ProjectState(projectId: string): EstimateV2ProjectView {
  const state = ensureProjectState(projectId);
  return cloneState(state);
}

export function createStage(projectId: string, input: { title: string; discountBps?: number }): EstimateV2Stage {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const stage: EstimateV2Stage = {
    id: id("stage-v2"),
    projectId,
    title: input.title.trim() || "New stage",
    order: (state.stages[state.stages.length - 1]?.order ?? 0) + 1,
    discountBps: Math.max(0, Math.round(input.discountBps ?? 0)),
    createdAt: now,
    updatedAt: now,
  };
  state.stages.push(stage);
  state.project.updatedAt = now;
  notify();
  return { ...stage };
}

export function updateStage(projectId: string, stageId: string, partial: Partial<EstimateV2Stage>) {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  state.stages = state.stages.map((stage) => (
    stage.id === stageId
      ? {
        ...stage,
        ...partial,
        updatedAt: now,
      }
      : stage
  ));
  state.project.updatedAt = now;
  notify();
}

export function deleteStage(projectId: string, stageId: string) {
  const state = ensureProjectState(projectId);
  const workIdsToDelete = new Set(state.works.filter((work) => work.stageId === stageId).map((work) => work.id));

  state.stages = state.stages.filter((stage) => stage.id !== stageId);
  state.works = state.works.filter((work) => !workIdsToDelete.has(work.id));
  state.lines = state.lines.filter((line) => line.stageId !== stageId && !workIdsToDelete.has(line.workId));
  state.dependencies = state.dependencies.filter((dep) => !workIdsToDelete.has(dep.fromWorkId) && !workIdsToDelete.has(dep.toWorkId));
  state.project.updatedAt = nowIso();
  notify();
}

export function createWork(projectId: string, input: { stageId: string; title: string; discountBps?: number }): EstimateV2Work {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const nextOrder = state.works
    .filter((work) => work.stageId === input.stageId)
    .reduce((max, work) => Math.max(max, work.order), 0) + 1;

  const work: EstimateV2Work = {
    id: id("work-v2"),
    projectId,
    stageId: input.stageId,
    title: input.title.trim() || "New work",
    order: nextOrder,
    discountBps: Math.max(0, Math.round(input.discountBps ?? 0)),
    createdAt: now,
    updatedAt: now,
  };

  state.works.push(work);
  state.project.updatedAt = now;
  notify();
  return { ...work };
}

export function updateWork(projectId: string, workId: string, partial: Partial<EstimateV2Work>) {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  state.works = state.works.map((work) => (
    work.id === workId
      ? {
        ...work,
        ...partial,
        updatedAt: now,
      }
      : work
  ));
  state.project.updatedAt = now;
  notify();
}

export function deleteWork(projectId: string, workId: string) {
  const state = ensureProjectState(projectId);
  state.works = state.works.filter((work) => work.id !== workId);
  state.lines = state.lines.filter((line) => line.workId !== workId);
  state.dependencies = state.dependencies.filter((dep) => dep.fromWorkId !== workId && dep.toWorkId !== workId);
  state.project.updatedAt = nowIso();
  notify();
}

export function createLine(
  projectId: string,
  input: {
    stageId: string;
    workId: string;
    title: string;
    type?: ResourceLineType;
    unit?: string;
    qtyMilli?: number;
    costUnitCents?: number;
    markupBps?: number;
    discountBpsOverride?: number | null;
  },
): EstimateV2ResourceLine {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const line: EstimateV2ResourceLine = {
    id: id("line-v2"),
    projectId,
    stageId: input.stageId,
    workId: input.workId,
    title: input.title.trim() || "New line",
    type: input.type ?? "material",
    unit: input.unit?.trim() || "unit",
    qtyMilli: Math.max(1, Math.round(input.qtyMilli ?? 1_000)),
    costUnitCents: Math.max(0, Math.round(input.costUnitCents ?? 0)),
    markupBps: Math.max(0, Math.round(input.markupBps ?? state.project.markupBps ?? 0)),
    discountBpsOverride: input.discountBpsOverride == null ? null : Math.max(0, Math.round(input.discountBpsOverride)),
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: now,
    updatedAt: now,
  };

  state.lines.push(line);
  state.project.updatedAt = now;
  notify();
  return { ...line };
}

export function updateLine(projectId: string, lineId: string, partial: Partial<EstimateV2ResourceLine>) {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  state.lines = state.lines.map((line) => (
    line.id === lineId
      ? {
        ...line,
        ...partial,
        updatedAt: now,
      }
      : line
  ));
  state.project.updatedAt = now;
  notify();
}

export function deleteLine(projectId: string, lineId: string) {
  const state = ensureProjectState(projectId);
  state.lines = state.lines.filter((line) => line.id !== lineId);
  state.project.updatedAt = nowIso();
  notify();
}

export function setProjectEstimateStatus(projectId: string, status: string) {
  const state = ensureProjectState(projectId);
  state.project = {
    ...state.project,
    estimateStatus: status,
    updatedAt: nowIso(),
  };
  notify();
}

export function updateEstimateV2Project(projectId: string, partial: Partial<EstimateV2Project>) {
  const state = ensureProjectState(projectId);
  state.project = {
    ...state.project,
    ...partial,
    updatedAt: nowIso(),
  };
  notify();
}

export function setRegime(projectId: string, regime: Regime): boolean {
  if (!isOwnerActionAllowed(projectId)) return false;
  const state = ensureProjectState(projectId);
  state.project = {
    ...state.project,
    regime,
    updatedAt: nowIso(),
  };
  notify();
  return true;
}

export function createDependency(
  projectId: string,
  input: { fromWorkId: string; toWorkId: string; lagDays?: number },
): EstimateV2Dependency {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const dependency: EstimateV2Dependency = {
    id: id("dep-v2"),
    projectId,
    kind: "FS",
    fromWorkId: input.fromWorkId,
    toWorkId: input.toWorkId,
    lagDays: Math.round(input.lagDays ?? 0),
    createdAt: now,
    updatedAt: now,
  };
  state.dependencies.push(dependency);
  state.project.updatedAt = now;
  notify();
  return { ...dependency };
}

export function deleteDependency(projectId: string, dependencyId: string) {
  const state = ensureProjectState(projectId);
  state.dependencies = state.dependencies.filter((dep) => dep.id !== dependencyId);
  state.project.updatedAt = nowIso();
  notify();
}

export function createVersionSnapshot(projectId: string, createdBy: string): { versionId: string; snapshot: EstimateV2Snapshot } {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const snapshot = getSnapshotFromState(state);
  const nextNumber = state.versions.reduce((max, version) => Math.max(max, version.number), 0) + 1;

  const version: EstimateV2Version = {
    id: id("estimate-v2-version"),
    projectId,
    number: nextNumber,
    status: "proposed",
    snapshot,
    shareId: id("share"),
    approvalStamp: null,
    archived: true,
    submitted: false,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  state.versions.push(version);
  state.project.updatedAt = now;
  notify();

  return {
    versionId: version.id,
    snapshot: cloneSnapshot(version.snapshot),
  };
}

export function submitVersion(projectId: string, versionId: string): boolean {
  if (!isOwnerActionAllowed(projectId)) return false;
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const actor = getCurrentUser();

  let submittedVersion: EstimateV2Version | null = null;

  state.versions = state.versions.map((version) => {
    if (version.id === versionId) {
      const next = {
        ...version,
        status: "proposed" as const,
        archived: false,
        submitted: true,
        updatedAt: now,
      };
      submittedVersion = next;
      return next;
    }
    return {
      ...version,
      archived: true,
      updatedAt: now,
    };
  });

  if (!submittedVersion) return false;

  addEvent({
    id: id("evt-estimate-v2-submitted"),
    project_id: projectId,
    actor_id: actor.id,
    type: "estimate.version_submitted",
    object_type: "estimate_version",
    object_id: submittedVersion.id,
    timestamp: now,
    payload: {
      projectId,
      versionId: submittedVersion.id,
      actor: actor.id,
      versionNumber: submittedVersion.number,
    },
  });

  state.project.updatedAt = now;
  notify();
  return true;
}

export function approveVersion(
  projectId: string,
  versionId: string,
  stamp: ApprovalStamp,
  options: ApproveVersionOptions = {},
): boolean {
  const state = ensureProjectState(projectId);
  const now = nowIso();

  let approvedVersion: EstimateV2Version | null = null;

  state.versions = state.versions.map((version) => {
    if (version.id === versionId) {
      const next = {
        ...version,
        status: "approved" as const,
        archived: false,
        submitted: true,
        approvalStamp: { ...stamp },
        updatedAt: now,
      };
      approvedVersion = next;
      return next;
    }

    return {
      ...version,
      archived: true,
      updatedAt: now,
    };
  });

  if (!approvedVersion) return false;

  const actorId = options.actorId ?? "client";

  addEvent({
    id: id("evt-estimate-v2-approved"),
    project_id: projectId,
    actor_id: actorId,
    type: "estimate.version_approved",
    object_type: "estimate_version",
    object_id: approvedVersion.id,
    timestamp: now,
    payload: {
      projectId,
      versionId: approvedVersion.id,
      actor: actorId,
      versionNumber: approvedVersion.number,
      approverEmail: stamp.email,
    },
  });

  state.project.updatedAt = now;
  notify();
  return true;
}

export function getCurrentVersion(projectId: string): EstimateV2Version | null {
  const state = ensureProjectState(projectId);
  const current = state.versions
    .filter((version) => version.submitted && !version.archived)
    .sort((a, b) => b.number - a.number)[0];

  return current ? {
    ...current,
    approvalStamp: current.approvalStamp ? { ...current.approvalStamp } : null,
    snapshot: cloneSnapshot(current.snapshot),
  } : null;
}

export function getLatestApprovedVersion(projectId: string): EstimateV2Version | null {
  const state = ensureProjectState(projectId);
  const latest = state.versions
    .filter((version) => version.status === "approved" && version.submitted)
    .sort((a, b) => b.number - a.number)[0];

  return latest ? {
    ...latest,
    approvalStamp: latest.approvalStamp ? { ...latest.approvalStamp } : null,
    snapshot: cloneSnapshot(latest.snapshot),
  } : null;
}

export function findVersionByShareId(shareId: string): { projectId: string; version: EstimateV2Version } | null {
  const projects = getProjects();
  projects.forEach((project) => ensureProjectState(project.id));

  for (const [projectId, state] of statesByProjectId.entries()) {
    const matched = state.versions.find((version) => version.shareId === shareId);
    if (!matched) continue;
    return {
      projectId,
      version: {
        ...matched,
        approvalStamp: matched.approvalStamp ? { ...matched.approvalStamp } : null,
        snapshot: cloneSnapshot(matched.snapshot),
      },
    };
  }

  return null;
}

export function getLatestProposedVersion(projectId: string): EstimateV2Version | null {
  const state = ensureProjectState(projectId);
  const version = state.versions
    .filter((entry) => entry.status === "proposed" && entry.submitted)
    .sort((a, b) => b.number - a.number)[0];

  return version ? {
    ...version,
    approvalStamp: version.approvalStamp ? { ...version.approvalStamp } : null,
    snapshot: cloneSnapshot(version.snapshot),
  } : null;
}

export function computeVersionDiff(
  prevVersion: EstimateV2Version | null,
  nextVersion: EstimateV2Version,
): EstimateV2DiffResult {
  const prevSnapshot = prevVersion?.snapshot;

  const stageChanges = diffById(prevSnapshot?.stages ?? [], nextVersion.snapshot.stages);
  const workChanges = diffById(prevSnapshot?.works ?? [], nextVersion.snapshot.works);
  const lineChanges = diffById(prevSnapshot?.lines ?? [], nextVersion.snapshot.lines);

  return {
    stageChanges,
    workChanges,
    lineChanges,
    changedStageIds: stageChanges.map((change) => change.id),
    changedWorkIds: workChanges.map((change) => change.id),
    changedLineIds: lineChanges.map((change) => change.id),
  };
}
