/**
 * Permission-aware AI project context assembly.
 *
 * This module is the single source of truth for what project data AI may consume.
 * Every field included here must satisfy the user's effective visibility envelope;
 * hidden domains, hidden financial fields, and internal-only classifications are
 * stripped at assembly time—not at response time.
 */

import type { ProjectAuthoritySeam } from "@/lib/project-authority-seam";
import type { EstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";
import type { ProcurementReadProjectSummary } from "@/lib/procurement-read-model";
import type { Event, Project } from "@/types/entities";
import {
  getProjectDomainAccess,
  getProjectRole,
  projectDomainAllowsView,
  seamEstimateFinanceVisibilityMode,
  type ProjectDomain,
} from "@/lib/permissions";
import {
  effectiveInternalDocsVisibilityForSeam,
  canViewInternalDocuments,
} from "@/lib/internal-docs-visibility";
import {
  countTaskStatuses,
  deriveProjectProgressPct,
  totalTaskCount,
} from "@/lib/project-status";

// ---------------------------------------------------------------------------
// Targeted send gate (live assistant path must not bypass strict context seam)
// ---------------------------------------------------------------------------

export type AIProjectTargetedSendGate =
  | "ok"
  | "no_target"
  | "loading"
  | "no_seam"
  | "seam_mismatch";

/**
 * Fail-closed guard for project-targeted AI sends: seam must finish loading,
 * exist, and match the project id being addressed.
 */
export function gateAIProjectTargetedSend(
  targetProjectId: string | undefined,
  seam: ProjectAuthoritySeam | undefined,
  seamLoading: boolean,
): AIProjectTargetedSendGate {
  if (!targetProjectId) return "no_target";
  if (seamLoading) return "loading";
  if (!seam) return "no_seam";
  if (seam.projectId !== targetProjectId) return "seam_mismatch";
  return "ok";
}

/**
 * Full readiness for a project-targeted assistant turn (AISidebar `runAssistantForContent`).
 * Route-agnostic: `/project/:id` and `/home` with a selected project use the same inputs.
 */
export type AIProjectTargetedSendReadiness =
  | { status: "ready" }
  | { status: "blocked"; gate: Exclude<AIProjectTargetedSendGate, "ok"> }
  | { status: "no_project" };

export function evaluateProjectTargetedSendReadiness(
  targetProjectId: string | undefined,
  seam: ProjectAuthoritySeam | undefined,
  seamLoading: boolean,
  ctxProject: Project | null | undefined,
): AIProjectTargetedSendReadiness {
  const gate = gateAIProjectTargetedSend(targetProjectId, seam, seamLoading);
  if (gate !== "ok") return { status: "blocked", gate };
  if (!ctxProject) return { status: "no_project" };
  return { status: "ready" };
}

// ---------------------------------------------------------------------------
// Output shape
// ---------------------------------------------------------------------------

export interface AIContextProject {
  title: string;
  type: string;
  progress: string;
}

export interface AIContextStage {
  title: string;
  status: string;
}

export interface AIContextTasks {
  total: number;
  done: number;
  blocked: number;
}

export interface AIContextEstimate {
  hasEstimate: boolean;
  status: string | null;
  stages: number;
  lines: number;
}

export interface AIContextProcurement {
  total: number;
  requested: number;
  ordered: number;
  inStock: number;
}

export interface AIContextUser {
  role: string;
}

export interface AIContextEvent {
  type: string;
  time: string;
}

export interface AIContextPack {
  project: AIContextProject;
  stages: AIContextStage[];
  tasks: AIContextTasks | null;
  estimate: AIContextEstimate | null;
  procurement: AIContextProcurement | null;
  user: AIContextUser;
  members: number | null;
  recentEvents: AIContextEvent[];
  /** Transparency: which domains were excluded for the current role. */
  _meta: { hiddenDomains: string[] };
}

// ---------------------------------------------------------------------------
// Inputs (caller-provided, not fetched internally to stay pure & testable)
// ---------------------------------------------------------------------------

export interface AIContextInputs {
  /**
   * `progress_pct` is the stored column (rovno-db#47). It survives here only as
   * the fallback for a project that has no tasks to measure — see the progress
   * derivation in `buildAIProjectContext`.
   */
  project: { title: string; type: string; progress_pct: number } | null;
  stages: { title: string; status: string }[];
  tasks: { status: string }[];
  financeSummary: EstimateV2FinanceProjectSummary | null;
  procurementSummary: ProcurementReadProjectSummary | null;
  events: Event[];
  memberCount: number;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export function buildAIProjectContext(
  seam: ProjectAuthoritySeam,
  inputs: AIContextInputs,
): AIContextPack {
  const role = getProjectRole(seam);
  const financeMode = seamEstimateFinanceVisibilityMode(seam);
  const hiddenDomains: string[] = [];

  const canSeeInternal = canViewInternalDocuments(
    effectiveInternalDocsVisibilityForSeam(seam.membership),
  );

  function domainVisible(domain: ProjectDomain): boolean {
    const access = getProjectDomainAccess(seam, domain);
    const visible = projectDomainAllowsView(access);
    if (!visible) hiddenDomains.push(domain);
    return visible;
  }

  // -- Tasks --
  // Resolved before the project block because progress is derived from the same
  // counts. `domainVisible` appends to `hiddenDomains`, so this must stay the
  // first domain checked or the order of `_meta.hiddenDomains` changes.
  const tasksVisible = domainVisible("tasks");
  const taskCounts = countTaskStatuses(inputs.tasks);
  const tasksTotal = totalTaskCount(taskCounts);

  const tasks: AIContextTasks | null = tasksVisible
    ? { total: tasksTotal, done: taskCounts.done, blocked: taskCounts.blocked }
    : null;

  // -- Project basics (always visible for members) --
  // Progress is the share of finished tasks, the same formula the project
  // dashboard and the home "Проекты" list use (`deriveProjectProgressPct`), so
  // the assistant cannot reason from a number the user never sees. The stored
  // `progress_pct` is used only when the project has no tasks at all, and only
  // when the tasks domain is visible to this role — a role that may not see
  // tasks must not receive an aggregate computed from them.
  const progressPct = inputs.project
    ? (tasksVisible
        ? deriveProjectProgressPct(taskCounts, inputs.project.progress_pct)
        : inputs.project.progress_pct)
    : 0;
  const project: AIContextProject = inputs.project
    ? { title: inputs.project.title, type: inputs.project.type, progress: `${progressPct}%` }
    : { title: "", type: "", progress: "0%" };

  const stages: AIContextStage[] = inputs.stages.map((s) => ({ title: s.title, status: s.status }));

  // -- Estimate (visibility-mode gated) --
  let estimate: AIContextEstimate | null = null;
  if (domainVisible("estimate")) {
    const fs = inputs.financeSummary;
    if (financeMode === "detail" || financeMode === "summary") {
      estimate = {
        hasEstimate: fs?.hasEstimate ?? false,
        status: fs?.status ?? null,
        stages: fs?.stageCount ?? 0,
        lines: fs?.lineCount ?? 0,
      };
    } else {
      // finance = none → structural only
      estimate = {
        hasEstimate: fs?.hasEstimate ?? false,
        status: null,
        stages: fs?.stageCount ?? 0,
        lines: fs?.lineCount ?? 0,
      };
    }
  }

  // -- Procurement (contract: summary = no money) --
  let procurement: AIContextProcurement | null = null;
  if (domainVisible("procurement")) {
    const ps = inputs.procurementSummary;
    procurement = {
      total: ps?.totalCount ?? 0,
      requested: ps?.requestedCount ?? 0,
      ordered: ps?.orderedCount ?? 0,
      inStock: ps?.inStockCount ?? 0,
    };
    // All monetary totals stripped: contract says procurement summary = operational rows only.
    // Owner/co_owner with manage access may later get money here if product extends this surface.
  }

  // -- HR: always check domain visibility (hidden for viewer/contractor) --
  if (!domainVisible("hr")) {
    // already pushed to hiddenDomains
  }

  // -- Documents: domain visible, but internal classification filtered --
  if (!domainVisible("documents")) {
    hiddenDomains.push("documents");
  }
  // canSeeInternal tracked but not surfaced as data yet; future LLM calls may include doc titles.
  void canSeeInternal;

  // -- Participants (hidden for viewer/contractor) --
  const members: number | null = domainVisible("participants") ? inputs.memberCount : null;

  // -- User info --
  const user: AIContextUser = { role };

  // -- Recent events (strip sensitive payloads; only type + time) --
  const recentEvents: AIContextEvent[] = inputs.events.slice(0, 5).map((e) => ({
    type: e.type,
    time: new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  return {
    project,
    stages,
    tasks,
    estimate,
    procurement,
    user,
    members,
    recentEvents,
    _meta: { hiddenDomains },
  };
}
