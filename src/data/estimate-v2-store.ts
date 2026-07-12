import { getAuthRole, getStoredAuthProfile, isDemoSessionActive, subscribeAuthState } from "@/lib/auth-state";
import {
  getProjectDomainAccessForRole,
  projectDomainAllowsManage,
} from "@/lib/permissions";
import { persistEstimateV2HeroTransition, EstimateV2HeroTransitionError } from "@/data/estimate-v2-hero-transition";
import {
  ensureRemoteEstimateCurrentVersionId,
  resolveRemoteEstimateStageId,
  loadCurrentEstimateDraft,
  loadEstimateDraftSeq,
  loadEstimateOperationalSummary,
  type EstimateOperationalUpperBlock,
  saveCurrentEstimateDraft,
  updateProjectEstimateExecutionStatus,
  EstimateDraftConflictError,
  SyncEstimateProjectionUnavailableError,
  emitEstimateDraftSyncEvent,
  syncEstimateProjectionRemote,
} from "@/data/estimate-source";
import { getPlanningSource, syncProjectTasksFromEstimate } from "@/data/planning-source";
import { syncProjectProcurementFromEstimate } from "@/data/procurement-source";
import { getWorkspaceSource, resolveRuntimeWorkspaceMode } from "@/data/workspace-source";
import { trackEvent, trackEventOncePerUser } from "@/lib/analytics";
import { captureMessage } from "@/lib/observability/sentry";
import {
  addComment,
  addEvent,
  addTask,
  getCurrentUser,
  getMembers,
  getProject,
  getProjects,
  getStages,
  getTask,
  getTasks,
  subscribe as subscribeMainStore,
  updateChecklist,
  updateTask,
} from "@/data/store";
import {
  computeLineTotals,
} from "@/lib/estimate-v2/pricing";
import {
  applyFSConstraints,
  autoScheduleSequential,
  clampWorkDates,
  detectCycle,
  toDayIndex,
  validateNoCycles,
} from "@/lib/estimate-v2/schedule";
import { syncProcurementFromEstimateV2 } from "@/lib/estimate-v2/procurement-sync";
import { syncProjectHRFromEstimate } from "@/data/hr-source";
import { removeHRItemsByEstimateV2LineIds, syncHRFromEstimateV2 } from "@/data/hr-store";
import { removeProcurementItemsByEstimateV2LineIds } from "@/data/procurement-store";
import type { ChecklistItem, ChecklistItemType, FinanceVisibility, MemberRole, Task, TaskStatus } from "@/types/entities";
import type {
  ApprovalStamp,
  EstimateExecutionStatus,
  EstimateV2Dependency,
  EstimateV2DiffFieldChange,
  EstimateV2DiffEntityChange,
  EstimateV2DiffResult,
  EstimateV2Project,
  EstimateV2ResourceLine,
  EstimateV2Snapshot,
  EstimateV2Stage,
  EstimateV2StructuredChange,
  EstimateV2Version,
  EstimateV2VersionShareApprovalDisabledReason,
  EstimateV2VersionShareApprovalPolicy,
  EstimateV2Work,
  EstimateV2WorkStatus,
  ProjectMode,
  ResourceLineType,
  ScheduleBaseline,
} from "@/types/estimate-v2";
import { resourceLineTypeFromPersisted, parsePersistedEstimateResourceType } from "@/lib/estimate-v2/resource-type-contract";
import { getDemoEstimateV2State } from "@/data/estimate-v2-seed";

interface EstimateV2ProjectState {
  project: EstimateV2Project;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  lines: EstimateV2ResourceLine[];
  dependencies: EstimateV2Dependency[];
  versions: EstimateV2Version[];
  scheduleBaseline: ScheduleBaseline | null;
  /** Present when hydrated from `get_estimate_operational_summary` (summary/none finance visibility). */
  operationalUpperBlock: EstimateOperationalUpperBlock | null;
  sync: EstimateV2ProjectSyncState;
}

type EstimateV2SyncDomain = "tasks" | "procurement" | "hr";
type EstimateV2SyncStatus = "idle" | "syncing" | "synced" | "skipped" | "error";

export type EstimateV2SyncSkipReason = "permission" | "unauthoritative";

export interface EstimateV2ProjectSyncDomainState {
  status: EstimateV2SyncStatus;
  projectedRevision: string | null;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  lastError: string | null;
  /** Set only while status === "skipped": why the projection did not run. */
  skipReason: EstimateV2SyncSkipReason | null;
}

type EstimateV2DraftSaveStatus = "idle" | "pending" | "saving" | "saved" | "blocked_permission" | "conflict" | "error";

/**
 * Whether this session's sync state is meaningful for gating UI:
 * - "projector": this session persists the draft and projects tasks/procurement/HR.
 * - "blocked_permission": this session may edit the estimate but cannot persist or
 *   project it (finance visibility below "detail" hides the source rows under RLS).
 * - "reader": this session never projects (viewer/contractor or demo/local mode);
 *   its local projectedRevision is not comparable to the server truth and must not
 *   be used to block actions.
 */
export type EstimateV2ProjectionCapability = "projector" | "blocked_permission" | "reader";

export interface EstimateV2ProjectSyncState {
  estimateRevision: string | null;
  draftSaveStatus: EstimateV2DraftSaveStatus;
  draftSaveLastSucceededAt: string | null;
  draftSaveLastError: string | null;
  domains: Record<EstimateV2SyncDomain, EstimateV2ProjectSyncDomainState>;
}

export interface EstimateV2ProjectView {
  project: EstimateV2Project;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  lines: EstimateV2ResourceLine[];
  dependencies: EstimateV2Dependency[];
  versions: EstimateV2Version[];
  scheduleBaseline: ScheduleBaseline | null;
  operationalUpperBlock: EstimateOperationalUpperBlock | null;
  sync: EstimateV2ProjectSyncState;
}

export interface EstimateV2ProjectAccessContext {
  mode: "demo" | "local" | "supabase";
  profileId?: string;
  projectOwnerProfileId?: string;
  membershipRole?: MemberRole | null;
  financeVisibility?: FinanceVisibility | null;
}

interface EstimateV2WorkspaceCache {
  savedAt: string;
  state: EstimateV2ProjectView;
}

interface ApproveVersionOptions {
  actorId?: string;
}

interface SubmitVersionOptions {
  shareApprovalPolicy?: EstimateV2VersionShareApprovalPolicy;
  shareApprovalDisabledReason?: EstimateV2VersionShareApprovalDisabledReason;
}

interface SetProjectEstimateStatusOptions {
  skipSetup?: boolean;
  ownerProfileId?: string;
  projectOwnerProfileId?: string;
  projectTasks?: Task[];
}

type TransitionEstimateV2ProjectToInWorkOptions = SetProjectEstimateStatusOptions;

type SetProjectEstimateStatusFailureReason = "forbidden" | "missing_work_dates" | "incomplete_tasks";

interface StatusFailureTask {
  taskId: string | null;
  title: string;
}

export interface SetProjectEstimateStatusResult {
  ok: boolean;
  reason?: SetProjectEstimateStatusFailureReason;
  missingWorkIds?: string[];
  incompleteTasks?: StatusFailureTask[];
  autoScheduled?: boolean;
  baselineCaptured?: boolean;
}

type TransitionEstimateV2ToInWorkFailureReason =
  | "forbidden"
  | "missing_work_dates"
  | "transition_failed"
  | "transition_blocked";

export interface TransitionEstimateV2ToInWorkResult {
  ok: boolean;
  reason?: TransitionEstimateV2ToInWorkFailureReason;
  missingWorkIds?: string[];
  autoScheduled?: boolean;
  baselineCaptured?: boolean;
  errorMessage?: string;
  blocking?: boolean;
}

interface InWorkTransitionDraft {
  works: EstimateV2Work[];
  baseline: ScheduleBaseline;
  appliedAt: string;
  autoScheduled: boolean;
}

type Listener = () => void;

const listeners = new Set<Listener>();
const statesByProjectId = new Map<string, EstimateV2ProjectState>();
const accessContextByProjectId = new Map<string, EstimateV2ProjectAccessContext>();
const DEMO_PROJECT_IDS = new Set(["project-1", "project-2", "project-3"]);
const RESOURCE_TYPE_ORDER: Record<ResourceLineType, number> = {
  material: 0,
  tool: 1,
  labor: 2,
  subcontractor: 3,
  overhead: 4,
  other: 5,
};
const ESTIMATE_V2_REMOTE_SYNC_DEBOUNCE_MS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let crossSyncInProgress = false;
let mainStoreUnsubscribe: (() => void) | null = null;

// Invalidate any stale default-seeded states for demo projects when the demo
// session becomes active. Without this, any state cached before the demo session
// was entered (e.g. during app boot) would stick at estimateStatus="planning".
let lastKnownDemoActive = false;
let lastKnownAuthProfileId: string | null = null;
if (typeof window !== "undefined") {
  lastKnownDemoActive = isDemoSessionActive();
  lastKnownAuthProfileId = getStoredAuthProfile()?.id ?? null;
  subscribeAuthState(() => {
    const active = isDemoSessionActive();
    if (active && !lastKnownDemoActive) {
      DEMO_PROJECT_IDS.forEach((projectId) => {
        const existing = statesByProjectId.get(projectId);
        if (existing && existing.lines.length === 0) {
          statesByProjectId.delete(projectId);
        }
      });
      listeners.forEach((listener) => listener());
    }
    lastKnownDemoActive = active;

    // Auth identity changed (logout or account switch in the same tab): the
    // per-project supabase runtime state — access contexts, sync statuses,
    // hydrated rows — belongs to the previous account and must not leak into
    // the next one (wrong capability, wrong hydration path, stale data).
    const authProfileId = getStoredAuthProfile()?.id ?? null;
    if (authProfileId !== lastKnownAuthProfileId) {
      lastKnownAuthProfileId = authProfileId;
      resetEstimateV2SupabaseRuntimeSessionState();
    }
  });
}
const remoteHydrationPromises = new Map<string, Promise<void>>();
// draft_seq the local draft is BASED on, captured at hydrate and advanced on
// each successful save. Passed to saveCurrentEstimateDraft as the CAS
// baseline: a save of state hydrated before another session's save loses the
// CAS and converges instead of overwriting. null = pre-P1 database (no CAS).
const draftSeqBaseByProjectId = new Map<string, number | null>();
const remoteDraftSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const remoteDraftSyncErrorSignatureByProjectId = new Map<string, string>();
const heroTransitionInFlightByProjectId = new Set<string>();
const deferredDraftSyncByProjectId = new Set<string>();
const remoteProjectionSyncInFlightByProjectId = new Set<string>();
// Promise for an in-flight runProjectDraftSync, so flushProjectDraftSync can await it.
const runningProjectDraftSyncByProjectId = new Map<string, Promise<void>>();
const retainedSupabaseSyncProfileIdByProjectId = new Map<string, string>();
// Last registered supabase access context, kept after the registering page
// unmounts. Only two pages register a context (Estimate, Procurement); without
// this fallback, navigating to Tasks/HR mid-debounce made the engine and the
// capability check lose all permission knowledge — pending syncs were silently
// killed until the user returned. Cleared with the rest of the runtime state
// when the session/profile changes.
const retainedSupabaseAccessContextByProjectId = new Map<string, EstimateV2ProjectAccessContext>();
// Projects whose in-memory state exists ONLY because a getter default-seeded it
// (ensureProjectState) — no remote hydrate installed it and no user edit touched
// it. Such placeholder state must never be cached to localStorage or autosaved:
// a debounce firing before hydration would persist a default/empty snapshot over
// the real remote draft. Cleared on hydrate install and on any real mutation.
const defaultSeededStateProjectIds = new Set<string>();

function notify() {
  listeners.forEach((listener) => listener());
}

function traceEstimateDraftSync(label: string, projectId: string, data: Record<string, unknown>) {
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.debug(`[estimate-draft-sync] ${label}`, { projectId, ...data });
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

const MAX_BPS = 10_000;

function clampBps(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.min(MAX_BPS, Math.max(0, Math.round(value)));
}

function clampBpsOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return Math.min(MAX_BPS, Math.max(0, Math.round(value)));
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function deterministicHex(seed: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x811c9dc5;
  let hashC = 0x811c9dc5;
  let hashD = 0x811c9dc5;

  for (let i = 0; i < seed.length; i += 1) {
    const code = seed.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193);
    hashB ^= code + 17;
    hashB = Math.imul(hashB, 0x01000193);
    hashC ^= code + 31;
    hashC = Math.imul(hashC, 0x01000193);
    hashD ^= code + 47;
    hashD = Math.imul(hashD, 0x01000193);
  }

  return [hashA, hashB, hashC, hashD]
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function deterministicUuid(seed: string): string {
  const hex = deterministicHex(`${seed}:a`) + deterministicHex(`${seed}:b`);
  const chars = hex.slice(0, 32).split("");
  chars[12] = "5";
  const variant = parseInt(chars[16], 16);
  chars[16] = ["8", "9", "a", "b"][variant % 4];
  const normalized = chars.join("");

  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}

function ensureWorkspaceUuid(projectId: string, namespace: string, value: string): string {
  if (UUID_RE.test(value)) return value;
  return deterministicUuid(`${projectId}:${namespace}:${value}`);
}

function runWithCrossSyncGuard<T>(fn: () => T): T {
  crossSyncInProgress = true;
  try {
    return fn();
  } finally {
    crossSyncInProgress = false;
  }
}

function checklistTypeForLineType(type: ResourceLineType): ChecklistItemType {
  if (type === "material") return "material";
  if (type === "tool") return "tool";
  return "subtask";
}

function mapTaskStatusToWorkStatus(status: TaskStatus): EstimateV2WorkStatus {
  if (status === "in_progress") return "in_progress";
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  return "not_started";
}

function mapWorkStatusToTaskStatus(status: EstimateV2WorkStatus): TaskStatus {
  if (status === "in_progress") return "in_progress";
  if (status === "done") return "done";
  if (status === "blocked") return "blocked";
  return "not_started";
}

function normalizedLagDays(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

function isoStartOfToday(): string {
  const date = new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return start.toISOString();
}

function normalizeIsoDate(input: string): string | null {
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeChecklistItemText(line: EstimateV2ResourceLine): string {
  return line.title;
}

function equalChecklistItem(a: ChecklistItem, b: ChecklistItem): boolean {
  return a.id === b.id
    && a.text === b.text
    && a.done === b.done
    && (a.type ?? "subtask") === (b.type ?? "subtask")
    && (a.procurementItemId ?? null) === (b.procurementItemId ?? null)
    && (a.estimateV2LineId ?? null) === (b.estimateV2LineId ?? null)
    && (a.estimateV2WorkId ?? null) === (b.estimateV2WorkId ?? null)
    && (a.estimateV2ResourceType ?? null) === (b.estimateV2ResourceType ?? null)
    && (a.estimateV2QtyMilli ?? null) === (b.estimateV2QtyMilli ?? null)
    && (a.estimateV2Unit ?? null) === (b.estimateV2Unit ?? null);
}

function equalChecklistArray(a: ChecklistItem[], b: ChecklistItem[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!equalChecklistItem(a[i], b[i])) return false;
  }
  return true;
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

function cloneSnapshot(snapshot: EstimateV2Snapshot): EstimateV2Snapshot {
  return {
    project: { ...snapshot.project },
    stages: snapshot.stages.map((stage) => ({ ...stage })),
    works: snapshot.works.map((work) => ({ ...work })),
    lines: snapshot.lines.map((line) => ({ ...line })),
    dependencies: snapshot.dependencies.map((dep) => ({ ...dep })),
  };
}

function createEmptySyncDomainState(): EstimateV2ProjectSyncDomainState {
  return {
    status: "idle",
    projectedRevision: null,
    lastAttemptedAt: null,
    lastSucceededAt: null,
    lastError: null,
    skipReason: null,
  };
}

function createEmptyProjectSyncState(): EstimateV2ProjectSyncState {
  return {
    estimateRevision: null,
    draftSaveStatus: "idle",
    draftSaveLastSucceededAt: null,
    draftSaveLastError: null,
    domains: {
      tasks: createEmptySyncDomainState(),
      procurement: createEmptySyncDomainState(),
      hr: createEmptySyncDomainState(),
    },
  };
}

function cloneProjectSyncState(sync?: EstimateV2ProjectSyncState | null): EstimateV2ProjectSyncState {
  const source = sync ?? createEmptyProjectSyncState();
  return {
    estimateRevision: source.estimateRevision ?? null,
    draftSaveStatus: source.draftSaveStatus ?? "idle",
    draftSaveLastSucceededAt: source.draftSaveLastSucceededAt ?? null,
    draftSaveLastError: source.draftSaveLastError ?? null,
    domains: {
      tasks: { ...createEmptySyncDomainState(), ...(source.domains.tasks ?? {}) },
      procurement: { ...createEmptySyncDomainState(), ...(source.domains.procurement ?? {}) },
      hr: { ...createEmptySyncDomainState(), ...(source.domains.hr ?? {}) },
    },
  };
}

function isNonPlanningEstimateStatus(status: EstimateExecutionStatus): boolean {
  return status === "in_work" || status === "paused" || status === "finished";
}

function buildEstimateProjectionRevision(state: Pick<EstimateV2ProjectState, "project" | "stages" | "works" | "lines">): string {
  const payload = {
    estimateStatus: state.project.estimateStatus,
    stages: [...state.stages]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map((stage) => ({
        id: stage.id,
        order: stage.order,
        title: stage.title,
        discountBps: stage.discountBps,
      })),
    works: [...state.works]
      .sort((left, right) => (
        left.stageId.localeCompare(right.stageId)
        || left.order - right.order
        || left.id.localeCompare(right.id)
      ))
      .map((work) => ({
        id: work.id,
        stageId: work.stageId,
        order: work.order,
        title: work.title,
        discountBps: work.discountBps,
        plannedStart: work.plannedStart ?? null,
        plannedEnd: work.plannedEnd ?? null,
      })),
    lines: [...state.lines]
      .sort((left, right) => (
        left.workId.localeCompare(right.workId)
        || RESOURCE_TYPE_ORDER[left.type] - RESOURCE_TYPE_ORDER[right.type]
        || left.id.localeCompare(right.id)
      ))
      .map((line) => ({
        id: line.id,
        stageId: line.stageId,
        workId: line.workId,
        type: line.type,
        title: line.title,
        unit: line.unit,
        qtyMilli: line.qtyMilli,
        costUnitCents: line.costUnitCents,
        markupBps: line.markupBps,
        discountBpsOverride: line.discountBpsOverride ?? null,
        taxBpsOverride: line.taxBpsOverride ?? null,
        assigneeId: line.assigneeId ?? null,
      })),
  };

  return deterministicHex(JSON.stringify(payload));
}

function ensureProjectSyncState(state: EstimateV2ProjectState): EstimateV2ProjectSyncState {
  const nextSync = cloneProjectSyncState(state.sync);
  const nextRevision = buildEstimateProjectionRevision(state);
  const previousRevision = nextSync.estimateRevision;
  nextSync.estimateRevision = nextRevision;

  (["tasks", "procurement", "hr"] as const).forEach((domain) => {
    const domainState = nextSync.domains[domain];
    if (isNonPlanningEstimateStatus(state.project.estimateStatus)) {
      if (previousRevision !== nextRevision && domainState.projectedRevision !== nextRevision && domainState.status !== "syncing") {
        domainState.status = "idle";
        domainState.lastError = null;
        domainState.skipReason = null;
      }
      return;
    }

    domainState.status = "synced";
    domainState.projectedRevision = nextRevision;
    domainState.lastError = null;
    domainState.skipReason = null;
  });

  state.sync = nextSync;
  return nextSync;
}

function setProjectSyncDomainStatus(
  state: EstimateV2ProjectState,
  domain: EstimateV2SyncDomain,
  patch: Partial<EstimateV2ProjectSyncDomainState>,
) {
  const sync = ensureProjectSyncState(state);
  sync.domains[domain] = {
    ...sync.domains[domain],
    ...patch,
  };
}

function getRetainedSupabaseSyncProfileId(projectId: string): string | null {
  const context = accessContextByProjectId.get(projectId);
  if (context?.mode === "supabase" && context.profileId) {
    retainedSupabaseSyncProfileIdByProjectId.set(projectId, context.profileId);
    return context.profileId;
  }

  return retainedSupabaseSyncProfileIdByProjectId.get(projectId) ?? null;
}

function cloneOperationalUpperBlock(
  block: EstimateOperationalUpperBlock | null | undefined,
): EstimateOperationalUpperBlock | null {
  if (!block) return null;
  return {
    ...block,
    timing: { ...block.timing },
    resourceCostBreakdownClientSafeOnly: block.resourceCostBreakdownClientSafeOnly
      ? { ...block.resourceCostBreakdownClientSafeOnly }
      : null,
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
    scheduleBaseline: state.scheduleBaseline
      ? {
        ...state.scheduleBaseline,
        works: state.scheduleBaseline.works.map((work) => ({ ...work })),
      }
      : null,
    operationalUpperBlock: cloneOperationalUpperBlock(state.operationalUpperBlock),
    sync: cloneProjectSyncState(state.sync),
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

function workspaceCacheKey(projectId: string, profileId: string): string {
  return `estimate-v2-workspace:${projectId}:${profileId}`;
}

function loadWorkspaceEstimateCache(projectId: string, profileId: string): EstimateV2WorkspaceCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(workspaceCacheKey(projectId, profileId));
    if (!raw) return null;
    return JSON.parse(raw) as EstimateV2WorkspaceCache;
  } catch {
    return null;
  }
}

function saveWorkspaceEstimateCache(
  projectId: string,
  profileId: string,
  state: EstimateV2ProjectState,
): void {
  if (typeof window === "undefined") return;
  try {
    const normalized = normalizeStateForWorkspace(projectId, state);
    const payload: EstimateV2WorkspaceCache = {
      savedAt: nowIso(),
      state: cloneState(normalized),
    };
    window.localStorage.setItem(workspaceCacheKey(projectId, profileId), JSON.stringify(payload));
  } catch {
    // Ignore browser storage failures and keep the in-memory estimate state alive.
  }
}

function normalizeSnapshotForWorkspace(projectId: string, snapshot: EstimateV2Snapshot): EstimateV2Snapshot {
  const stageIdById = new Map(snapshot.stages.map((stage) => [
    stage.id,
    ensureWorkspaceUuid(projectId, "stage", stage.id),
  ]));
  const workIdById = new Map(snapshot.works.map((work) => [
    work.id,
    ensureWorkspaceUuid(projectId, "work", work.id),
  ]));
  const lineIdById = new Map(snapshot.lines.map((line) => [
    line.id,
    ensureWorkspaceUuid(projectId, "line", line.id),
  ]));
  const dependencyIdById = new Map(snapshot.dependencies.map((dependency) => [
    dependency.id,
    ensureWorkspaceUuid(projectId, "dependency", dependency.id),
  ]));

  return {
    project: {
      ...snapshot.project,
      id: ensureWorkspaceUuid(projectId, "estimate", snapshot.project.id || projectId),
    },
    stages: snapshot.stages.map((stage) => ({
      ...stage,
      id: stageIdById.get(stage.id) ?? stage.id,
    })),
    works: snapshot.works.map((work) => ({
      ...work,
      id: workIdById.get(work.id) ?? work.id,
      stageId: stageIdById.get(work.stageId) ?? ensureWorkspaceUuid(projectId, "stage", work.stageId),
    })),
    lines: snapshot.lines.map((line) => ({
      ...line,
      id: lineIdById.get(line.id) ?? line.id,
      stageId: stageIdById.get(line.stageId) ?? ensureWorkspaceUuid(projectId, "stage", line.stageId),
      workId: workIdById.get(line.workId) ?? ensureWorkspaceUuid(projectId, "work", line.workId),
    })),
    dependencies: snapshot.dependencies.map((dependency) => ({
      ...dependency,
      id: dependencyIdById.get(dependency.id) ?? dependency.id,
      fromWorkId: workIdById.get(dependency.fromWorkId) ?? ensureWorkspaceUuid(projectId, "work", dependency.fromWorkId),
      toWorkId: workIdById.get(dependency.toWorkId) ?? ensureWorkspaceUuid(projectId, "work", dependency.toWorkId),
    })),
  };
}

function normalizeStateForWorkspace(projectId: string, state: EstimateV2ProjectState): EstimateV2ProjectState {
  const normalizedSnapshot = normalizeSnapshotForWorkspace(projectId, getSnapshotFromState(state));
  const normalizedWorkIdById = new Map(normalizedSnapshot.works.map((work) => [work.id, work.id]));
  const normalizedState: EstimateV2ProjectState = {
    project: normalizedSnapshot.project,
    stages: normalizedSnapshot.stages,
    works: normalizedSnapshot.works,
    lines: normalizedSnapshot.lines,
    dependencies: normalizedSnapshot.dependencies,
    versions: state.versions.map((version) => ({
      ...version,
      snapshot: normalizeSnapshotForWorkspace(projectId, version.snapshot),
      approvalStamp: version.approvalStamp ? { ...version.approvalStamp } : null,
    })),
    scheduleBaseline: state.scheduleBaseline
      ? {
        ...state.scheduleBaseline,
        works: state.scheduleBaseline.works.map((work) => ({
          ...work,
          workId: normalizedWorkIdById.get(ensureWorkspaceUuid(projectId, "work", work.workId))
            ?? ensureWorkspaceUuid(projectId, "work", work.workId),
        })),
      }
      : null,
    operationalUpperBlock: cloneOperationalUpperBlock(state.operationalUpperBlock),
    sync: cloneProjectSyncState(state.sync),
  };

  ensureProjectSyncState(normalizedState);

  return normalizedState;
}

function clearScheduledProjectDraftSync(projectId: string) {
  const existingTimer = remoteDraftSyncTimers.get(projectId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    remoteDraftSyncTimers.delete(projectId);
  }
  deferredDraftSyncByProjectId.delete(projectId);
}

function getEstimateV2ProjectRuntimeSessionKey(
  context: Pick<EstimateV2ProjectAccessContext, "mode" | "profileId"> | null | undefined,
): string {
  if (!context) return "";
  return `${context.mode}:${context.profileId ?? ""}`;
}

function clearEstimateV2ProjectRuntimeState(projectId: string) {
  clearScheduledProjectDraftSync(projectId);
  statesByProjectId.delete(projectId);
  draftSeqBaseByProjectId.delete(projectId);
  remoteDraftSyncErrorSignatureByProjectId.delete(projectId);
  heroTransitionInFlightByProjectId.delete(projectId);
  remoteProjectionSyncInFlightByProjectId.delete(projectId);
  retainedSupabaseSyncProfileIdByProjectId.delete(projectId);
  retainedSupabaseAccessContextByProjectId.delete(projectId);
  defaultSeededStateProjectIds.delete(projectId);
}

/**
 * Live access context when a registering page is mounted; otherwise the last
 * retained supabase context for this project (same session). An explicitly
 * registered demo/local context is respected as-is — the fallback applies only
 * when no context is registered at all.
 */
function resolveEstimateAccessContext(projectId: string): EstimateV2ProjectAccessContext | null {
  return accessContextByProjectId.get(projectId)
    ?? retainedSupabaseAccessContextByProjectId.get(projectId)
    ?? null;
}

/**
 * Drop every project's supabase runtime state (contexts, sync bookkeeping,
 * hydrated rows). Called on auth identity change — logout or same-tab account
 * switch — so nothing from the previous account survives into the next one.
 * Demo/local project state is left alone.
 */
function resetEstimateV2SupabaseRuntimeSessionState(): void {
  const supabaseProjectIds = new Set<string>([
    ...retainedSupabaseSyncProfileIdByProjectId.keys(),
    ...retainedSupabaseAccessContextByProjectId.keys(),
  ]);
  accessContextByProjectId.forEach((context, projectId) => {
    if (context.mode === "supabase") {
      supabaseProjectIds.add(projectId);
    }
  });
  if (supabaseProjectIds.size === 0) {
    return;
  }
  supabaseProjectIds.forEach((projectId) => {
    clearEstimateV2ProjectRuntimeState(projectId);
    accessContextByProjectId.delete(projectId);
  });
  notify();
}

function isCurrentSupabaseProjectProfile(projectId: string, profileId: string): boolean {
  return getRetainedSupabaseSyncProfileId(projectId) === profileId;
}

function resolveEstimateSyncRole(context: EstimateV2ProjectAccessContext): MemberRole {
  if (context.membershipRole) return context.membershipRole;
  if (context.profileId && context.projectOwnerProfileId && context.profileId === context.projectOwnerProfileId) {
    return "owner";
  }
  return "viewer";
}

function canAccessSensitiveEstimateRows(
  context: EstimateV2ProjectAccessContext | null | undefined,
): boolean {
  if (!context) return false;
  const role = resolveEstimateSyncRole(context);
  if (role === "owner") return true;
  return context.financeVisibility === "detail";
}

/** Non-detail finance visibility: use operational estimate RPC instead of table-backed works/lines. */
function shouldHydrateEstimateViaOperationalRpc(
  context: EstimateV2ProjectAccessContext | null | undefined,
): boolean {
  if (!context) return false;
  if (canAccessSensitiveEstimateRows(context)) return false;
  return context.financeVisibility === "summary" || context.financeVisibility === "none";
}

function getManagedEstimateRemoteSyncContext(projectId: string): { profileId: string } | null {
  const context = resolveEstimateAccessContext(projectId);
  if (!context || context.mode !== "supabase" || !context.profileId) {
    return null;
  }

  const estimateAccess = getProjectDomainAccessForRole(resolveEstimateSyncRole(context), "estimate");
  if (!projectDomainAllowsManage(estimateAccess)) {
    return null;
  }

  return {
    profileId: context.profileId,
  };
}

/**
 * How this session relates to the estimate→domains projection. Pages must gate
 * "projection behind / still syncing" blocking ONLY for "projector" sessions:
 * a reader's local projectedRevision never advances and says nothing about the
 * server truth it reads through react-query.
 */
export function getEstimateV2ProjectionCapability(projectId: string): EstimateV2ProjectionCapability {
  const managed = getManagedEstimateRemoteSyncContext(projectId);
  if (!managed) return "reader";
  const context = resolveEstimateAccessContext(projectId);
  return canAccessSensitiveEstimateRows(context) ? "projector" : "blocked_permission";
}

/**
 * Best-effort mirror of the execution status onto the estimate root for the portfolio
 * rollup. Fire-and-forget: only in managed supabase sync, errors swallowed; a no-row
 * update (root not yet synced) is a harmless no-op.
 *
 * Self-healing is asymmetric: a lost in_work write is recovered by the RPC reader fallback
 * (root status='approved' → in_work), but paused/finished have NO server-side fallback, so
 * those rely on the hydration reconciliation (this is re-fired on every non-planning
 * hydrate) to converge after a dropped write.
 */
function persistExecutionStatusIfManaged(projectId: string, status: EstimateExecutionStatus): void {
  if (!getManagedEstimateRemoteSyncContext(projectId)) return;
  const estimateId = statesByProjectId.get(projectId)?.project.id;
  if (!estimateId) return;
  void updateProjectEstimateExecutionStatus(estimateId, status).catch((error) => {
    if (import.meta.env.DEV) {
      console.warn(`execution_status sync failed for ${projectId}`, error);
    }
  });
}

function queueProjectDraftSync(projectId: string) {
  const state = statesByProjectId.get(projectId);
  const profileId = getRetainedSupabaseSyncProfileId(projectId);
  const managedSyncContext = getManagedEstimateRemoteSyncContext(projectId);
  if (!state || !profileId) {
    return;
  }

  // A default-seeded placeholder (getter-created, never hydrated, never edited)
  // is not user data: caching it would clobber the profile's real workspace
  // cache, and autosaving it could persist a default snapshot over the remote
  // draft when the debounce beats a slow hydration.
  if (defaultSeededStateProjectIds.has(projectId)) {
    return;
  }

  ensureProjectSyncState(state);
  saveWorkspaceEstimateCache(projectId, profileId, state);

  if (!managedSyncContext) {
    clearScheduledProjectDraftSync(projectId);
    return;
  }

  if (heroTransitionInFlightByProjectId.has(projectId) || remoteProjectionSyncInFlightByProjectId.has(projectId)) {
    deferredDraftSyncByProjectId.add(projectId);
    return;
  }

  // Honesty over silence: an editor whose finance visibility hides the estimate
  // rows under RLS cannot persist or project this draft. Say so instead of
  // parking the state at "pending" forever while the edits are silently lost.
  if (!canAccessSensitiveEstimateRows(resolveEstimateAccessContext(projectId))) {
    const blockedSync = ensureProjectSyncState(state);
    blockedSync.draftSaveStatus = "blocked_permission";
    blockedSync.draftSaveLastError = null;
    if (isNonPlanningEstimateStatus(state.project.estimateStatus)) {
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        blockedSync.domains[domain] = {
          ...blockedSync.domains[domain],
          status: "skipped",
          skipReason: "permission",
          lastError: null,
        };
      });
    }
    clearScheduledProjectDraftSync(projectId);
    saveWorkspaceEstimateCache(projectId, profileId, state);
    return;
  }

  const syncState = ensureProjectSyncState(state);
  if (syncState.draftSaveStatus !== "saving") {
    syncState.draftSaveStatus = "pending";
  }

  const existingTimer = remoteDraftSyncTimers.get(projectId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    remoteDraftSyncTimers.delete(projectId);
    void runAndTrackProjectDraftSync(projectId);
  }, ESTIMATE_V2_REMOTE_SYNC_DEBOUNCE_MS);

  remoteDraftSyncTimers.set(projectId, timer);
}

// Run a draft sync while tracking its promise so flushProjectDraftSync can await it.
function runAndTrackProjectDraftSync(projectId: string): Promise<void> {
  const run = runProjectDraftSync(projectId).finally(() => {
    if (runningProjectDraftSyncByProjectId.get(projectId) === run) {
      runningProjectDraftSyncByProjectId.delete(projectId);
    }
  });
  runningProjectDraftSyncByProjectId.set(projectId, run);
  return run;
}

/**
 * Flush any pending or in-flight debounced draft sync and await completion. Call
 * this before a server-side estimate mutation (e.g. apply_template_stage_to_estimate)
 * so the autosave's prune step can't race and DELETE the freshly-applied rows.
 * No-op when there is no managed remote sync (local/demo mode).
 */
export async function flushProjectDraftSync(projectId: string): Promise<void> {
  if (!getManagedEstimateRemoteSyncContext(projectId)) return;
  for (let i = 0; i < 5 && hasPendingProjectDraftSync(projectId); i += 1) {
    const timer = remoteDraftSyncTimers.get(projectId);
    if (timer) {
      clearTimeout(timer);
      remoteDraftSyncTimers.delete(projectId);
      await runAndTrackProjectDraftSync(projectId);
      continue;
    }
    const running = runningProjectDraftSyncByProjectId.get(projectId);
    if (running) {
      await running;
      continue;
    }
    if (deferredDraftSyncByProjectId.has(projectId)) {
      // A deferred entry with no running promise means a hero transition is (or
      // was) in flight — running now would race the transition's server writes
      // (the autosave prune can delete rows the transition just created). Leave
      // the deferred flag for the transition's completion re-queue to consume.
      if (heroTransitionInFlightByProjectId.has(projectId)) {
        break;
      }
      deferredDraftSyncByProjectId.delete(projectId);
      await runAndTrackProjectDraftSync(projectId);
      continue;
    }
    // Only a hero transition remains in-flight (rare); it cannot be awaited here.
    break;
  }
}

function hasProjectDraftProjectionDrift(
  projectId: string,
  estimateRevision: string | null,
): boolean {
  if (!estimateRevision) {
    return false;
  }

  const latestState = statesByProjectId.get(projectId);
  if (!latestState) {
    return true;
  }

  return ensureProjectSyncState(latestState).estimateRevision !== estimateRevision;
}

/** A restored cache whose save never completed (tab closed mid-debounce). */
function hasUnflushedDraftSaveStatus(state: EstimateV2ProjectState): boolean {
  const status = state.sync?.draftSaveStatus;
  return status === "pending" || status === "saving";
}

function hasPendingProjectDraftSync(projectId: string): boolean {
  return heroTransitionInFlightByProjectId.has(projectId)
    || remoteProjectionSyncInFlightByProjectId.has(projectId)
    || deferredDraftSyncByProjectId.has(projectId)
    || remoteDraftSyncTimers.has(projectId);
}

function commitProjectStateChange(projectId: string) {
  const state = statesByProjectId.get(projectId);
  if (state) {
    ensureProjectSyncState(state);
  }
  // A real mutation makes the state user-owned: it is now legitimate (and
  // required) to cache and autosave it, even if it started default-seeded.
  defaultSeededStateProjectIds.delete(projectId);
  queueProjectDraftSync(projectId);
  notify();
}

function syncExternalDomainsFromEstimate(projectId: string, state: EstimateV2ProjectState) {
  const syncState = {
    project: state.project,
    works: state.works,
    lines: state.lines,
  };
  syncProcurementFromEstimateV2(projectId, syncState);
  syncHRFromEstimateV2(projectId, syncState);
}

function applyTaskIdsToState(
  projectId: string,
  taskIdByWorkId: Record<string, string>,
): EstimateV2Work[] {
  const state = statesByProjectId.get(projectId);
  if (!state) {
    return [];
  }

  let changed = false;
  state.works = state.works.map((work) => {
    const nextTaskId = taskIdByWorkId[work.id] ?? work.taskId;
    if (nextTaskId === work.taskId) {
      return work;
    }

    changed = true;
    return {
      ...work,
      taskId: nextTaskId,
    };
  });

  if (changed) {
    state.project.updatedAt = nowIso();
    ensureProjectSyncState(state);
  }

  return state.works.map((work) => ({ ...work }));
}

/**
 * Pre-P1 fallback: the client-orchestrated three-step projection (tasks →
 * procurement → HR), kept verbatim for one release so a frontend deployed
 * ahead of the sync_estimate_projection migration keeps projecting. Delete
 * once prod is confirmed on the RPC.
 */
async function runLegacyClientProjection(input: {
  projectId: string;
  profileId: string;
  normalized: Pick<EstimateV2ProjectState, "project" | "works" | "lines">;
  projectionRevision: string | null;
  estimateRevision: string | null;
}): Promise<void> {
  const { projectId, profileId, normalized, projectionRevision, estimateRevision } = input;
  let worksForDownstream = normalized.works.map((work) => ({ ...work }));

  try {
    if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
      return;
    }
    const taskIdByWorkId = await syncProjectTasksFromEstimate({
      projectId,
      estimateStatus: normalized.project.estimateStatus,
      works: normalized.works,
      lines: normalized.lines,
      profileId,
    });
    if (!isCurrentSupabaseProjectProfile(projectId, profileId)) {
      return;
    }
    if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
      return;
    }
    const syncedWorks = applyTaskIdsToState(projectId, taskIdByWorkId);
    worksForDownstream = syncedWorks.length > 0
      ? syncedWorks
      : worksForDownstream.map((work) => ({
        ...work,
        taskId: taskIdByWorkId[work.id] ?? work.taskId,
      }));
    const latestState = statesByProjectId.get(projectId);
    if (latestState) {
      setProjectSyncDomainStatus(latestState, "tasks", {
        status: "synced",
        projectedRevision: estimateRevision,
        lastSucceededAt: nowIso(),
        lastError: null,
        skipReason: null,
      });
      saveWorkspaceEstimateCache(projectId, profileId, latestState);
    }
  } catch (error) {
    // Procurement and HR depend on the task ids this step resolves; projecting
    // them from a work set with stale/missing taskIds silently drops HR lines.
    // Stop the fan-out and report all three domains instead of a fake partial sync.
    const latestState = statesByProjectId.get(projectId);
    if (latestState) {
      setProjectSyncDomainStatus(latestState, "tasks", {
        status: "error",
        lastError: error instanceof Error ? error.message : "Unable to sync tasks from estimate.",
      });
      (["procurement", "hr"] as const).forEach((domain) => {
        setProjectSyncDomainStatus(latestState, domain, {
          status: "error",
          lastError: "Blocked: tasks projection failed.",
        });
      });
      saveWorkspaceEstimateCache(projectId, profileId, latestState);
    }
    console.error("Failed to sync estimate v2 tasks projection", error);
    notify();
    return;
  } finally {
    notify();
  }

  try {
    if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
      return;
    }
    await syncProjectProcurementFromEstimate({
      projectId,
      estimateStatus: normalized.project.estimateStatus,
      works: worksForDownstream,
      lines: normalized.lines,
      profileId,
    });
    if (!isCurrentSupabaseProjectProfile(projectId, profileId)) {
      return;
    }
    if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
      return;
    }
    const latestState = statesByProjectId.get(projectId);
    if (latestState) {
      setProjectSyncDomainStatus(latestState, "procurement", {
        status: "synced",
        projectedRevision: estimateRevision,
        lastSucceededAt: nowIso(),
        lastError: null,
        skipReason: null,
      });
      saveWorkspaceEstimateCache(projectId, profileId, latestState);
    }
  } catch (error) {
    const latestState = statesByProjectId.get(projectId);
    if (latestState) {
      setProjectSyncDomainStatus(latestState, "procurement", {
        status: "error",
        lastError: error instanceof Error ? error.message : "Unable to sync procurement from estimate.",
      });
      saveWorkspaceEstimateCache(projectId, profileId, latestState);
    }
    console.error("Failed to sync estimate v2 procurement projection", error);
  } finally {
    notify();
  }

  try {
    if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
      return;
    }
    await syncProjectHRFromEstimate(
      { kind: "supabase", profileId },
      {
        projectId,
        estimateStatus: normalized.project.estimateStatus,
        works: worksForDownstream,
        lines: normalized.lines,
      },
    );
    if (!isCurrentSupabaseProjectProfile(projectId, profileId)) {
      return;
    }
    if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
      return;
    }
    const latestState = statesByProjectId.get(projectId);
    if (latestState) {
      setProjectSyncDomainStatus(latestState, "hr", {
        status: "synced",
        projectedRevision: estimateRevision,
        lastSucceededAt: nowIso(),
        lastError: null,
        skipReason: null,
      });
      saveWorkspaceEstimateCache(projectId, profileId, latestState);
    }
  } catch (error) {
    const latestState = statesByProjectId.get(projectId);
    if (latestState) {
      setProjectSyncDomainStatus(latestState, "hr", {
        status: "error",
        lastError: error instanceof Error ? error.message : "Unable to sync HR from estimate.",
      });
      saveWorkspaceEstimateCache(projectId, profileId, latestState);
    }
    console.error("Failed to sync estimate v2 HR projection", error);
  } finally {
    notify();
  }
}

async function runProjectDraftSync(projectId: string) {
  const state = statesByProjectId.get(projectId);
  const managedSyncContext = getManagedEstimateRemoteSyncContext(projectId);
  const accessContext = resolveEstimateAccessContext(projectId);
  if (!state || !managedSyncContext) {
    return;
  }
  const { profileId } = managedSyncContext;

  remoteProjectionSyncInFlightByProjectId.add(projectId);
  const attemptedAt = nowIso();
  const shouldProject = isNonPlanningEstimateStatus(state.project.estimateStatus);

  try {
    const sync = ensureProjectSyncState(state);
    const projectionRevision = sync.estimateRevision;
    if (!isCurrentSupabaseProjectProfile(projectId, profileId)) {
      return;
    }
    if (shouldProject) {
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        setProjectSyncDomainStatus(state, domain, {
          status: "syncing",
          lastAttemptedAt: attemptedAt,
          lastError: null,
        });
      });
      notify();
    }

    const normalized = normalizeStateForWorkspace(projectId, state);
    saveWorkspaceEstimateCache(projectId, profileId, normalized);

    // Do not let an older in-flight run overwrite the remote estimate draft
    // once a newer local revision has already been committed.
    if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
      return;
    }

    const canRunSensitiveEstimateProjection = canAccessSensitiveEstimateRows(accessContext);
    const hasStructure = normalized.stages.length > 0 || normalized.works.length > 0 || normalized.lines.length > 0;
    const snapshotIsAuthoritative = canRunSensitiveEstimateProjection && hasStructure;
    const worksWithoutLines = normalized.works.length > 0 && normalized.lines.length === 0;
    const allowPrune = snapshotIsAuthoritative && !worksWithoutLines;
    if (canRunSensitiveEstimateProjection) {
      const syncState = ensureProjectSyncState(state);
      syncState.draftSaveStatus = "saving";
      syncState.draftSaveLastError = null;
      notify();
      const expectedDraftSeq = draftSeqBaseByProjectId.get(projectId);
      try {
        await saveCurrentEstimateDraft(projectId, getSnapshotFromState(normalized), {
          profileId,
          shouldAbort: () => hasProjectDraftProjectionDrift(projectId, projectionRevision),
          allowPrune,
          expectedDraftSeq,
        });
        if (typeof expectedDraftSeq === "number") {
          // The save advanced the CAS token; local state is now based on it.
          draftSeqBaseByProjectId.set(projectId, expectedDraftSeq + 1);
        }
        const postSaveState = statesByProjectId.get(projectId);
        // Activation funnel: first successful server persist of a non-empty
        // estimate (the estimate autosaves, so this is the real "saved"
        // moment). Once-per-user guard lives in the analytics helper.
        if (hasStructure) {
          trackEventOncePerUser("estimate_saved_first_time", { project_id: projectId });
        }
        if (postSaveState) {
          const postSync = ensureProjectSyncState(postSaveState);
          postSync.draftSaveStatus = "saved";
          postSync.draftSaveLastSucceededAt = nowIso();
          postSync.draftSaveLastError = null;
        }
        // Cross-session signal for P2 realtime consumers; best-effort.
        void emitEstimateDraftSyncEvent(projectId, projectionRevision);
      } catch (saveError) {
        if (saveError instanceof EstimateDraftConflictError) {
          // Another session saved since our hydrate. Converge on the server
          // truth instead of fighting it: DROP the losing snapshot's pending
          // saves (clearScheduledProjectDraftSync also clears the deferred
          // flag, so the finally-block cannot requeue the stale state), mark
          // the conflict, and AWAIT the forced refresh — edits made during it
          // re-defer and requeue against the post-hydrate state and baseline.
          clearScheduledProjectDraftSync(projectId);
          const conflictState = statesByProjectId.get(projectId);
          if (conflictState) {
            const conflictSync = ensureProjectSyncState(conflictState);
            conflictSync.draftSaveStatus = "conflict";
            conflictSync.draftSaveLastError = saveError.message;
            notify();
          }
          try {
            await hydrateEstimateV2ProjectFromWorkspace(projectId, { profileId, forceFresh: true });
          } catch (hydrateError) {
            // Never leave "conflict" with no writer coming back: surface the
            // failed convergence as an error the next edit/retry can clear.
            const failedState = statesByProjectId.get(projectId);
            if (failedState) {
              const failedSync = ensureProjectSyncState(failedState);
              failedSync.draftSaveStatus = "error";
              failedSync.draftSaveLastError = hydrateError instanceof Error
                ? hydrateError.message
                : "Conflict refresh failed";
              notify();
            }
          }
          return;
        }
        const postSaveState = statesByProjectId.get(projectId);
        if (postSaveState) {
          const postSync = ensureProjectSyncState(postSaveState);
          postSync.draftSaveStatus = "error";
          postSync.draftSaveLastError = saveError instanceof Error ? saveError.message : "Draft save failed";
        }
        throw saveError;
      }
      if (import.meta.env.DEV) {
        traceEstimateDraftSync("post-save", projectId, {
          allowPrune,
          worksWithoutLines,
          snapshotIsAuthoritative,
          stages: normalized.stages.length,
          works: normalized.works.length,
          lines: normalized.lines.length,
        });
      }
    } else {
      // This session may edit but cannot persist (RLS hides the estimate rows).
      // Never leave the status at "pending" — the save did not and will not run.
      const blockedState = statesByProjectId.get(projectId);
      if (blockedState) {
        const blockedSync = ensureProjectSyncState(blockedState);
        blockedSync.draftSaveStatus = "blocked_permission";
        blockedSync.draftSaveLastError = null;
        notify();
      }
    }

    if (!isCurrentSupabaseProjectProfile(projectId, profileId)) {
      return;
    }

    remoteDraftSyncErrorSignatureByProjectId.delete(projectId);

    if (!shouldProject) {
      const latestState = statesByProjectId.get(projectId);
      if (latestState) {
        ensureProjectSyncState(latestState);
        saveWorkspaceEstimateCache(projectId, profileId, latestState);
        notify();
      }
      return;
    }

    // Let the deferred rerun project the freshest estimate snapshot instead of
    // overwriting downstream domains with an older in-flight revision.
    if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
      return;
    }

    if (!canRunSensitiveEstimateProjection || !snapshotIsAuthoritative) {
      // Skip downstream projections when estimate rows are not visible under RLS,
      // or when the snapshot is non-authoritative (empty/partial) to prevent
      // mass-unlinking procurement/HR items from an incomplete estimate state.
      // Honesty: report "skipped" and leave projectedRevision untouched — nothing
      // was projected, so nothing may claim to be in sync with this revision.
      const skipState = statesByProjectId.get(projectId);
      if (skipState) {
        (["tasks", "procurement", "hr"] as const).forEach((domain) => {
          setProjectSyncDomainStatus(skipState, domain, {
            status: "skipped",
            skipReason: !canRunSensitiveEstimateProjection ? "permission" : "unauthoritative",
            lastError: null,
          });
        });
        saveWorkspaceEstimateCache(projectId, profileId, skipState);
        notify();
      }
    } else {
      // P1: one atomic server-side projection replaces the three-step client
      // pipeline. The RPC reads the server draft (never this snapshot), so a
      // stale call cannot write stale data; concurrency serializes server-side.
      try {
        if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
          return;
        }
        const projection = await syncEstimateProjectionRemote(projectId, projectionRevision);
        if (!isCurrentSupabaseProjectProfile(projectId, profileId)) {
          return;
        }
        if (hasProjectDraftProjectionDrift(projectId, projectionRevision)) {
          return;
        }
        if (projection.status === "projected") {
          if (projection.skippedWorkIds.length > 0) {
            // Works without a stage cannot become tasks (stage_id NOT NULL).
            // Reachable via orphan works (stage pruned from the snapshot).
            // Rare and self-heals when the work regains a stage; observability
            // over UI noise, but never silent.
            captureMessage("estimate projection skipped stageless works", {
              tags: { area: "estimate_sync" },
              extra: { projectId, skippedWorkIds: projection.skippedWorkIds },
            });
          }
          applyTaskIdsToState(projectId, projection.taskIdByWorkId);
          const latestState = statesByProjectId.get(projectId);
          if (latestState) {
            (["tasks", "procurement", "hr"] as const).forEach((domain) => {
              setProjectSyncDomainStatus(latestState, domain, {
                status: "synced",
                projectedRevision: sync.estimateRevision,
                lastSucceededAt: nowIso(),
                lastError: null,
                skipReason: null,
              });
            });
            saveWorkspaceEstimateCache(projectId, profileId, latestState);
          }
          notify();
        } else {
          // The server declined to project (draft emptied / status raced back
          // to planning): honest "skipped" — nothing may claim this revision.
          const skipState = statesByProjectId.get(projectId);
          if (skipState) {
            (["tasks", "procurement", "hr"] as const).forEach((domain) => {
              setProjectSyncDomainStatus(skipState, domain, {
                status: "skipped",
                skipReason: "unauthoritative",
                lastError: null,
              });
            });
            saveWorkspaceEstimateCache(projectId, profileId, skipState);
            notify();
          }
        }
      } catch (error) {
        if (error instanceof SyncEstimateProjectionUnavailableError) {
          await runLegacyClientProjection({
            projectId,
            profileId,
            normalized,
            projectionRevision,
            estimateRevision: sync.estimateRevision,
          });
        } else {
          const latestState = statesByProjectId.get(projectId);
          if (latestState) {
            (["tasks", "procurement", "hr"] as const).forEach((domain) => {
              setProjectSyncDomainStatus(latestState, domain, {
                status: "error",
                lastError: error instanceof Error ? error.message : "Unable to project the estimate.",
              });
            });
            saveWorkspaceEstimateCache(projectId, profileId, latestState);
          }
          console.error("Failed to run sync_estimate_projection", error);
          notify();
        }
      }
    }
  } catch (error) {
    const signature = error instanceof Error
      ? `${error.name}:${error.message}`
      : String(error);
    if (remoteDraftSyncErrorSignatureByProjectId.get(projectId) !== signature) {
      remoteDraftSyncErrorSignatureByProjectId.set(projectId, signature);
      console.error("Failed to sync estimate v2 draft", error);
    }
    const latestState = statesByProjectId.get(projectId);
    if (latestState) {
      (["tasks", "procurement", "hr"] as const).forEach((domain) => {
        setProjectSyncDomainStatus(latestState, domain, {
          status: "error",
          lastError: error instanceof Error ? error.message : "Unable to save estimate draft before sync.",
        });
      });
      saveWorkspaceEstimateCache(projectId, profileId, latestState);
      notify();
    }
  } finally {
    // A mid-run guard return (drift/profile change) can leave domains this run
    // marked "syncing" with no writer coming back for them. "syncing" must never
    // outlive the run that set it — reset the leftovers to "idle" so consumers
    // see an honest "not synced yet" instead of a spinner that never resolves.
    if (shouldProject) {
      const finalState = statesByProjectId.get(projectId);
      if (finalState) {
        let reconciled = false;
        (["tasks", "procurement", "hr"] as const).forEach((domain) => {
          const domainState = finalState.sync?.domains[domain];
          if (domainState?.status === "syncing" && domainState.lastAttemptedAt === attemptedAt) {
            setProjectSyncDomainStatus(finalState, domain, { status: "idle" });
            reconciled = true;
          }
        });
        if (reconciled) {
          notify();
        }
      }
    }
    remoteProjectionSyncInFlightByProjectId.delete(projectId);
    if (deferredDraftSyncByProjectId.delete(projectId)) {
      queueProjectDraftSync(projectId);
    }
  }
}

function createEntityId(projectId: string, prefix: string): string {
  const context = accessContextByProjectId.get(projectId);
  if (context?.mode === "supabase" && typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return id(prefix);
}

export function registerEstimateV2ProjectAccessContext(
  projectId: string,
  context: EstimateV2ProjectAccessContext,
) {
  const previousContext = accessContextByProjectId.get(projectId);
  if (
    previousContext
    && getEstimateV2ProjectRuntimeSessionKey(previousContext) !== getEstimateV2ProjectRuntimeSessionKey(context)
  ) {
    clearEstimateV2ProjectRuntimeState(projectId);
  }

  accessContextByProjectId.set(projectId, context);
  if (context.mode === "supabase" && context.profileId) {
    retainedSupabaseSyncProfileIdByProjectId.set(projectId, context.profileId);
    retainedSupabaseAccessContextByProjectId.set(projectId, { ...context });
  }
  const state = statesByProjectId.get(projectId);
  if (
    state
    && context.mode === "supabase"
    && context.profileId
    && !defaultSeededStateProjectIds.has(projectId)
  ) {
    saveWorkspaceEstimateCache(projectId, context.profileId, state);
    queueProjectDraftSync(projectId);
  }
}

export function clearEstimateV2ProjectAccessContext(projectId: string) {
  clearScheduledProjectDraftSync(projectId);
  accessContextByProjectId.delete(projectId);
}

function isOwnerActionAllowed(
  projectId: string,
  ownerProfileId?: string,
  projectOwnerProfileId?: string,
): boolean {
  const accessContext = accessContextByProjectId.get(projectId);
  if (accessContext?.mode === "supabase") {
    const actingProfileId = ownerProfileId ?? accessContext.profileId ?? null;
    const ownerId = projectOwnerProfileId ?? accessContext.projectOwnerProfileId ?? null;
    return Boolean(actingProfileId && ownerId && actingProfileId === ownerId);
  }

  if (ownerProfileId && projectOwnerProfileId) {
    const role = getAuthRole();
    return role === "owner" && ownerProfileId === projectOwnerProfileId;
  }

  const project = getProject(projectId);
  const actingProfileId = ownerProfileId ?? getCurrentUser().id;
  if (!project || project.owner_id !== actingProfileId) return false;

  const role = getAuthRole();
  return role === "owner";
}

/** Owner or co-owner may edit/submit the shared estimate draft (matches submission gate). */
function isOwnerOrCoOwnerProjectMember(projectId: string): boolean {
  const accessContext = accessContextByProjectId.get(projectId);
  if (accessContext?.mode === "supabase") {
    if (!accessContext.profileId) return false;
    if (accessContext.membershipRole === "owner" || accessContext.membershipRole === "co_owner") {
      return true;
    }
    return Boolean(
      accessContext.projectOwnerProfileId
      && accessContext.profileId === accessContext.projectOwnerProfileId,
    );
  }

  const authRole = getAuthRole();
  if (authRole !== "owner" && authRole !== "co_owner") return false;
  const user = getCurrentUser();
  const membership = getMembers(projectId).find((member) => member.user_id === user.id);
  if (!membership) {
    return authRole === "owner" && isOwnerActionAllowed(projectId);
  }
  return membership.role === "owner" || membership.role === "co_owner";
}

function isSubmissionActionAllowed(projectId: string): boolean {
  return isOwnerOrCoOwnerProjectMember(projectId);
}

function normalizeProjectMode(value: string | null | undefined): ProjectMode {
  return value === "build_myself" ? "build_myself" : "contractor";
}

function canEditEstimateState(projectId: string, state: EstimateV2ProjectState): boolean {
  if (!isOwnerOrCoOwnerProjectMember(projectId)) return false;
  return true;
}

function emitEstimateEvent(
  projectId: string,
  type:
    | "estimate.status_changed"
    | "estimate.tax_changed"
    | "estimate.discount_changed"
    | "estimate.dependency_added"
    | "estimate.dependency_removed"
    | "estimate.project_mode_set",
  payload: Record<string, unknown>,
) {
  const actor = getCurrentUser();
  const ts = nowIso();
  addEvent({
    id: id("evt-estimate-v2"),
    project_id: projectId,
    actor_id: actor.id,
    type,
    object_type: "estimate_v2_project",
    object_id: projectId,
    timestamp: ts,
    payload: { activityAt: ts, ...payload },
  });
}

export function isDemoProject(projectId: string): boolean {
  return DEMO_PROJECT_IDS.has(projectId);
}

function sortWorksByStageAndOrder(state: EstimateV2ProjectState): EstimateV2Work[] {
  const stageOrderById = new Map(state.stages.map((stage) => [stage.id, stage.order]));
  return [...state.works].sort((a, b) => {
    const stageOrderA = stageOrderById.get(a.stageId) ?? Number.MAX_SAFE_INTEGER;
    const stageOrderB = stageOrderById.get(b.stageId) ?? Number.MAX_SAFE_INTEGER;
    if (stageOrderA !== stageOrderB) return stageOrderA - stageOrderB;
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

function syncChecklistForWork(state: EstimateV2ProjectState, work: EstimateV2Work) {
  if (!work.taskId) return;
  const task = getTask(work.taskId);
  if (!task) return;

  const lines = state.lines
    .filter((line) => line.workId === work.id)
    .sort((a, b) => {
      const typeOrderA = RESOURCE_TYPE_ORDER[a.type];
      const typeOrderB = RESOURCE_TYPE_ORDER[b.type];
      if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
      return a.id.localeCompare(b.id);
    });

  const existingEstimateItems = new Map(
    task.checklist
      .filter((item) => item.estimateV2LineId)
      .map((item) => [item.estimateV2LineId as string, item]),
  );

  const generatedItems: ChecklistItem[] = lines.map((line) => {
    const existing = existingEstimateItems.get(line.id);
    return {
      id: `ev2-line-${line.id}`,
      text: normalizeChecklistItemText(line),
      done: existing?.done ?? false,
      type: checklistTypeForLineType(line.type),
      estimateV2LineId: line.id,
      estimateV2WorkId: work.id,
      estimateV2ResourceType: line.type,
      estimateV2QtyMilli: line.qtyMilli,
      estimateV2Unit: line.unit,
    };
  });

  const manualItems = task.checklist.filter((item) => !item.estimateV2LineId);
  const nextChecklist = [...manualItems, ...generatedItems];

  if (equalChecklistArray(task.checklist, nextChecklist)) return;
  runWithCrossSyncGuard(() => updateChecklist(task.id, nextChecklist));
}

function syncTaskFromWork(work: EstimateV2Work): boolean {
  if (!work.taskId) return false;
  const task = getTask(work.taskId);
  if (!task) return false;

  const partial: Partial<Task> = {};
  if (task.title !== work.title) partial.title = work.title;
  if ((task.startDate ?? null) !== (work.plannedStart ?? null)) {
    partial.startDate = work.plannedStart ?? undefined;
  }
  if ((task.deadline ?? null) !== (work.plannedEnd ?? null)) {
    partial.deadline = work.plannedEnd ?? undefined;
  }
  const expectedTaskStatus = mapWorkStatusToTaskStatus(work.status);
  if (task.status !== expectedTaskStatus) partial.status = expectedTaskStatus;

  if (Object.keys(partial).length === 0) return false;
  runWithCrossSyncGuard(() => updateTask(task.id, partial));
  return true;
}

function materializeTasksForAllWorks(projectId: string, state: EstimateV2ProjectState): { created: number; updated: number } {
  const user = getCurrentUser();
  const now = nowIso();
  let created = 0;
  let updated = 0;

  const sortedWorks = sortWorksByStageAndOrder(state);
  const nextWorksById = new Map<string, EstimateV2Work>();
  sortedWorks.forEach((work) => {
    let linkedTask = work.taskId ? getTask(work.taskId) : undefined;

    if (!linkedTask) {
      const taskId = `task-ev2-${work.id}`;
      const newTask: Task = {
        id: taskId,
        project_id: projectId,
        stage_id: work.stageId,
        title: work.title,
        description: "Auto-created from Estimate v2 work",
        status: "not_started",
        assignee_id: user.id,
        checklist: [],
        comments: [],
        attachments: [],
        photos: [],
        linked_estimate_item_ids: [],
        created_at: now,
        startDate: work.plannedStart ?? undefined,
        deadline: work.plannedEnd ?? undefined,
      };
      runWithCrossSyncGuard(() => addTask(newTask, { actorId: user.id, source: "estimate_v2_materialize" }));
      linkedTask = getTask(taskId);
      created += 1;
    }

    if (linkedTask) {
      const partial: Partial<Task> = {};
      if (linkedTask.title !== work.title) partial.title = work.title;
      if ((linkedTask.startDate ?? null) !== (work.plannedStart ?? null)) {
        partial.startDate = work.plannedStart ?? undefined;
      }
      if ((linkedTask.deadline ?? null) !== (work.plannedEnd ?? null)) {
        partial.deadline = work.plannedEnd ?? undefined;
      }
      if (linkedTask.status !== "not_started") partial.status = "not_started";
      if (Object.keys(partial).length > 0) {
        runWithCrossSyncGuard(() => updateTask(linkedTask!.id, partial));
        updated += 1;
      }

      const nextWork: EstimateV2Work = {
        ...work,
        taskId: linkedTask.id,
        status: "not_started",
        updatedAt: now,
      };
      nextWorksById.set(work.id, nextWork);
      syncChecklistForWork(state, nextWork);
    }
  });

  if (nextWorksById.size > 0) {
    state.works = state.works.map((work) => nextWorksById.get(work.id) ?? work);
  }

  return { created, updated };
}

function syncFromMainTaskStore() {
  if (crossSyncInProgress) return;
  const now = nowIso();
  let hasChanges = false;
  const changedProjectIds = new Set<string>();

  statesByProjectId.forEach((state, projectId) => {
    if (accessContextByProjectId.get(projectId)?.mode === "supabase") {
      return;
    }
    const tasksById = new Map(getTasks(projectId).map((task) => [task.id, task]));
    let stateChanged = false;

    state.works = state.works.map((work) => {
      if (!work.taskId) return work;
      const task = tasksById.get(work.taskId);
      if (!task) return work;

      const nextTitle = task.title;
      const nextStatus = mapTaskStatusToWorkStatus(task.status);
      const nextPlannedStart = task.startDate ?? null;
      const nextPlannedEnd = task.deadline ?? null;

      if (
        nextTitle === work.title
        && nextStatus === work.status
        && nextPlannedStart === (work.plannedStart ?? null)
        && nextPlannedEnd === (work.plannedEnd ?? null)
      ) {
        return work;
      }

      stateChanged = true;
      return {
        ...work,
        title: nextTitle,
        status: nextStatus,
        plannedStart: nextPlannedStart,
        plannedEnd: nextPlannedEnd,
        updatedAt: now,
      };
    });

    state.lines = state.lines.map((line) => {
      const work = state.works.find((entry) => entry.id === line.workId);
      if (!work?.taskId) return line;
      const task = tasksById.get(work.taskId);
      if (!task) return line;

      const checklistItem = task.checklist.find((item) => item.estimateV2LineId === line.id);
      if (!checklistItem) return line;

      const nextTitle = checklistItem.text || line.title;
      const nextQtyMilli = Number.isFinite(checklistItem.estimateV2QtyMilli)
        ? Math.max(1, Math.round(checklistItem.estimateV2QtyMilli as number))
        : line.qtyMilli;
      const nextUnit = checklistItem.estimateV2Unit?.trim() || line.unit;

      if (
        nextTitle === line.title
        && nextQtyMilli === line.qtyMilli
        && nextUnit === line.unit
      ) {
        return line;
      }

      stateChanged = true;
      return {
        ...line,
        title: nextTitle,
        qtyMilli: nextQtyMilli,
        unit: nextUnit,
        updatedAt: now,
      };
    });

    if (stateChanged) {
      syncExternalDomainsFromEstimate(projectId, state);
      state.project.updatedAt = now;
      hasChanges = true;
      changedProjectIds.add(projectId);
    }
  });

  if (hasChanges) {
    changedProjectIds.forEach((projectId) => queueProjectDraftSync(projectId));
    notify();
  }
}

function ensureMainStoreSubscription() {
  if (mainStoreUnsubscribe) return;
  mainStoreUnsubscribe = subscribeMainStore(() => {
    syncFromMainTaskStore();
  });
}

function inferLineTypeFromRemote(resourceType: ResourceLineType): ResourceLineType {
  return resourceLineTypeFromPersisted(resourceType);
}

function summaryClientFieldsFromOptionalCents(
  unit: number | null | undefined,
  total: number | null | undefined,
): Pick<EstimateV2ResourceLine, "summaryClientUnitCents" | "summaryClientTotalCents"> {
  if (
    typeof unit === "number" && Number.isFinite(unit)
    && typeof total === "number" && Number.isFinite(total)
  ) {
    return { summaryClientUnitCents: Math.round(unit), summaryClientTotalCents: Math.round(total) };
  }
  return {};
}

function summaryDiscountedClientField(
  cents: number | null | undefined,
): Pick<EstimateV2ResourceLine, "summaryDiscountedClientTotalCents"> {
  if (typeof cents === "number" && Number.isFinite(cents)) {
    return { summaryDiscountedClientTotalCents: Math.round(cents) };
  }
  return {};
}

const PRICING_DRIVER_LINE_FIELDS = [
  "qtyMilli",
  "costUnitCents",
  "markupBps",
  "discountBpsOverride",
  "taxBpsOverride",
  "type",
] as const;

function linePartialTouchesPricing(partial: Partial<EstimateV2ResourceLine>): boolean {
  return PRICING_DRIVER_LINE_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(partial, field));
}

function clearLineSummaryPricing(line: EstimateV2ResourceLine): EstimateV2ResourceLine {
  const {
    summaryClientUnitCents: _summaryClientUnitCents,
    summaryClientTotalCents: _summaryClientTotalCents,
    summaryDiscountedClientTotalCents: _summaryDiscountedClientTotalCents,
    ...lineWithoutSummaryPricing
  } = line;
  return lineWithoutSummaryPricing;
}

function buildTaskInfoByWorkId(tasks: Task[]): Map<string, {
  taskId: string;
  status: EstimateV2WorkStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
}> {
  const taskInfoByWorkId = new Map<string, {
    taskId: string;
    status: EstimateV2WorkStatus;
    plannedStart: string | null;
    plannedEnd: string | null;
  }>();

  tasks.forEach((task) => {
    const linkedWorkIds = Array.from(new Set(
      task.checklist
        .map((item) => item.estimateV2WorkId)
        .filter((value): value is string => Boolean(value)),
    ));

    linkedWorkIds.forEach((workId) => {
      if (taskInfoByWorkId.has(workId)) return;
      taskInfoByWorkId.set(workId, {
        taskId: task.id,
        status: mapTaskStatusToWorkStatus(task.status),
        plannedStart: task.startDate ?? null,
        plannedEnd: task.deadline ?? null,
      });
    });
  });

  return taskInfoByWorkId;
}

function mapChecklistTypeToEstimateLineType(
  item: ChecklistItem,
  fallbackType?: ResourceLineType | null,
): ResourceLineType | null {
  if (item.estimateV2ResourceType) return item.estimateV2ResourceType;
  if (fallbackType) return fallbackType;
  if (item.type === "material") return "material";
  if (item.type === "tool") return "tool";
  return null;
}

function displayForTaskProfileId(
  task: Task | undefined,
  profileId: string | null,
): { name: string | null; email: string | null } {
  if (!task || !profileId) {
    return { name: null, email: null };
  }
  const match = task.assignees?.find((entry) => entry.id === profileId) ?? null;
  return {
    name: match?.name ?? null,
    email: match?.email ?? null,
  };
}

export async function hydrateEstimateV2ProjectFromWorkspace(
  projectId: string,
  input: { profileId: string; forceFresh?: boolean },
): Promise<void> {
  // Identity guard: a hydrate for profile B while the (live or retained) access
  // context belongs to profile A means the account changed in this tab without a
  // reload. A's runtime state — capability, sync statuses, hydrated rows — must
  // never leak into B's session (wrong capability, wrong hydration path, stuck
  // "pending" from the split between the two retained maps).
  const previousContext = resolveEstimateAccessContext(projectId);
  if (
    previousContext?.mode === "supabase"
    && previousContext.profileId
    && previousContext.profileId !== input.profileId
  ) {
    clearEstimateV2ProjectRuntimeState(projectId);
    accessContextByProjectId.delete(projectId);
  }
  retainedSupabaseSyncProfileIdByProjectId.set(projectId, input.profileId);
  const cacheKey = `${projectId}:${input.profileId}`;
  const pending = remoteHydrationPromises.get(cacheKey);
  if (pending && !input.forceFresh) {
    return pending;
  }
  if (pending) {
    // A forceFresh hydrate must NOT be downgraded to an in-flight non-forced one (which
    // can early-return on a pending sync and keep stale state). Wait for the in-flight
    // hydrate to settle, then run a fresh forced pass below. The awaited promise clears its
    // own remoteHydrationPromises entry in its .finally before resolving, so the set() at
    // the end won't clobber a live entry.
    await pending.catch(() => {});
  }

  const hydration = (async () => {
    const hadExistingState = statesByProjectId.has(projectId);
    const currentState = ensureProjectState(projectId);
    const cached = loadWorkspaceEstimateCache(projectId, input.profileId)?.state ?? null;
    const [workspaceSource, planningSource, draft, hydratedDraftSeq] = await Promise.all([
      getWorkspaceSource({ kind: "supabase", profileId: input.profileId }),
      getPlanningSource({ kind: "supabase", profileId: input.profileId }),
      loadCurrentEstimateDraft(projectId),
      loadEstimateDraftSeq(projectId),
    ]);
    const [workspaceProject, tasks] = await Promise.all([
      workspaceSource.getProjectById(projectId),
      planningSource.getProjectTasks(projectId),
    ]);
    if (!isCurrentSupabaseProjectProfile(projectId, input.profileId)) {
      return;
    }
    const remoteHasStructure = draft.stages.length > 0
      || draft.works.length > 0
      || draft.lines.length > 0
      || draft.dependencies.length > 0;

    if (
      hadExistingState
      && !input.forceFresh
      && hasPendingProjectDraftSync(projectId)
      && (
        currentState.lines.length > 0
        || currentState.works.length > 0
        || currentState.stages.length > 0
      )
    ) {
      if (import.meta.env.DEV) {
        traceEstimateDraftSync("hydrate-early-return-pending", projectId, {
          stages: currentState.stages.length,
          works: currentState.works.length,
          lines: currentState.lines.length,
          remoteStages: draft.stages.length,
          remoteWorks: draft.works.length,
          remoteLines: draft.lines.length,
        });
      }
      saveWorkspaceEstimateCache(projectId, input.profileId, currentState);
      notify();
      return;
    }

    // Past the keep-local early return: every following branch adopts state
    // whose next save races against THIS server seq — record it as the CAS
    // baseline (the cached branch included: its queued save is a full rebase
    // onto the fetched server draft).
    draftSeqBaseByProjectId.set(projectId, hydratedDraftSeq);

    if (!remoteHasStructure && cached) {
      const cachedState: EstimateV2ProjectState = {
        project: {
          ...cached.project,
          title: workspaceProject?.title ?? cached.project.title,
          projectMode: normalizeProjectMode(workspaceProject?.project_mode ?? cached.project.projectMode),
        },
        stages: cached.stages.map((stage) => ({ ...stage })),
        works: cached.works.map((work) => ({ ...work })),
        lines: cached.lines.map((line) => ({ ...line })),
        dependencies: cached.dependencies.map((dependency) => ({ ...dependency })),
        versions: cached.versions.map((version) => ({
          ...version,
          approvalStamp: version.approvalStamp ? { ...version.approvalStamp } : null,
          snapshot: cloneSnapshot(version.snapshot),
        })),
        scheduleBaseline: cached.scheduleBaseline
          ? {
            ...cached.scheduleBaseline,
            works: cached.scheduleBaseline.works.map((work) => ({ ...work })),
          }
          : null,
        operationalUpperBlock: cloneOperationalUpperBlock(cached.operationalUpperBlock),
        sync: cloneProjectSyncState(cached.sync),
      };
      ensureProjectSyncState(cachedState);
      statesByProjectId.set(projectId, cachedState);
      defaultSeededStateProjectIds.delete(projectId);
      ensureMainStoreSubscription();
      notify();
      if (isNonPlanningEstimateStatus(cachedState.project.estimateStatus)) {
        queueProjectDraftSync(projectId);
        persistExecutionStatusIfManaged(projectId, cachedState.project.estimateStatus);
      } else if (hasUnflushedDraftSaveStatus(cachedState)) {
        // A planning estimate reloaded mid-debounce: the cache carries edits the
        // server never received. Re-queue the save or "pending" sticks forever.
        queueProjectDraftSync(projectId);
      }
      return;
    }

    const cachedStagesById = new Map((cached?.stages ?? []).map((stage) => [stage.id, stage]));
    const cachedWorksById = new Map((cached?.works ?? []).map((work) => [work.id, work]));
    const cachedLinesById = new Map((cached?.lines ?? []).map((line) => [line.id, line]));
    const cachedDependenciesById = new Map((cached?.dependencies ?? []).map((dependency) => [dependency.id, dependency]));
    const currentLinesById = new Map(currentState.lines.map((line) => [line.id, line]));
    const taskInfoByWorkId = buildTaskInfoByWorkId(tasks);
    const hasLinkedEstimateChecklist = tasks.some((task) => task.checklist.some(
      (item) => Boolean(item.estimateV2WorkId) || Boolean(item.estimateV2LineId),
    ));
    const hasStartedTaskExecution = tasks.some(
      (task) => task.status === "in_progress" || task.status === "blocked" || task.status === "done",
    );
    const allowSensitiveEstimateHydrate = canAccessSensitiveEstimateRows(resolveEstimateAccessContext(projectId));
    const accessSnapshot = resolveEstimateAccessContext(projectId);
    let operationalEstimatePayload: Awaited<ReturnType<typeof loadEstimateOperationalSummary>> = null;
    if (shouldHydrateEstimateViaOperationalRpc(accessSnapshot)) {
      try {
        operationalEstimatePayload = await loadEstimateOperationalSummary(
          projectId,
          draft.currentVersion?.id ?? null,
        );
      } catch {
        operationalEstimatePayload = null;
      }
    }
    const useOperationalEstimateShape = Boolean(
      operationalEstimatePayload != null
      && shouldHydrateEstimateViaOperationalRpc(accessSnapshot),
    );

    const stages = draft.stages
      .map((stage) => {
        const cachedStage = cachedStagesById.get(stage.id);
        return {
          id: stage.id,
          projectId,
          title: stage.title,
          order: stage.sort_order,
          discountBps: stage.discount_bps,
          systemStageArticleId: stage.system_stage_article_id ?? cachedStage?.systemStageArticleId ?? null,
          createdAt: cachedStage?.createdAt ?? stage.created_at,
          updatedAt: stage.updated_at,
        } satisfies EstimateV2Stage;
      })
      .sort((left, right) => left.order - right.order);

    const linkedChecklistEntries = tasks.flatMap((task) => task.checklist
      .filter((item) => Boolean(item.estimateV2WorkId || item.estimateV2LineId))
      .map((item) => ({ task, item })));
    const canRebuildWorksFromTasks = draft.works.length === 0
      && linkedChecklistEntries.length > 0;
    const canRebuildLinesFromTasks = allowSensitiveEstimateHydrate
      && draft.lines.length === 0
      && draft.works.length === 0
      && linkedChecklistEntries.length > 0;

    const works = useOperationalEstimateShape && operationalEstimatePayload
      ? operationalEstimatePayload.works.map((work) => {
        const cachedWork = cachedWorksById.get(work.estimate_work_id);
        const taskInfo = taskInfoByWorkId.get(work.estimate_work_id);
        // Server row is the source of truth for planned dates. Cache/taskInfo
        // are only consulted when the server row hasn't recorded a value yet.
        const serverPlannedStart = (work as { planned_start?: string | null }).planned_start ?? null;
        const serverPlannedEnd = (work as { planned_end?: string | null }).planned_end ?? null;
        return {
          id: work.estimate_work_id,
          projectId,
          stageId: work.project_stage_id,
          systemWorkArticleId: cachedWork?.systemWorkArticleId ?? null,
          title: work.title,
          order: work.sort_order,
          discountBps: cachedWork?.discountBps ?? 0,
          plannedStart: serverPlannedStart ?? taskInfo?.plannedStart ?? cachedWork?.plannedStart ?? null,
          plannedEnd: serverPlannedEnd ?? taskInfo?.plannedEnd ?? cachedWork?.plannedEnd ?? null,
          taskId: taskInfo?.taskId ?? cachedWork?.taskId ?? null,
          status: taskInfo?.status ?? cachedWork?.status ?? "not_started",
          createdAt: cachedWork?.createdAt ?? work.created_at,
          updatedAt: cachedWork?.updatedAt ?? work.created_at,
        } satisfies EstimateV2Work;
      }).sort((left, right) => left.order - right.order)
      : (canRebuildWorksFromTasks
        ? Array.from(new Set(linkedChecklistEntries
          .map(({ item }) => item.estimateV2WorkId)
          .filter((value): value is string => Boolean(value))))
          .map((workId, index) => {
            const task = linkedChecklistEntries.find(({ item }) => item.estimateV2WorkId === workId)?.task ?? null;
            const cachedWork = cachedWorksById.get(workId);
            const taskInfo = taskInfoByWorkId.get(workId);
            const stageIdFromTask = task?.stage_id ?? null;
            const fallbackStageId = stages[0]?.id ?? "";
            return {
              id: workId,
              projectId,
              stageId: stageIdFromTask || cachedWork?.stageId || fallbackStageId,
              systemWorkArticleId: cachedWork?.systemWorkArticleId ?? null,
              title: task?.title ?? cachedWork?.title ?? `Work ${index + 1}`,
              order: cachedWork?.order ?? index + 1,
              discountBps: cachedWork?.discountBps ?? 0,
              plannedStart: taskInfo?.plannedStart ?? cachedWork?.plannedStart ?? task?.startDate ?? null,
              plannedEnd: taskInfo?.plannedEnd ?? cachedWork?.plannedEnd ?? task?.deadline ?? null,
              taskId: taskInfo?.taskId ?? cachedWork?.taskId ?? task?.id ?? null,
              status: taskInfo?.status ?? cachedWork?.status ?? mapTaskStatusToWorkStatus(task?.status ?? "not_started"),
              createdAt: cachedWork?.createdAt ?? task?.created_at ?? nowIso(),
              updatedAt: cachedWork?.updatedAt ?? task?.created_at ?? nowIso(),
            } satisfies EstimateV2Work;
          })
        : draft.works
        .map((work) => {
          const cachedWork = cachedWorksById.get(work.id);
          const taskInfo = taskInfoByWorkId.get(work.id);
          // Server row is the source of truth for planned dates (Phase 1 of
          // Gantt persistence work). Cache/taskInfo only fill gaps when the
          // server row hasn't recorded a value yet.
          return {
            id: work.id,
            projectId,
            stageId: work.project_stage_id ?? cachedWork?.stageId ?? stages[0]?.id ?? "",
            systemWorkArticleId: work.system_work_article_id ?? cachedWork?.systemWorkArticleId ?? null,
            title: work.title,
            order: work.sort_order,
            discountBps: cachedWork?.discountBps ?? 0,
            plannedStart: work.planned_start ?? taskInfo?.plannedStart ?? cachedWork?.plannedStart ?? null,
            plannedEnd: work.planned_end ?? taskInfo?.plannedEnd ?? cachedWork?.plannedEnd ?? null,
            taskId: taskInfo?.taskId ?? cachedWork?.taskId ?? null,
            status: taskInfo?.status ?? cachedWork?.status ?? "not_started",
            createdAt: cachedWork?.createdAt ?? work.created_at,
            updatedAt: cachedWork?.updatedAt ?? work.created_at,
          } satisfies EstimateV2Work;
        }))
      .sort((left, right) => left.order - right.order);

    const stageIdByWorkId = new Map(works.map((work) => [work.id, work.stageId]));
    const lines = useOperationalEstimateShape && operationalEstimatePayload
      ? operationalEstimatePayload.resourceLines.map((line) => {
        const cachedLine = cachedLinesById.get(line.estimate_resource_line_id);
          const currentLine = currentLinesById.get(line.estimate_resource_line_id);
        return {
          id: line.estimate_resource_line_id,
          projectId,
          stageId: stageIdByWorkId.get(line.estimate_work_id) ?? cachedLine?.stageId ?? "",
          workId: line.estimate_work_id,
          title: line.title,
            type: inferLineTypeFromRemote(line.resource_type),
          unit: line.unit ?? cachedLine?.unit ?? "unit",
          qtyMilli: Math.max(1, Math.round(line.quantity * 1_000)),
          costUnitCents: 0,
          costRedacted: true,
          systemResourceArticleId: cachedLine?.systemResourceArticleId ?? null,
          ...summaryClientFieldsFromOptionalCents(line.client_unit_price_cents, line.client_total_price_cents),
          ...summaryDiscountedClientField(line.discounted_client_total_price_cents),
          markupBps: 0,
          discountBpsOverride: null,
          taxBpsOverride: cachedLine?.taxBpsOverride ?? null,
          assigneeId: line.assignee_profile_id ?? cachedLine?.assigneeId ?? null,
          // The RPC never returns assignee_label; a free-text label arrives baked
          // into assignee_display_name (profile assignees get their profile name).
          assigneeName: line.assignee_display_name?.trim() || cachedLine?.assigneeName || null,
          assigneeEmail: cachedLine?.assigneeEmail ?? null,
          receivedCents: cachedLine?.receivedCents ?? 0,
          pnlPlaceholderCents: cachedLine?.pnlPlaceholderCents ?? 0,
          createdAt: cachedLine?.createdAt ?? line.created_at,
          updatedAt: cachedLine?.updatedAt ?? line.created_at,
        } satisfies EstimateV2ResourceLine;
      })
      : canRebuildLinesFromTasks
        ? linkedChecklistEntries.map(({ task, item }, index): EstimateV2ResourceLine | null => {
          const lineId = item.estimateV2LineId ?? `${task.id}-line-${index}`;
          const workId = item.estimateV2WorkId
            ?? linkedChecklistEntries.find(({ item: sibling }) => sibling.estimateV2LineId === item.estimateV2LineId)?.item.estimateV2WorkId
            ?? "";
          const cachedLine = cachedLinesById.get(lineId);
          const currentLine = currentLinesById.get(lineId);
          const resolvedType = mapChecklistTypeToEstimateLineType(
            item,
            cachedLine?.type ?? currentLine?.type ?? null,
          );
          if (!resolvedType) {
            return null;
          }
          const checklistProfile = item.estimateV2AssigneeProfileId?.trim() || null;
          const checklistLabel = item.estimateV2AssigneeLabel?.trim() || null;
          const taskProfile = task.assignee_id?.trim() || null;
          const hasFreeText = Boolean(checklistLabel);
          const resolvedAssigneeId = (
            checklistProfile
            || (hasFreeText ? null : taskProfile)
            || cachedLine?.assigneeId
          ) ?? null;
          const display = displayForTaskProfileId(task, resolvedAssigneeId);
          return {
            id: lineId,
            projectId,
            stageId: stageIdByWorkId.get(workId) ?? cachedLine?.stageId ?? task.stage_id ?? "",
            workId,
            title: item.text || cachedLine?.title || "Line item",
            type: resolvedType,
            unit: item.estimateV2Unit ?? cachedLine?.unit ?? "unit",
            qtyMilli: Math.max(1, Math.round(item.estimateV2QtyMilli ?? cachedLine?.qtyMilli ?? 1_000)),
            costUnitCents: Math.max(0, Math.round(cachedLine?.costUnitCents ?? 0)),
            systemResourceArticleId: cachedLine?.systemResourceArticleId ?? null,
            markupBps: cachedLine?.markupBps ?? currentState.project.markupBps,
            discountBpsOverride: cachedLine?.discountBpsOverride ?? null,
            taxBpsOverride: cachedLine?.taxBpsOverride ?? null,
            assigneeId: resolvedAssigneeId,
            assigneeName: checklistLabel || display.name || cachedLine?.assigneeName || null,
            assigneeEmail: display.email || cachedLine?.assigneeEmail || null,
            receivedCents: cachedLine?.receivedCents ?? 0,
            pnlPlaceholderCents: cachedLine?.pnlPlaceholderCents ?? 0,
            createdAt: cachedLine?.createdAt ?? task.created_at,
            updatedAt: cachedLine?.updatedAt ?? task.created_at,
          } satisfies EstimateV2ResourceLine;
        }).filter((line): line is EstimateV2ResourceLine => Boolean(line))
        : draft.lines.map((line) => {
          const cachedLine = cachedLinesById.get(line.id);
          const currentLine = currentLinesById.get(line.id);
          const persistedMarkupBps = typeof line.markup_bps === "number" ? line.markup_bps : null;
          const persistedDiscountOverride = typeof line.discount_bps_override === "number" ? line.discount_bps_override : null;
          const lineAssigneeProfile = typeof line.assignee_profile_id === "string" && line.assignee_profile_id.trim() !== ""
            ? line.assignee_profile_id.trim()
            : null;
          const lineAssigneeLabel = typeof line.assignee_label === "string" && line.assignee_label.trim() !== ""
            ? line.assignee_label.trim()
            : null;
          const linked = linkedChecklistEntries.find(({ item }) => item.estimateV2LineId === line.id) ?? null;
          const task = linked?.task;
          const checklistItem = linked?.item;
          const overlayProfile = checklistItem?.estimateV2AssigneeProfileId?.trim() || null;
          const overlayLabel = checklistItem?.estimateV2AssigneeLabel?.trim() || null;
          const taskProfile = task?.assignee_id?.trim() || null;
          const hasFreeText = Boolean(lineAssigneeLabel || overlayLabel);
          const resolvedAssigneeId = (
            lineAssigneeProfile
            || overlayProfile
            || (hasFreeText ? null : taskProfile)
            || cachedLine?.assigneeId
          ) ?? null;
          const display = displayForTaskProfileId(task, resolvedAssigneeId);
          return {
            id: line.id,
            projectId,
            stageId: stageIdByWorkId.get(line.estimate_work_id) ?? cachedLine?.stageId ?? "",
            workId: line.estimate_work_id,
            title: line.title,
            type: inferLineTypeFromRemote(line.resource_type),
            unit: line.unit ?? cachedLine?.unit ?? "unit",
            qtyMilli: Math.max(1, Math.round(line.quantity * 1_000)),
            costUnitCents: Math.max(0, Math.round(line.unit_price_cents ?? 0)),
            systemResourceArticleId: line.system_resource_article_id ?? cachedLine?.systemResourceArticleId ?? null,
            ...summaryClientFieldsFromOptionalCents(line.client_unit_price_cents, line.client_total_price_cents),
            markupBps: persistedMarkupBps ?? cachedLine?.markupBps ?? currentState.project.markupBps,
            discountBpsOverride: persistedDiscountOverride ?? cachedLine?.discountBpsOverride ?? null,
            taxBpsOverride: cachedLine?.taxBpsOverride ?? null,
            assigneeId: resolvedAssigneeId,
            assigneeName: lineAssigneeLabel
              || overlayLabel
              || display.name
              || cachedLine?.assigneeName
              || null,
            assigneeEmail: display.email || cachedLine?.assigneeEmail || null,
            receivedCents: cachedLine?.receivedCents ?? 0,
            pnlPlaceholderCents: cachedLine?.pnlPlaceholderCents ?? 0,
            createdAt: cachedLine?.createdAt ?? line.created_at,
            updatedAt: cachedLine?.updatedAt ?? line.created_at,
          } satisfies EstimateV2ResourceLine;
        });

    // Preserve the user's resource line ordering across hero transition: lines that existed
    // in the pre-hydration state keep their position; new lines from remote go to the end
    // in the order the server returned them. Without this, hydration from RPC/Supabase (which
    // does not guarantee row order) reshuffles the table every time the project reloads.
    const preHydrationLineOrder = new Map<string, number>();
    currentState.lines.forEach((line, index) => {
      preHydrationLineOrder.set(line.id, index);
    });
    if (preHydrationLineOrder.size === 0 && cached?.lines) {
      cached.lines.forEach((line, index) => {
        preHydrationLineOrder.set(line.id, index);
      });
    }
    const orderedLines = lines
      .map((line, index) => ({ line, index }))
      .sort((left, right) => {
        const leftKnown = preHydrationLineOrder.get(left.line.id);
        const rightKnown = preHydrationLineOrder.get(right.line.id);
        if (leftKnown != null && rightKnown != null) return leftKnown - rightKnown;
        if (leftKnown != null) return -1;
        if (rightKnown != null) return 1;
        return left.index - right.index;
      })
      .map(({ line }) => line);

    const dependencies = draft.dependencies.map((dependency) => {
      const cachedDependency = cachedDependenciesById.get(dependency.id);
      // Server row is authoritative for lagDays now (Phase 1 of Gantt
      // persistence work). Cache only fills the gap if the row has none.
      return {
        id: dependency.id,
        projectId,
        kind: "FS",
        fromWorkId: dependency.from_work_id,
        toWorkId: dependency.to_work_id,
        lagDays: dependency.lag_days ?? cachedDependency?.lagDays ?? 0,
        createdAt: cachedDependency?.createdAt ?? dependency.created_at,
        updatedAt: cachedDependency?.updatedAt ?? dependency.created_at,
      } satisfies EstimateV2Dependency;
    });

    const derivedProjectMode = normalizeProjectMode(workspaceProject?.project_mode ?? currentState.project.projectMode);
    const cachedProject = cached?.project ?? null;
    const remoteRootIndicatesInWork = draft.estimate?.status === "approved";
    const inferredEstimateStatus: EstimateExecutionStatus = (
      remoteRootIndicatesInWork || hasLinkedEstimateChecklist || hasStartedTaskExecution
    ) ? "in_work" : "planning";
    // P1: the server execution_status is authoritative when present — it is
    // what other sessions/devices see and what the projection RPC gates on.
    // The cached-status and inference chains remain only for null (pre-column
    // rows and drafts whose mirror write was lost).
    const serverExecutionStatus = (draft.estimate?.execution_status ?? null) as EstimateExecutionStatus | null;
    const nextEstimateStatus: EstimateExecutionStatus = serverExecutionStatus
      ?? (cachedProject?.estimateStatus && cachedProject.estimateStatus !== "planning"
        ? cachedProject.estimateStatus
        : inferredEstimateStatus);
    const nextProject: EstimateV2Project = {
      ...currentState.project,
      ...cachedProject,
      id: draft.estimate?.id ?? cachedProject?.id ?? currentState.project.id,
      projectId,
      title: workspaceProject?.title ?? draft.estimate?.title ?? cachedProject?.title ?? currentState.project.title,
      projectMode: derivedProjectMode,
      estimateStatus: nextEstimateStatus,
      updatedAt: cachedProject?.updatedAt ?? draft.estimate?.updated_at ?? currentState.project.updatedAt,
    };

    const nextState: EstimateV2ProjectState = {
      project: nextProject,
      stages,
      works,
      lines: orderedLines,
      dependencies,
      versions: cached?.versions.map((version) => ({
        ...version,
        approvalStamp: version.approvalStamp ? { ...version.approvalStamp } : null,
        snapshot: cloneSnapshot(version.snapshot),
      })) ?? [],
      scheduleBaseline: cached?.scheduleBaseline
        ? {
          ...cached.scheduleBaseline,
          works: cached.scheduleBaseline.works.map((work) => ({ ...work })),
        }
        : null,
      operationalUpperBlock: useOperationalEstimateShape && operationalEstimatePayload
        ? operationalEstimatePayload.upperBlock
        : null,
      sync: cloneProjectSyncState(cached?.sync),
    };

    ensureProjectSyncState(nextState);
    if (import.meta.env.DEV) {
      traceEstimateDraftSync("hydrate-complete", projectId, {
        branch: useOperationalEstimateShape ? "operational" : (canRebuildLinesFromTasks ? "task-rebuild" : "table-backed"),
        stages: nextState.stages.length,
        works: nextState.works.length,
        lines: nextState.lines.length,
        dependencies: nextState.dependencies.length,
        remoteStages: draft.stages.length,
        remoteWorks: draft.works.length,
        remoteLines: draft.lines.length,
        linesWithMarkup: nextState.lines.filter((l) => l.markupBps !== 0).length,
        linesWithDiscount: nextState.lines.filter((l) => l.discountBpsOverride != null).length,
      });
    }
    statesByProjectId.set(projectId, nextState);
    defaultSeededStateProjectIds.delete(projectId);
    ensureMainStoreSubscription();
    saveWorkspaceEstimateCache(projectId, input.profileId, nextState);
    notify();
    if (isNonPlanningEstimateStatus(nextState.project.estimateStatus)) {
      queueProjectDraftSync(projectId);
      // Reconcile the portfolio status mirror on every hydration of a non-planning
      // project, so a paused/finished project whose immediate fire-and-forget write was
      // lost self-heals on next view (those statuses have no server-side reader fallback).
      persistExecutionStatusIfManaged(projectId, nextState.project.estimateStatus);
    } else if (hasUnflushedDraftSaveStatus(nextState)) {
      queueProjectDraftSync(projectId);
    }
  })().finally(() => {
    // Identity-guard the cleanup (mirrors runAndTrackProjectDraftSync): with the forceFresh
    // dedup bypass, two forced hydrations can both reach the set() below, so only delete the
    // entry if it's still ours — otherwise an earlier pass settling could drop a newer live
    // entry and make a concurrent non-forced caller start a redundant hydration.
    if (remoteHydrationPromises.get(cacheKey) === hydration) {
      remoteHydrationPromises.delete(cacheKey);
    }
  });

  remoteHydrationPromises.set(cacheKey, hydration);
  return hydration;
}

/**
 * Bootstrap helper for the EstimateConstructor: ensures the server estimate root + current
 * version exist for a brand-new estimate and returns the version id, so the constructor can
 * apply a template into an estimate that has never been saved. Returns null when there is no
 * managed supabase sync context (demo/local mode). Reuses the same snapshot + deterministic
 * ids as the autosave, so it never conflicts with a later save.
 */
export async function ensureRemoteEstimateVersionId(projectId: string): Promise<string | null> {
  const state = statesByProjectId.get(projectId);
  const managedSyncContext = getManagedEstimateRemoteSyncContext(projectId);
  if (!state || !managedSyncContext) {
    return null;
  }
  const normalized = normalizeStateForWorkspace(projectId, state);
  return ensureRemoteEstimateCurrentVersionId(
    projectId,
    getSnapshotFromState(normalized),
    managedSyncContext.profileId,
  );
}

/**
 * Resolves the live project_stages.id for a (possibly local, not-yet-hydrated) stage id, so a
 * server RPC (e.g. add_library_work_to_estimate) targets the right row. Returns null in
 * demo/local (no managed sync context) or when the stage isn't in the current snapshot.
 * Callers should flush the draft first so the resolved server row exists.
 */
export async function ensureRemoteStageId(projectId: string, localStageId: string): Promise<string | null> {
  const state = statesByProjectId.get(projectId);
  const managedSyncContext = getManagedEstimateRemoteSyncContext(projectId);
  if (!state || !managedSyncContext) {
    return null;
  }
  const normalized = normalizeStateForWorkspace(projectId, state);
  return resolveRemoteEstimateStageId(projectId, getSnapshotFromState(normalized), localStageId);
}

function ensureProjectState(projectId: string): EstimateV2ProjectState {
  const existing = statesByProjectId.get(projectId);
  const demoActive = DEMO_PROJECT_IDS.has(projectId) && isDemoSessionActive();

  // Replace stale default-seeded state (created before the demo session was entered)
  // with the curated demo seed so HR / Tasks / Procurement reflect the correct status.
  if (existing && demoActive && existing.lines.length === 0) {
    const createdAt = nowIso();
    const demoState = getDemoEstimateV2State(projectId, createdAt);
    if (demoState) {
      const state: EstimateV2ProjectState = {
        ...demoState,
        sync: createEmptyProjectSyncState(),
      };
      ensureProjectSyncState(state);
      statesByProjectId.set(projectId, state);
      defaultSeededStateProjectIds.delete(projectId);
      return state;
    }
  }

  if (existing) return existing;

  const createdAt = nowIso();

  if (demoActive) {
    const demoState = getDemoEstimateV2State(projectId, createdAt);
    if (demoState) {
      const state: EstimateV2ProjectState = {
        ...demoState,
        sync: createEmptyProjectSyncState(),
      };
      ensureProjectSyncState(state);
      ensureMainStoreSubscription();
      statesByProjectId.set(projectId, state);
      return state;
    }
  }

  const projectEntity = getProject(projectId);
  const storeStages = getStages(projectId);
  const orderedStages = [...storeStages].sort((a, b) => a.order - b.order);

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
    plannedStart: null,
    plannedEnd: null,
    taskId: null,
    status: "not_started",
    createdAt,
    updatedAt: createdAt,
  }));

  const lines: EstimateV2ResourceLine[] = [];

  const project: EstimateV2Project = {
    id: `estimate-v2-${projectId}`,
    projectId,
    title: projectEntity?.title ?? "Estimate",
    projectMode: normalizeProjectMode(projectEntity?.project_mode),
    currency: resolveCurrency(),
    taxBps: 2200,
    discountBps: 0,
    markupBps: 0,
    estimateStatus: "planning",
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
    scheduleBaseline: null,
    operationalUpperBlock: null,
    sync: createEmptyProjectSyncState(),
  };

  ensureProjectSyncState(state);
  ensureMainStoreSubscription();
  statesByProjectId.set(projectId, state);
  // Placeholder until a hydrate installs remote truth or a user edit commits —
  // must never be cached or autosaved (see defaultSeededStateProjectIds).
  defaultSeededStateProjectIds.add(projectId);
  return state;
}

function projectScheduleAnchor(projectId: string): string {
  const tasks = getTasks(projectId)
    .map((task) => normalizeIsoDate(task.created_at))
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
  return tasks[0] ?? isoStartOfToday();
}

function captureScheduleBaseline(state: EstimateV2ProjectState, capturedAt: string): ScheduleBaseline {
  const works = sortWorksByStageAndOrder(state);
  const baselineWorks = works.map((work) => ({
    workId: work.id,
    baselineStart: work.plannedStart ?? null,
    baselineEnd: work.plannedEnd ?? null,
  }));

  const starts = baselineWorks
    .map((work) => work.baselineStart)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));
  const ends = baselineWorks
    .map((work) => work.baselineEnd)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => a.localeCompare(b));

  return {
    capturedAt,
    projectBaselineStart: starts[0] ?? null,
    projectBaselineEnd: ends[ends.length - 1] ?? null,
    works: baselineWorks,
  };
}

function needsInWorkTaskMaterialization(state: EstimateV2ProjectState): boolean {
  return state.works.some((work) => !work.taskId);
}

function needsInWorkBaselineCapture(state: EstimateV2ProjectState): boolean {
  return !state.scheduleBaseline;
}

function buildPlanningToInWorkDraft(
  projectId: string,
  state: EstimateV2ProjectState,
  options: SetProjectEstimateStatusOptions,
): { ok: true; draft: InWorkTransitionDraft } | { ok: false; missingWorkIds: string[] } {
  const appliedAt = nowIso();
  const draftWorks = state.works.map((work) => ({ ...work }));
  const missingWorks = sortWorksByStageAndOrder({
    ...state,
    works: draftWorks,
  }).filter((work) => !work.plannedStart || !work.plannedEnd);

  if (missingWorks.length > 0 && !options.skipSetup) {
    return {
      ok: false,
      missingWorkIds: missingWorks.map((work) => work.id),
    };
  }

  let autoScheduled = false;
  let nextWorks = draftWorks;
  if (missingWorks.length > 0 && options.skipSetup) {
    const stageOrderById = new Map(state.stages.map((stage) => [stage.id, stage.order]));
    const anchor = projectScheduleAnchor(projectId);
    let scheduled = autoScheduleSequential(nextWorks, anchor, stageOrderById);
    const cycleValidation = validateNoCycles(state.dependencies);
    if (cycleValidation.valid) {
      const constrainedById = applyFSConstraints(
        Object.fromEntries(scheduled.map((work) => [work.id, work])),
        state.dependencies,
      );
      scheduled = scheduled.map((work) => constrainedById[work.id] ?? work);
    }
    nextWorks = nextWorks.map((work) => scheduled.find((entry) => entry.id === work.id) ?? work);
    autoScheduled = true;
  }

  const draftState: EstimateV2ProjectState = {
    project: { ...state.project },
    stages: state.stages.map((stage) => ({ ...stage })),
    works: nextWorks,
    lines: state.lines.map((line) => ({ ...line })),
    dependencies: state.dependencies.map((dependency) => ({ ...dependency })),
    versions: state.versions,
    scheduleBaseline: state.scheduleBaseline,
    operationalUpperBlock: cloneOperationalUpperBlock(state.operationalUpperBlock),
    sync: cloneProjectSyncState(state.sync),
  };

  return {
    ok: true,
    draft: {
      works: nextWorks,
      baseline: captureScheduleBaseline(draftState, appliedAt),
      appliedAt,
      autoScheduled,
    },
  };
}

function applySupabaseInWorkTransitionSuccess(
  state: EstimateV2ProjectState,
  draft: InWorkTransitionDraft,
  taskIdByWorkId: Record<string, string>,
) {
  const draftWorkById = new Map(draft.works.map((work) => [work.id, work]));
  state.works = state.works.map((work) => {
    const nextDraft = draftWorkById.get(work.id);
    if (!nextDraft) return work;
    return {
      ...work,
      plannedStart: nextDraft.plannedStart,
      plannedEnd: nextDraft.plannedEnd,
      taskId: taskIdByWorkId[work.id] ?? work.taskId,
      status: "not_started",
      updatedAt: draft.appliedAt,
    };
  });

  state.scheduleBaseline = draft.baseline;
  state.project = {
    ...state.project,
    estimateStatus: "in_work",
    updatedAt: draft.appliedAt,
  };
}

async function isSupabaseOwnerActionAllowed(
  projectId: string,
  ownerProfileId?: string,
): Promise<boolean> {
  const accessContext = accessContextByProjectId.get(projectId);
  if (accessContext?.mode === "supabase") {
    const actingProfileId = ownerProfileId ?? accessContext.profileId ?? null;
    const ownerId = accessContext.projectOwnerProfileId ?? null;
    return Boolean(actingProfileId && ownerId && actingProfileId === ownerId);
  }

  if (accessContext?.mode === "demo" || accessContext?.mode === "local") {
    return false;
  }

  const mode = ownerProfileId
    ? { kind: "supabase", profileId: ownerProfileId } as const
    : await resolveRuntimeWorkspaceMode();
  if (mode.kind !== "supabase") {
    return false;
  }

  const workspaceSource = await getWorkspaceSource(mode);
  const project = await workspaceSource.getProjectById(projectId);
  if (!project) {
    return false;
  }

  return project.owner_id === mode.profileId;
}

function applyWorkToTaskSync(state: EstimateV2ProjectState, workIds: string[]) {
  const changedWorkIds = new Set(workIds);
  state.works.forEach((work) => {
    if (!changedWorkIds.has(work.id)) return;
    syncTaskFromWork(work);
  });
}

function buildWorksById(works: EstimateV2Work[]): Record<string, EstimateV2Work> {
  return Object.fromEntries(works.map((work) => [work.id, { ...work }]));
}

function applyScheduledDatesFromMap(
  state: EstimateV2ProjectState,
  nextWorksById: Record<string, EstimateV2Work>,
  now: string,
): string[] {
  const changedWorkIds: string[] = [];

  state.works = state.works.map((work) => {
    const next = nextWorksById[work.id];
    if (!next) return work;

    const startChanged = (work.plannedStart ?? null) !== (next.plannedStart ?? null);
    const endChanged = (work.plannedEnd ?? null) !== (next.plannedEnd ?? null);
    if (!startChanged && !endChanged) return work;

    changedWorkIds.push(work.id);
    return {
      ...work,
      plannedStart: next.plannedStart,
      plannedEnd: next.plannedEnd,
      updatedAt: now,
    };
  });

  return changedWorkIds;
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

function buildStageNumberById(stages: EstimateV2Stage[]): Map<string, number> {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  return new Map(sorted.map((stage, index) => [stage.id, index + 1]));
}

function buildWorkNumberById(
  works: EstimateV2Work[],
  stageNumberById: Map<string, number>,
): Map<string, string> {
  const worksByStage = new Map<string, EstimateV2Work[]>();
  works.forEach((work) => {
    const list = worksByStage.get(work.stageId) ?? [];
    list.push(work);
    worksByStage.set(work.stageId, list);
  });

  const result = new Map<string, string>();
  worksByStage.forEach((list, stageId) => {
    const stageNumber = stageNumberById.get(stageId);
    const sorted = [...list].sort((a, b) => a.order - b.order);
    sorted.forEach((work, index) => {
      if (stageNumber == null) return;
      result.set(work.id, `${stageNumber}.${index + 1}`);
    });
  });

  return result;
}

function mapById<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function lineClientTotals(
  snapshot: EstimateV2Snapshot,
  line: EstimateV2ResourceLine,
): { clientUnitCents: number; clientTotalCents: number } | null {
  const stage = snapshot.stages.find((entry) => entry.id === line.stageId);
  if (!stage) return null;
  const totals = computeLineTotals(line, stage, snapshot.project, snapshot.project.projectMode);
  return {
    clientUnitCents: totals.clientUnitCents,
    clientTotalCents: totals.clientTotalCents,
  };
}

function pushFieldChange(
  changes: EstimateV2DiffFieldChange[],
  field: string,
  label: string,
  before: unknown,
  after: unknown,
) {
  if (before === after) return;
  changes.push({ field, label, before, after });
}

function buildLineFieldChanges(
  prevSnapshot: EstimateV2Snapshot | null,
  nextSnapshot: EstimateV2Snapshot,
  prevLine: EstimateV2ResourceLine,
  nextLine: EstimateV2ResourceLine,
): EstimateV2DiffFieldChange[] {
  const fieldChanges: EstimateV2DiffFieldChange[] = [];
  pushFieldChange(fieldChanges, "title", "name", prevLine.title, nextLine.title);
  pushFieldChange(fieldChanges, "type", "type", prevLine.type, nextLine.type);
  pushFieldChange(fieldChanges, "qtyMilli", "qty", prevLine.qtyMilli, nextLine.qtyMilli);
  pushFieldChange(fieldChanges, "unit", "unit", prevLine.unit, nextLine.unit);
  pushFieldChange(fieldChanges, "costUnitCents", "cost price", prevLine.costUnitCents, nextLine.costUnitCents);
  pushFieldChange(fieldChanges, "markupBps", "markup", prevLine.markupBps, nextLine.markupBps);
  pushFieldChange(
    fieldChanges,
    "discountBpsOverride",
    "discount",
    prevLine.discountBpsOverride ?? null,
    nextLine.discountBpsOverride ?? null,
  );
  pushFieldChange(
    fieldChanges,
    "taxBpsOverride",
    "VAT",
    prevLine.taxBpsOverride ?? null,
    nextLine.taxBpsOverride ?? null,
  );

  const prevClientTotals = prevSnapshot ? lineClientTotals(prevSnapshot, prevLine) : null;
  const nextClientTotals = lineClientTotals(nextSnapshot, nextLine);

  if (prevClientTotals && nextClientTotals) {
    pushFieldChange(
      fieldChanges,
      "clientUnitCents",
      "client unit price",
      prevClientTotals.clientUnitCents,
      nextClientTotals.clientUnitCents,
    );
    pushFieldChange(
      fieldChanges,
      "clientTotalCents",
      "line total",
      prevClientTotals.clientTotalCents,
      nextClientTotals.clientTotalCents,
    );
  }

  return fieldChanges;
}

function structuredSort(a: EstimateV2StructuredChange, b: EstimateV2StructuredChange): number {
  const stageA = a.stageNumber ?? Number.MAX_SAFE_INTEGER;
  const stageB = b.stageNumber ?? Number.MAX_SAFE_INTEGER;
  if (stageA !== stageB) return stageA - stageB;

  const parseWorkOrder = (workNumber: string | null): number => {
    if (!workNumber) return Number.MAX_SAFE_INTEGER;
    const tail = Number(workNumber.split(".")[1]);
    return Number.isFinite(tail) ? tail : Number.MAX_SAFE_INTEGER;
  };
  const workA = parseWorkOrder(a.workNumber);
  const workB = parseWorkOrder(b.workNumber);
  if (workA !== workB) return workA - workB;

  const kindOrder = { stage: 0, work: 1, line: 2 } as const;
  if (kindOrder[a.entityKind] !== kindOrder[b.entityKind]) {
    return kindOrder[a.entityKind] - kindOrder[b.entityKind];
  }

  return a.title.localeCompare(b.title);
}

export function subscribeEstimateV2(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getEstimateV2ProjectState(projectId: string): EstimateV2ProjectView {
  const state = ensureProjectState(projectId);
  return cloneState(state);
}

export function createStage(projectId: string, input: { title: string; discountBps?: number }): EstimateV2Stage | null {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return null;
  const now = nowIso();
  const stage: EstimateV2Stage = {
    id: createEntityId(projectId, "stage-v2"),
    projectId,
    title: input.title.trim() || "New stage",
    order: (state.stages[state.stages.length - 1]?.order ?? 0) + 1,
    discountBps: Math.max(0, Math.round(input.discountBps ?? 0)),
    createdAt: now,
    updatedAt: now,
  };
  state.stages.push(stage);
  state.project.updatedAt = now;
  commitProjectStateChange(projectId);
  return { ...stage };
}

export function updateStage(projectId: string, stageId: string, partial: Partial<EstimateV2Stage>) {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return;
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
  commitProjectStateChange(projectId);
}

export function deleteStage(projectId: string, stageId: string) {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return;
  const workIdsToDelete = new Set(state.works.filter((work) => work.stageId === stageId).map((work) => work.id));
  const removedLineIds = state.lines
    .filter((line) => line.stageId === stageId || workIdsToDelete.has(line.workId))
    .map((line) => line.id);

  state.stages = state.stages.filter((stage) => stage.id !== stageId);
  state.works = state.works.filter((work) => !workIdsToDelete.has(work.id));
  state.lines = state.lines.filter((line) => line.stageId !== stageId && !workIdsToDelete.has(line.workId));
  state.dependencies = state.dependencies.filter((dep) => !workIdsToDelete.has(dep.fromWorkId) && !workIdsToDelete.has(dep.toWorkId));
  if (removedLineIds.length > 0) {
    removeProcurementItemsByEstimateV2LineIds(projectId, removedLineIds);
    removeHRItemsByEstimateV2LineIds(projectId, removedLineIds);
  }
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = nowIso();
  commitProjectStateChange(projectId);
}

export function createWork(projectId: string, input: { stageId: string; title: string; discountBps?: number }): EstimateV2Work | null {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return null;
  const now = nowIso();
  const nextOrder = state.works
    .filter((work) => work.stageId === input.stageId)
    .reduce((max, work) => Math.max(max, work.order), 0) + 1;

  const work: EstimateV2Work = {
    id: createEntityId(projectId, "work-v2"),
    projectId,
    stageId: input.stageId,
    title: input.title.trim() || "New work",
    order: nextOrder,
    discountBps: Math.max(0, Math.round(input.discountBps ?? 0)),
    plannedStart: null,
    plannedEnd: null,
    taskId: null,
    status: "not_started",
    createdAt: now,
    updatedAt: now,
  };

  state.works.push(work);
  state.project.updatedAt = now;
  commitProjectStateChange(projectId);
  return { ...work };
}

export function updateWork(projectId: string, workId: string, partial: Partial<EstimateV2Work>) {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return;
  const now = nowIso();
  const previousWork = state.works.find((work) => work.id === workId) ?? null;
  let changedWork: EstimateV2Work | null = null;
  state.works = state.works.map((work) => (
    work.id === workId
      ? {
        ...work,
        ...partial,
        updatedAt: now,
      }
      : work
  ));
  changedWork = state.works.find((work) => work.id === workId) ?? null;

  if (changedWork) {
    applyWorkToTaskSync(state, [changedWork.id]);
    syncChecklistForWork(state, changedWork);
  }
  const plannedStartChanged = (previousWork?.plannedStart ?? null) !== (changedWork?.plannedStart ?? null);
  const plannedEndChanged = (previousWork?.plannedEnd ?? null) !== (changedWork?.plannedEnd ?? null);
  if (plannedStartChanged || plannedEndChanged) {
    syncExternalDomainsFromEstimate(projectId, state);
  }
  state.project.updatedAt = now;
  commitProjectStateChange(projectId);
}

export function updateWorkDates(
  projectId: string,
  workId: string,
  plannedStart: string,
  plannedEnd: string,
  _options: { source: "gantt" },
): { ok: true; shiftedWorkIds: string[] } | { ok: false; reason: "forbidden" | "invalid_work" | "invalid_date" } {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return { ok: false, reason: "forbidden" };
  const target = state.works.find((work) => work.id === workId);
  if (!target) return { ok: false, reason: "invalid_work" };

  if (toDayIndex(plannedStart) == null || toDayIndex(plannedEnd) == null) {
    return { ok: false, reason: "invalid_date" };
  }

  const normalized = clampWorkDates({
    plannedStart,
    plannedEnd,
  }, 1);

  const worksById = buildWorksById(state.works);
  const nextTarget = worksById[workId];
  if (!nextTarget) return { ok: false, reason: "invalid_work" };
  worksById[workId] = {
    ...nextTarget,
    plannedStart: normalized.plannedStart,
    plannedEnd: normalized.plannedEnd,
  };

  const constrainedById = applyFSConstraints(worksById, state.dependencies);
  const now = nowIso();
  const changedWorkIds = applyScheduledDatesFromMap(state, constrainedById, now);

  if (changedWorkIds.length === 0) {
    return { ok: true, shiftedWorkIds: [] };
  }

  if (state.project.estimateStatus === "in_work") {
    applyWorkToTaskSync(state, changedWorkIds);
  }

  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = now;
  commitProjectStateChange(projectId);
  return {
    ok: true,
    shiftedWorkIds: changedWorkIds.filter((id) => id !== workId),
  };
}

export function deleteWork(projectId: string, workId: string) {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return;
  const removedLineIds = state.lines.filter((line) => line.workId === workId).map((line) => line.id);
  state.works = state.works.filter((work) => work.id !== workId);
  state.lines = state.lines.filter((line) => line.workId !== workId);
  state.dependencies = state.dependencies.filter((dep) => dep.fromWorkId !== workId && dep.toWorkId !== workId);
  if (removedLineIds.length > 0) {
    removeProcurementItemsByEstimateV2LineIds(projectId, removedLineIds);
    removeHRItemsByEstimateV2LineIds(projectId, removedLineIds);
  }
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = nowIso();
  commitProjectStateChange(projectId);
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
    systemResourceArticleId?: string | null;
  },
): EstimateV2ResourceLine | null {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return null;
  const now = nowIso();
  const line: EstimateV2ResourceLine = {
    id: createEntityId(projectId, "line-v2"),
    projectId,
    stageId: input.stageId,
    workId: input.workId,
    title: input.title.trim() || "New line",
    type: input.type ?? "material",
    unit: input.unit?.trim() || "unit",
    qtyMilli: Math.max(1, Math.round(input.qtyMilli ?? 1_000)),
    costUnitCents: Math.max(0, Math.round(input.costUnitCents ?? 0)),
    systemResourceArticleId: input.systemResourceArticleId ?? null,
    markupBps: clampBps(input.markupBps),
    discountBpsOverride: clampBpsOrNull(input.discountBpsOverride),
    taxBpsOverride: null,
    assigneeId: null,
    assigneeName: null,
    assigneeEmail: null,
    receivedCents: 0,
    pnlPlaceholderCents: 0,
    createdAt: now,
    updatedAt: now,
  };

  state.lines.push(line);
  state.operationalUpperBlock = null;
  const parentWork = state.works.find((work) => work.id === line.workId);
  if (parentWork) syncChecklistForWork(state, parentWork);
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = now;
  commitProjectStateChange(projectId);
  return { ...line };
}

export function updateLine(projectId: string, lineId: string, partial: Partial<EstimateV2ResourceLine>) {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return;
  const now = nowIso();
  const previous = state.lines.find((line) => line.id === lineId) ?? null;
  const shouldClearSummaryPricing = linePartialTouchesPricing(partial);
  const sanitizedPartial: Partial<EstimateV2ResourceLine> = { ...partial };
  if ("markupBps" in sanitizedPartial) {
    sanitizedPartial.markupBps = clampBps(sanitizedPartial.markupBps);
  }
  if ("discountBpsOverride" in sanitizedPartial) {
    sanitizedPartial.discountBpsOverride = clampBpsOrNull(sanitizedPartial.discountBpsOverride);
  }
  state.lines = state.lines.map((line) => (
    line.id === lineId
      ? (() => {
        const nextLine = {
          ...line,
          ...sanitizedPartial,
          updatedAt: now,
        };
        return shouldClearSummaryPricing ? clearLineSummaryPricing(nextLine) : nextLine;
      })()
      : line
  ));
  const updated = state.lines.find((line) => line.id === lineId) ?? null;
  state.operationalUpperBlock = null;
  if (previous) {
    const oldWork = state.works.find((work) => work.id === previous.workId);
    if (oldWork) syncChecklistForWork(state, oldWork);
  }
  if (updated) {
    const newWork = state.works.find((work) => work.id === updated.workId);
    if (newWork) syncChecklistForWork(state, newWork);
  }
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = now;
  commitProjectStateChange(projectId);
}

export function deleteLine(projectId: string, lineId: string) {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return;
  const existing = state.lines.find((line) => line.id === lineId) ?? null;
  state.lines = state.lines.filter((line) => line.id !== lineId);
  state.operationalUpperBlock = null;
  if (existing) {
    const parentWork = state.works.find((work) => work.id === existing.workId);
    if (parentWork) syncChecklistForWork(state, parentWork);
    removeProcurementItemsByEstimateV2LineIds(projectId, [existing.id]);
    removeHRItemsByEstimateV2LineIds(projectId, [existing.id]);
  }
  syncExternalDomainsFromEstimate(projectId, state);
  state.project.updatedAt = nowIso();
  commitProjectStateChange(projectId);
}

export function setProjectEstimateStatus(
  projectId: string,
  status: EstimateExecutionStatus,
  options: SetProjectEstimateStatusOptions = {},
): SetProjectEstimateStatusResult {
  const state = ensureProjectState(projectId);
  if (
    !isOwnerActionAllowed(projectId, options.ownerProfileId, options.projectOwnerProfileId)
  ) {
    return {
      ok: false,
      reason: "forbidden",
    };
  }
  const now = nowIso();
  const previousStatus = state.project.estimateStatus;
  let autoScheduled = false;
  let baselineCaptured = false;
  const shouldInitializeInWork = status === "in_work"
    && (needsInWorkTaskMaterialization(state) || needsInWorkBaselineCapture(state));

  if (shouldInitializeInWork) {
    const missingWorks = sortWorksByStageAndOrder(state).filter((work) => !work.plannedStart || !work.plannedEnd);
    if (missingWorks.length > 0 && !options.skipSetup) {
      return {
        ok: false,
        reason: "missing_work_dates",
        missingWorkIds: missingWorks.map((work) => work.id),
      };
    }

    if (missingWorks.length > 0 && options.skipSetup) {
      const stageOrderById = new Map(state.stages.map((stage) => [stage.id, stage.order]));
      const anchor = projectScheduleAnchor(projectId);
      let scheduled = autoScheduleSequential(state.works, anchor, stageOrderById);
      const cycleValidation = validateNoCycles(state.dependencies);
      if (cycleValidation.valid) {
        const constrainedById = applyFSConstraints(
          Object.fromEntries(scheduled.map((work) => [work.id, work])),
          state.dependencies,
        );
        scheduled = scheduled.map((work) => constrainedById[work.id] ?? work);
      }
      state.works = state.works.map((work) => scheduled.find((entry) => entry.id === work.id) ?? work);
      autoScheduled = true;
    }

    if (needsInWorkTaskMaterialization(state)) {
      materializeTasksForAllWorks(projectId, state);
    }
    if (needsInWorkBaselineCapture(state)) {
      state.scheduleBaseline = captureScheduleBaseline(state, now);
      baselineCaptured = true;
    }
  }

  if (status === "finished") {
    const tasksToValidate = options.projectTasks ?? getTasks(projectId);
    const incompleteTasks = tasksToValidate
      .filter((task) => task.status !== "done")
      .map((task) => ({
        taskId: task.id,
        title: task.title,
      }));
    if (incompleteTasks.length > 0) {
      return {
        ok: false,
        reason: "incomplete_tasks",
        incompleteTasks,
      };
    }
  }

  state.project = {
    ...state.project,
    estimateStatus: status,
    updatedAt: now,
  };

  syncExternalDomainsFromEstimate(projectId, state);

  if (status !== "in_work") {
    state.works = state.works.map((work) => ({
      ...work,
      updatedAt: now,
    }));
  }

  commitProjectStateChange(projectId);
  persistExecutionStatusIfManaged(projectId, status);

  if (previousStatus !== status) {
    emitEstimateEvent(projectId, "estimate.status_changed", {
      previousStatus,
      nextStatus: status,
    });
  }

  return {
    ok: true,
    autoScheduled,
    baselineCaptured,
  };
}

export async function transitionEstimateV2ProjectToInWork(
  projectId: string,
  options: TransitionEstimateV2ProjectToInWorkOptions = {},
): Promise<TransitionEstimateV2ToInWorkResult> {
  const state = ensureProjectState(projectId);
  if (state.project.estimateStatus === "in_work") {
    return {
      ok: true,
      autoScheduled: false,
      baselineCaptured: Boolean(state.scheduleBaseline),
    };
  }

  try {
    const allowed = await isSupabaseOwnerActionAllowed(projectId, options.ownerProfileId);
    if (!allowed) {
      return {
        ok: false,
        reason: "forbidden",
      };
    }
  } catch {
    return {
      ok: false,
      reason: "transition_failed",
      errorMessage: "Unable to verify the authenticated project owner before starting the transition.",
    };
  }

  const draftResult = buildPlanningToInWorkDraft(projectId, state, options);
  if (!draftResult.ok) {
    return {
      ok: false,
      reason: "missing_work_dates",
      missingWorkIds: draftResult.missingWorkIds,
    };
  }

  const previousEstimateStatus = state.project.estimateStatus;
  trackEvent("estimate_in_work_transition_requested", {
    project_id: projectId,
    surface: "estimate",
    source: "transition",
    from_status: previousEstimateStatus,
    skip_setup: options.skipSetup ?? false,
    auto_scheduled_preview: draftResult.draft.autoScheduled,
    works_count: draftResult.draft.works.length,
    lines_count: state.lines.length,
  });

  heroTransitionInFlightByProjectId.add(projectId);
  deferredDraftSyncByProjectId.delete(projectId);
  const existingTimer = remoteDraftSyncTimers.get(projectId);
  if (existingTimer) {
    clearTimeout(existingTimer);
    remoteDraftSyncTimers.delete(projectId);
  }

  try {
    const persisted = await persistEstimateV2HeroTransition({
      projectId,
      projectTitle: state.project.title,
      previousStatus: state.project.estimateStatus === "paused" ? "paused" : "planning",
      autoScheduled: draftResult.draft.autoScheduled,
      stages: state.stages.map((stage) => ({
        localStageId: stage.id,
        title: stage.title,
        order: stage.order,
        discountBps: stage.discountBps,
      })),
      works: draftResult.draft.works.map((work) => ({
        localWorkId: work.id,
        localStageId: work.stageId,
        title: work.title,
        order: work.order,
        plannedStart: work.plannedStart,
        plannedEnd: work.plannedEnd,
      })),
      lines: state.lines.map((line) => ({
        localLineId: line.id,
        localStageId: line.stageId,
        localWorkId: line.workId,
        title: line.title,
        type: line.type,
        unit: line.unit,
        qtyMilli: line.qtyMilli,
        costUnitCents: line.costUnitCents,
      })),
    });

    applySupabaseInWorkTransitionSuccess(
      state,
      draftResult.draft,
      persisted.ids.taskIdByLocalWorkId,
    );
    commitProjectStateChange(projectId);

    trackEvent("estimate_in_work_transition_succeeded", {
      project_id: projectId,
      surface: "estimate",
      source: "transition",
      from_status: previousEstimateStatus,
      skip_setup: options.skipSetup ?? false,
      auto_scheduled: draftResult.draft.autoScheduled,
      baseline_captured: true,
      works_count: draftResult.draft.works.length,
      lines_count: state.lines.length,
    });

    return {
      ok: true,
      autoScheduled: draftResult.draft.autoScheduled,
      baselineCaptured: true,
    };
  } catch (error) {
    if (error instanceof EstimateV2HeroTransitionError) {
      trackEvent("estimate_in_work_transition_failed", {
        project_id: projectId,
        surface: "estimate",
        source: "transition",
        from_status: previousEstimateStatus,
        skip_setup: options.skipSetup ?? false,
        works_count: draftResult.draft.works.length,
        lines_count: state.lines.length,
        reason: "transition_failed",
        error_message: error.message,
        error_type: "EstimateV2HeroTransitionError",
        blocking: false,
      });

      return {
        ok: false,
        reason: "transition_failed",
        errorMessage: error.message,
        blocking: false,
      };
    }
    
    trackEvent("estimate_in_work_transition_failed", {
      project_id: projectId,
      surface: "estimate",
      source: "transition",
      from_status: previousEstimateStatus,
      skip_setup: options.skipSetup ?? false,
      works_count: draftResult.draft.works.length,
      lines_count: state.lines.length,
      reason: "transition_failed",
      error_message: "The Supabase transition did not complete. Some remote rows may already exist. Retry will resume reconciliation.",
      error_type: "unknown",
    });

    return {
      ok: false,
      reason: "transition_failed",
      errorMessage: "The Supabase transition did not complete. Some remote rows may already exist. Retry will resume reconciliation.",
    };
  } finally {
    heroTransitionInFlightByProjectId.delete(projectId);
    if (deferredDraftSyncByProjectId.delete(projectId)) {
      queueProjectDraftSync(projectId);
    }
  }
}

export function updateEstimateV2Project(projectId: string, partial: Partial<EstimateV2Project>) {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return;
  const prevTax = state.project.taxBps;
  const prevDiscount = state.project.discountBps;
  const prevProjectMode = state.project.projectMode;
  const nextProjectMode = partial.projectMode ?? state.project.projectMode;
  const sanitizedPartial: Partial<EstimateV2Project> = { ...partial };
  if ("markupBps" in sanitizedPartial) {
    sanitizedPartial.markupBps = clampBps(sanitizedPartial.markupBps);
  }
  state.project = {
    ...state.project,
    ...sanitizedPartial,
    projectMode: nextProjectMode,
    updatedAt: nowIso(),
  };

  if (partial.taxBps != null && partial.taxBps !== prevTax) {
    emitEstimateEvent(projectId, "estimate.tax_changed", {
      previousTaxBps: prevTax,
      nextTaxBps: partial.taxBps,
    });
  }

  if (partial.discountBps != null && partial.discountBps !== prevDiscount) {
    emitEstimateEvent(projectId, "estimate.discount_changed", {
      previousDiscountBps: prevDiscount,
      nextDiscountBps: partial.discountBps,
    });
  }

  if (partial.projectMode != null && partial.projectMode !== prevProjectMode) {
    emitEstimateEvent(projectId, "estimate.project_mode_set", {
      previousProjectMode: prevProjectMode,
      nextProjectMode: partial.projectMode,
    });
  }

  commitProjectStateChange(projectId);
}

export function addDependency(
  projectId: string,
  fromWorkId: string,
  toWorkId: string,
  lagDays: number,
  comment?: string,
):
  | { ok: true; dependency: EstimateV2Dependency; shiftedWorkIds: string[] }
  | { ok: false; reason: "forbidden" | "self_dependency" | "invalid_work" | "cycle"; cyclePath?: string[] } {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) {
    return { ok: false, reason: "forbidden" };
  }

  if (fromWorkId === toWorkId) {
    return { ok: false, reason: "self_dependency" };
  }

  const worksById = buildWorksById(state.works);
  if (!worksById[fromWorkId] || !worksById[toWorkId]) {
    return { ok: false, reason: "invalid_work" };
  }

  const now = nowIso();
  const dependency: EstimateV2Dependency = {
    id: createEntityId(projectId, "dep-v2"),
    projectId,
    kind: "FS",
    fromWorkId,
    toWorkId,
    lagDays: normalizedLagDays(lagDays),
    createdAt: now,
    updatedAt: now,
  };

  const candidateDependencies = [...state.dependencies, dependency];
  const cycle = detectCycle(
    state.works.map((work) => ({ id: work.id })),
    candidateDependencies,
  );
  if (cycle.hasCycle) {
    return {
      ok: false,
      reason: "cycle",
      cyclePath: cycle.cyclePath,
    };
  }

  state.dependencies = candidateDependencies;
  const constrainedById = applyFSConstraints(worksById, state.dependencies);
  const changedWorkIds = applyScheduledDatesFromMap(state, constrainedById, now);

  if (state.project.estimateStatus === "in_work" && changedWorkIds.length > 0) {
    applyWorkToTaskSync(state, changedWorkIds);
  }

  state.project.updatedAt = now;
  commitProjectStateChange(projectId);

  const fromWorkTitle = worksById[fromWorkId]?.title ?? fromWorkId;
  const toWorkTitle = worksById[toWorkId]?.title ?? toWorkId;
  const normalizedComment = comment?.trim() || null;
  if (normalizedComment) {
    const successor = state.works.find((work) => work.id === toWorkId);
    if (successor?.taskId) {
      addComment(
        successor.taskId,
        `Dependency: "${normalizedComment}" — wait ${dependency.lagDays} day(s) after "${fromWorkTitle}" before starting this.`,
      );
    }
  }

  emitEstimateEvent(projectId, "estimate.dependency_added", {
    dependencyId: dependency.id,
    fromWorkId,
    toWorkId,
    lagDays: dependency.lagDays,
    ...(normalizedComment ? { comment: normalizedComment } : {}),
  });

  return {
    ok: true,
    dependency: { ...dependency },
    shiftedWorkIds: changedWorkIds,
  };
}

export function removeDependency(projectId: string, dependencyId: string) {
  const state = ensureProjectState(projectId);
  if (!canEditEstimateState(projectId, state)) return;
  const now = nowIso();
  const existing = state.dependencies.find((dep) => dep.id === dependencyId) ?? null;
  state.dependencies = state.dependencies.filter((dep) => dep.id !== dependencyId);
  if (!existing) return;
  state.project.updatedAt = now;
  commitProjectStateChange(projectId);
  emitEstimateEvent(projectId, "estimate.dependency_removed", {
    dependencyId,
    fromWorkId: existing.fromWorkId,
    toWorkId: existing.toWorkId,
  });
}

export function createDependency(
  projectId: string,
  input: { fromWorkId: string; toWorkId: string; lagDays?: number; comment?: string },
): EstimateV2Dependency | null {
  const result = addDependency(
    projectId,
    input.fromWorkId,
    input.toWorkId,
    input.lagDays ?? 0,
    input.comment,
  );
  if (!result.ok) {
    return null;
  }
  return result.dependency;
}

export function deleteDependency(projectId: string, dependencyId: string) {
  removeDependency(projectId, dependencyId);
}

export function createVersionSnapshot(
  projectId: string,
  createdBy: string,
): { versionId: string; shareId: string; snapshot: EstimateV2Snapshot } {
  const state = ensureProjectState(projectId);
  const now = nowIso();
  const snapshot = getSnapshotFromState(state);
  const nextNumber = state.versions.reduce((max, version) => Math.max(max, version.number), 0) + 1;
  const shareId = id("share");

  const version: EstimateV2Version = {
    id: id("estimate-v2-version"),
    projectId,
    number: nextNumber,
    status: "proposed",
    snapshot,
    shareId,
    shareApprovalPolicy: "registered",
    shareApprovalDisabledReason: null,
    approvalStamp: null,
    archived: true,
    submitted: false,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  state.versions.push(version);
  state.project.updatedAt = now;
  commitProjectStateChange(projectId);

  return {
    versionId: version.id,
    shareId,
    snapshot: cloneSnapshot(version.snapshot),
  };
}

function resolveShareApprovalPolicy(
  options: SubmitVersionOptions,
): {
  shareApprovalPolicy: EstimateV2VersionShareApprovalPolicy;
  shareApprovalDisabledReason: EstimateV2VersionShareApprovalDisabledReason;
} {
  const shareApprovalPolicy = options.shareApprovalPolicy ?? "registered";
  if (shareApprovalPolicy === "disabled") {
    return {
      shareApprovalPolicy,
      shareApprovalDisabledReason: options.shareApprovalDisabledReason ?? "no_participant_slot",
    };
  }
  return {
    shareApprovalPolicy,
    shareApprovalDisabledReason: null,
  };
}

export function submitVersion(projectId: string, versionId: string, options: SubmitVersionOptions = {}): boolean {
  const state = ensureProjectState(projectId);
  if (!isSubmissionActionAllowed(projectId)) return false;
  const now = nowIso();
  const actor = getCurrentUser();
  const approvalPolicy = resolveShareApprovalPolicy(options);

  state.versions = state.versions.map((version) => {
    if (version.id === versionId) {
      return {
        ...version,
        status: "proposed" as const,
        archived: false,
        submitted: true,
        approvalStamp: null,
        shareApprovalPolicy: approvalPolicy.shareApprovalPolicy,
        shareApprovalDisabledReason: approvalPolicy.shareApprovalDisabledReason,
        updatedAt: now,
      };
    }
    return {
      ...version,
      archived: true,
      updatedAt: now,
    };
  });

  const submittedVersion = state.versions.find((version) => version.id === versionId);
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
  commitProjectStateChange(projectId);
  return true;
}

export function refreshVersionSnapshot(
  projectId: string,
  versionId: string,
  actorId: string,
  options: SubmitVersionOptions = {},
): boolean {
  const state = ensureProjectState(projectId);
  if (!isSubmissionActionAllowed(projectId)) return false;
  const target = state.versions.find((version) => version.id === versionId);
  if (!target || !target.submitted || target.archived || target.status !== "proposed") return false;
  const now = nowIso();
  const snapshot = getSnapshotFromState(state);
  const approvalPolicy = resolveShareApprovalPolicy(options);

  state.versions = state.versions.map((version) => {
    if (version.id === versionId) {
      return {
        ...version,
        status: "proposed" as const,
        snapshot,
        archived: false,
        submitted: true,
        approvalStamp: null,
        shareApprovalPolicy: approvalPolicy.shareApprovalPolicy,
        shareApprovalDisabledReason: approvalPolicy.shareApprovalDisabledReason,
        updatedAt: now,
      };
    }
    return {
      ...version,
      archived: true,
      updatedAt: now,
    };
  });

  const refreshedVersion = state.versions.find((version) => version.id === versionId);
  if (!refreshedVersion) return false;

  addEvent({
    id: id("evt-estimate-v2-submitted"),
    project_id: projectId,
    actor_id: actorId,
    type: "estimate.version_submitted",
    object_type: "estimate_version",
    object_id: refreshedVersion.id,
    timestamp: now,
    payload: {
      projectId,
      versionId: refreshedVersion.id,
      actor: actorId,
      versionNumber: refreshedVersion.number,
      refreshed: true,
    },
  });

  state.project.updatedAt = now;
  commitProjectStateChange(projectId);
  return true;
}

export function approveVersion(
  projectId: string,
  versionId: string,
  stamp: ApprovalStamp,
  options: ApproveVersionOptions = {},
): boolean {
  const state = ensureProjectState(projectId);
  const target = state.versions.find((version) => version.id === versionId);
  if (!target) return false;
  if (!target.submitted || target.archived || target.status !== "proposed") return false;
  if (target.shareApprovalPolicy === "disabled") return false;
  const now = nowIso();

  state.versions = state.versions.map((version) => {
    if (version.id === versionId) {
      return {
        ...version,
        status: "approved" as const,
        archived: false,
        submitted: true,
        approvalStamp: { ...stamp },
        updatedAt: now,
      };
    }

    return {
      ...version,
      archived: true,
      updatedAt: now,
    };
  });

  const approvedVersion = state.versions.find((version) => version.id === versionId);
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
  commitProjectStateChange(projectId);
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
    .filter((entry) => entry.status === "proposed" && entry.submitted && !entry.archived)
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
  const prevSnapshot = prevVersion?.snapshot ?? null;
  const nextSnapshot = nextVersion.snapshot;

  const stageChanges = diffById(prevSnapshot?.stages ?? [], nextSnapshot.stages);
  const workChanges = diffById(prevSnapshot?.works ?? [], nextSnapshot.works);
  const lineChanges = diffById(prevSnapshot?.lines ?? [], nextSnapshot.lines);

  const prevStageById = mapById(prevSnapshot?.stages ?? []);
  const nextStageById = mapById(nextSnapshot.stages);
  const prevWorkById = mapById(prevSnapshot?.works ?? []);
  const nextWorkById = mapById(nextSnapshot.works);
  const prevLineById = mapById(prevSnapshot?.lines ?? []);
  const nextLineById = mapById(nextSnapshot.lines);

  const prevStageNumberById = buildStageNumberById(prevSnapshot?.stages ?? []);
  const nextStageNumberById = buildStageNumberById(nextSnapshot.stages);
  const prevWorkNumberById = buildWorkNumberById(prevSnapshot?.works ?? [], prevStageNumberById);
  const nextWorkNumberById = buildWorkNumberById(nextSnapshot.works, nextStageNumberById);

  const changes: EstimateV2StructuredChange[] = [];

  stageChanges.forEach((change) => {
    const prevStage = prevStageById.get(change.id);
    const nextStage = nextStageById.get(change.id);
    const source = change.type === "removed" ? prevStage : (nextStage ?? prevStage);
    if (!source) return;

    const fieldChanges: EstimateV2DiffFieldChange[] = [];
    if (change.type === "updated" && prevStage && nextStage) {
      pushFieldChange(fieldChanges, "title", "name", prevStage.title, nextStage.title);
    }

    changes.push({
      entityKind: "stage",
      entityId: source.id,
      changeType: change.type,
      stageId: source.id,
      stageTitle: source.title,
      workId: null,
      workTitle: null,
      title: source.title,
      stageNumber: change.type === "removed"
        ? (prevStageNumberById.get(source.id) ?? null)
        : (nextStageNumberById.get(source.id) ?? prevStageNumberById.get(source.id) ?? null),
      workNumber: null,
      fieldChanges,
    });
  });

  workChanges.forEach((change) => {
    const prevWork = prevWorkById.get(change.id);
    const nextWork = nextWorkById.get(change.id);
    const source = change.type === "removed" ? prevWork : (nextWork ?? prevWork);
    if (!source) return;

    const fieldChanges: EstimateV2DiffFieldChange[] = [];
    if (change.type === "updated" && prevWork && nextWork) {
      pushFieldChange(fieldChanges, "title", "name", prevWork.title, nextWork.title);
    }

    const stageId = source.stageId;
    const stageTitle = change.type === "removed"
      ? (prevStageById.get(stageId)?.title ?? nextStageById.get(stageId)?.title ?? null)
      : (nextStageById.get(stageId)?.title ?? prevStageById.get(stageId)?.title ?? null);
    changes.push({
      entityKind: "work",
      entityId: source.id,
      changeType: change.type,
      stageId,
      stageTitle,
      workId: source.id,
      workTitle: source.title,
      title: source.title,
      stageNumber: change.type === "removed"
        ? (prevStageNumberById.get(stageId) ?? null)
        : (nextStageNumberById.get(stageId) ?? prevStageNumberById.get(stageId) ?? null),
      workNumber: change.type === "removed"
        ? (prevWorkNumberById.get(source.id) ?? null)
        : (nextWorkNumberById.get(source.id) ?? prevWorkNumberById.get(source.id) ?? null),
      fieldChanges,
    });
  });

  lineChanges.forEach((change) => {
    const prevLine = prevLineById.get(change.id);
    const nextLine = nextLineById.get(change.id);
    const source = change.type === "removed" ? prevLine : (nextLine ?? prevLine);
    if (!source) return;

    const fieldChanges = change.type === "updated" && prevLine && nextLine
      ? buildLineFieldChanges(prevSnapshot, nextSnapshot, prevLine, nextLine)
      : [];

    const stageId = source.stageId;
    const workId = source.workId;
    const stageTitle = change.type === "removed"
      ? (prevStageById.get(stageId)?.title ?? nextStageById.get(stageId)?.title ?? null)
      : (nextStageById.get(stageId)?.title ?? prevStageById.get(stageId)?.title ?? null);
    const workTitle = change.type === "removed"
      ? (prevWorkById.get(workId)?.title ?? nextWorkById.get(workId)?.title ?? null)
      : (nextWorkById.get(workId)?.title ?? prevWorkById.get(workId)?.title ?? null);
    changes.push({
      entityKind: "line",
      entityId: source.id,
      changeType: change.type,
      stageId,
      stageTitle,
      workId,
      workTitle,
      title: source.title,
      stageNumber: change.type === "removed"
        ? (prevStageNumberById.get(stageId) ?? null)
        : (nextStageNumberById.get(stageId) ?? prevStageNumberById.get(stageId) ?? null),
      workNumber: change.type === "removed"
        ? (prevWorkNumberById.get(workId) ?? null)
        : (nextWorkNumberById.get(workId) ?? prevWorkNumberById.get(workId) ?? null),
      fieldChanges,
    });
  });

  return {
    stageChanges,
    workChanges,
    lineChanges,
    changedStageIds: stageChanges.map((change) => change.id),
    changedWorkIds: workChanges.map((change) => change.id),
    changedLineIds: lineChanges.map((change) => change.id),
    changes: changes.sort(structuredSort),
  };
}

export function __unsafeResetEstimateV2ForTests() {
  statesByProjectId.clear();
  accessContextByProjectId.clear();
  retainedSupabaseSyncProfileIdByProjectId.clear();
  retainedSupabaseAccessContextByProjectId.clear();
  defaultSeededStateProjectIds.clear();
  if (mainStoreUnsubscribe) {
    mainStoreUnsubscribe();
    mainStoreUnsubscribe = null;
  }
  remoteHydrationPromises.clear();
  remoteDraftSyncTimers.forEach((timer) => clearTimeout(timer));
  remoteDraftSyncTimers.clear();
  remoteDraftSyncErrorSignatureByProjectId.clear();
  heroTransitionInFlightByProjectId.clear();
  deferredDraftSyncByProjectId.clear();
  remoteProjectionSyncInFlightByProjectId.clear();
  listeners.clear();
  crossSyncInProgress = false;
}

export function __unsafeSetEstimateOperationalUpperBlockForTests(
  projectId: string,
  upperBlock: EstimateOperationalUpperBlock | null,
) {
  const state = ensureProjectState(projectId);
  state.operationalUpperBlock = upperBlock ? cloneOperationalUpperBlock(upperBlock) : null;
  notify();
}
