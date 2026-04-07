/**
 * Permission-aware AI project context assembly.
 *
 * Execution semantics: permissions.contract.json → ai_enforcement + domains.ai_project_surface
 *
 * This module is the single source of truth for what project data AI may consume.
 * Every field included here must satisfy the user's effective visibility envelope;
 * hidden domains, hidden financial fields, and internal-only classifications are
 * stripped at assembly time—not at response time.
 */

import type { ProjectAuthoritySeam } from "@/lib/project-authority-seam";
import type { EstimateV2FinanceProjectSummary } from "@/lib/estimate-v2/finance-read-model";
import type { ProcurementReadProjectSummary } from "@/lib/procurement-read-model";
import type { Event } from "@/types/entities";
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
  credits: number;
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
  project: { title: string; type: string; progress_pct: number } | null;
  stages: { title: string; status: string }[];
  tasks: { status: string }[];
  financeSummary: EstimateV2FinanceProjectSummary | null;
  procurementSummary: ProcurementReadProjectSummary | null;
  events: Event[];
  memberCount: number;
  userCredits: number;
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

  // -- Project basics (always visible for members) --
  const project: AIContextProject = inputs.project
    ? { title: inputs.project.title, type: inputs.project.type, progress: `${inputs.project.progress_pct}%` }
    : { title: "", type: "", progress: "0%" };

  const stages: AIContextStage[] = inputs.stages.map((s) => ({ title: s.title, status: s.status }));

  // -- Tasks --
  const tasks: AIContextTasks | null = domainVisible("tasks")
    ? {
        total: inputs.tasks.length,
        done: inputs.tasks.filter((t) => t.status === "done").length,
        blocked: inputs.tasks.filter((t) => t.status === "blocked").length,
      }
    : null;

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
  const user: AIContextUser = { role, credits: inputs.userCredits };

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
