import { useQueryClient } from "@tanstack/react-query";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Info, Plus, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AssigneeCell } from "@/components/estimate-v2/AssigneeCell";
import { InlineEditableNumber } from "@/components/estimate-v2/InlineEditableNumber";
import { InlineEditableText } from "@/components/estimate-v2/InlineEditableText";
import { ResourceTypeBadge } from "@/components/estimate-v2/ResourceTypeBadge";
import {
  useHRItems,
  useHRPayments,
  useProcurementV2,
  useTasks,
} from "@/hooks/use-mock-data";
import { useLocations } from "@/hooks/use-inventory-data";
import {
  useWorkspaceCurrentUserState,
  useWorkspaceMode,
  useWorkspaceProjectInvites,
  useWorkspaceProjectMembersState,
  useWorkspaceProjectState,
} from "@/hooks/use-workspace-source";
import { trackEvent } from "@/lib/analytics";
import {
  approveVersion,
  clearEstimateV2ProjectAccessContext,
  computeVersionDiff,
  createLine,
  createStage,
  createVersionSnapshot,
  createWork,
  deleteLine,
  deleteStage,
  deleteWork,
  registerEstimateV2ProjectAccessContext,
  refreshVersionSnapshot,
  setProjectEstimateStatus,
  transitionEstimateV2ProjectToInWork,
  submitVersion,
  updateEstimateV2Project,
  updateLine,
  updateStage,
  updateWork,
} from "@/data/estimate-v2-store";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";
import { getPlanningSource } from "@/data/planning-source";
import { addEvent, getUserById } from "@/data/store";
import { createWorkspaceProjectInvite, sendWorkspaceProjectInviteEmail } from "@/data/workspace-source";
import {
  computeLineTotals,
  computeProjectTotals,
  computeStageTotals,
  displayLineClientAmounts,
} from "@/lib/estimate-v2/pricing";
import { resolveProjectEstimateCtaState } from "@/lib/estimate-v2/project-estimate-cta";
import { resolveSubmitToClientState } from "@/lib/estimate-v2/project-estimate-submit-state";
import { getDefaultFinanceVisibility } from "@/lib/participant-role-policy";
import {
  combinePlanFact,
  computeFactFromDataSources,
  computePlannedFromEstimateV2,
} from "@/lib/estimate-v2/rollups";
import { fromDayIndex, toDayIndex } from "@/lib/estimate-v2/schedule";
import { useOrders } from "@/hooks/use-order-data";
import { activityQueryKeys } from "@/hooks/use-activity-source";
import { hrQueryKeys } from "@/hooks/use-hr-source";
import { planningQueryKeys } from "@/hooks/use-planning-source";
import { procurementProjectItemsQueryRoot } from "@/hooks/use-procurement-source";
import {
  getProjectDomainAccess,
  projectDomainAllowsView,
  projectDomainAllowsManage,
  seamCanViewOperationalFinanceSummary,
  seamCanViewSensitiveDetail,
  usePermission,
} from "@/lib/permissions";
import { ApprovalStampCard } from "@/components/estimate-v2/ApprovalStampCard";
import { ApprovalStampFormModal } from "@/components/estimate-v2/ApprovalStampFormModal";
import { VersionBanner } from "@/components/estimate-v2/VersionBanner";
import { VersionDiffList } from "@/components/estimate-v2/VersionDiffList";
import { EstimateGantt } from "@/components/estimate-v2/gantt/EstimateGantt";
import {
  buildUnitSelectOptions,
  CUSTOM_UNIT_SENTINEL,
  getUnitOptionsForType,
  resolveUnitSelectValue,
} from "@/lib/estimate-v2/resource-units";
import {
  assessResourceDelete,
  assessStageDelete,
  assessWorkDelete,
  getNextDeleteStep,
  type DeleteAssessment,
  type DeleteDialogStep,
} from "@/lib/estimate-v2/delete-safeguards";
import type {
  ApprovalStamp,
  EstimateV2ResourceLine,
  EstimateV2Stage,
  EstimateV2Version,
  EstimateV2Work,
  EstimateExecutionStatus,
  ResourceLineType,
} from "@/types/estimate-v2";
import type { Task, UserPlan } from "@/types/entities";
import { Checkbox } from "@/components/ui/checkbox";

type ChecklistFallbackEstimateRow = {
  id: string;
  workId: string;
  title: string;
  type: ResourceLineType;
  typeLabel: string | null;
  qtyMilli: number | null;
  unit: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
};

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function qtyFromMilli(qtyMilli: number): string {
  return (qtyMilli / 1000).toString();
}

function toQtyMilli(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1000;
  return Math.max(1, Math.round(parsed * 1000));
}

function toCentsFromMajor(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function toBpsFromPercent(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed * 100));
}

function fromBpsToPercent(bps: number): string {
  return (bps / 100).toString();
}

function labelForType(type: ResourceLineType): string {
  if (type === "material") return "Material";
  if (type === "tool") return "Tool";
  if (type === "labor") return "Labor";
  if (type === "subcontractor") return "Subcontractor";
  return "Other";
}

function isAssignableResourceType(type: ResourceLineType): boolean {
  return type === "labor" || type === "subcontractor";
}

function resolveChecklistFallbackRowType(task: Task, checklistIndex: number): ResourceLineType | null {
  const checklistItem = task.checklist[checklistIndex];
  if (!checklistItem) return null;
  if (checklistItem.estimateV2ResourceType) return checklistItem.estimateV2ResourceType;
  if (checklistItem.type === "material") return "material";
  if (checklistItem.type === "tool") return "tool";
  if (checklistItem.estimateV2LineId || checklistItem.estimateV2WorkId) return "other";
  return null;
}

function resolveChecklistFallbackRowLabel(task: Task, checklistIndex: number): string | null {
  const checklistItem = task.checklist[checklistIndex];
  if (!checklistItem) return null;
  if (checklistItem.estimateV2ResourceType) return null;
  if (checklistItem.type === "material" || checklistItem.type === "tool") return null;
  if (checklistItem.estimateV2LineId || checklistItem.estimateV2WorkId) return "Estimate item";
  return null;
}

function resolveTaskAssignee(task: Task): {
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
} {
  const taskAssignee = task.assignees?.find((entry) => entry.id === task.assignee_id) ?? null;
  if (taskAssignee) {
    return {
      assigneeId: taskAssignee.id ?? null,
      assigneeName: taskAssignee.name ?? null,
      assigneeEmail: taskAssignee.email ?? null,
    };
  }

  const user = task.assignee_id ? getUserById(task.assignee_id) : null;
  return {
    assigneeId: task.assignee_id || null,
    assigneeName: user?.name ?? null,
    assigneeEmail: user?.email ?? null,
  };
}

function buildHierarchyNumbers(
  sortedStages: EstimateV2Stage[],
  worksByStage: Map<string, EstimateV2Work[]>,
): {
  stageNumberById: Map<string, number>;
  workNumberById: Map<string, string>;
} {
  const stageNumberById = new Map<string, number>();
  const workNumberById = new Map<string, string>();

  sortedStages.forEach((stage, stageIndex) => {
    const stageNumber = stageIndex + 1;
    stageNumberById.set(stage.id, stageNumber);

    const stageWorks = worksByStage.get(stage.id) ?? [];
    stageWorks.forEach((work, workIndex) => {
      workNumberById.set(work.id, `${stageNumber}.${workIndex + 1}`);
    });
  });

  return { stageNumberById, workNumberById };
}

function effectiveDiscountForDisplay(line: EstimateV2ResourceLine, stage: EstimateV2Stage, projectDiscountBps: number): number {
  if (line.discountBpsOverride != null) return line.discountBpsOverride;
  if (stage.discountBps > 0) return stage.discountBps;
  return projectDiscountBps;
}

function estimateStatusLabel(status: EstimateExecutionStatus): string {
  if (status === "planning") return "Planning";
  if (status === "in_work") return "In work";
  if (status === "paused") return "Paused";
  return "Finished";
}

function estimateStatusClassName(status: EstimateExecutionStatus): string {
  if (status === "planning") return "border-foreground/15 bg-foreground/5 text-foreground";
  if (status === "in_work") return "border-info/25 bg-info/10 text-info";
  if (status === "paused") return "border-warning/25 bg-warning/15 text-warning-foreground";
  return "border-success/25 bg-success/12 text-success";
}

function durationDays(startDay: number | null, endDay: number | null): number | null {
  if (startDay == null || endDay == null) return null;
  return Math.max(endDay - startDay + 1, 1);
}

function worksRangeDays(works: EstimateV2Work[]): { startDay: number; endDay: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  works.forEach((work) => {
    const start = toDayIndex(work.plannedStart);
    const end = toDayIndex(work.plannedEnd);
    if (start == null || end == null) return;
    min = Math.min(min, start);
    max = Math.max(max, end);
  });

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { startDay: min, endDay: max };
}

const dayRangeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const TIMING_TOOLTIP_TEXT: Record<
  "durationPlanned" | "durationEstimated" | "daysToEnd" | "behindSchedule",
  string
> = {
  durationPlanned: "Planned calendar days between scheduled start and end dates.",
  durationEstimated: "Estimated calendar days based on current progress and velocity, if available.",
  daysToEnd: "Days remaining until scheduled end date.",
  behindSchedule: "How many days the estimated finish exceeds the planned finish.",
};

function formatDayIndex(dayIndex: number | null): string {
  if (dayIndex == null) return "—";
  return dayRangeFormatter.format(new Date(fromDayIndex(dayIndex)));
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function buildCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => {
      const normalized = cell.replace(/"/g, '""');
      if (/[",\n]/.test(normalized)) return `"${normalized}"`;
      return normalized;
    }).join(","))
    .join("\n");
}

const RESOURCE_TYPE_OPTIONS: Array<{ value: ResourceLineType; label: string }> = [
  { value: "material", label: "Material" },
  { value: "tool", label: "Tool" },
  { value: "labor", label: "Labor" },
  { value: "subcontractor", label: "Subcontractor" },
  { value: "other", label: "Other" },
];

const RESOURCE_CREATE_OPTIONS: Array<{ label: string; value: ResourceLineType }> = [
  { label: "Material", value: "material" },
  { label: "Tool", value: "tool" },
  { label: "HR", value: "labor" },
  { label: "Overheads", value: "other" },
  { label: "Subcontractor", value: "subcontractor" },
  { label: "Other", value: "other" },
];

const FOOTER_HELPER_TOOLTIP = "Review total cost, client total and VAT for the full estimate.";

const PLAN_PARTICIPANT_CAP: Record<UserPlan, number> = {
  free: 1,
  pro: 5,
  business: 15,
};

interface ClientRecipient {
  userId: string;
  name: string;
  email: string;
}

interface PendingDeleteState {
  assessment: DeleteAssessment;
  step: DeleteDialogStep;
}

function deleteEntityLabel(kind: DeleteAssessment["kind"]): string {
  if (kind === "resource") return "resource";
  if (kind === "work") return "work";
  return "stage";
}

function deleteDialogTitle(assessment: DeleteAssessment, step: DeleteDialogStep): string {
  const label = deleteEntityLabel(assessment.kind);
  if (step === "financial") return `Delete ${label} permanently?`;
  return `Delete ${label}?`;
}

function simpleDeleteDescription(assessment: DeleteAssessment): string {
  if (assessment.kind === "resource") {
    return "This resource will be removed from the estimate. This action cannot be undone.";
  }
  if (assessment.kind === "work") {
    return "This work and all resources inside it will be removed from the estimate. This action cannot be undone.";
  }
  return "This stage and all works and resources inside it will be removed from the estimate. This action cannot be undone.";
}

function workExecutionDescription(assessment: DeleteAssessment): string {
  if (assessment.kind !== "work") return "";
  if (assessment.execution.isDone) {
    return "This work is already completed. Deleting it will discard estimate context for work that has already been executed.";
  }
  if (assessment.execution.status === "in_progress") {
    return "This work is already in progress. Deleting it will discard estimate context for work that has already started.";
  }
  if (assessment.execution.status === "blocked") {
    return "This work has already started and is currently blocked. Deleting it will discard estimate context for that execution.";
  }
  return "This work has already started. Deleting it will discard estimate context for that execution.";
}

function executionDeleteDescription(assessment: DeleteAssessment): string {
  if (assessment.kind === "work") return workExecutionDescription(assessment);
  if (assessment.kind === "stage") {
    return "This stage already contains work that has started and is not Done. Review the list below before you continue.";
  }
  return simpleDeleteDescription(assessment);
}

function financialDeleteDescription(assessment: DeleteAssessment): string {
  const label = deleteEntityLabel(assessment.kind);
  return `Deleting this ${label} will remove estimate context that is already tied to ordered, stocked, or paid work and materials. This can affect financial and operational records, and the data cannot be recovered through the normal UI flow.`;
}

function pendingDeleteDescription(pendingDelete: PendingDeleteState): string {
  if (pendingDelete.step === "simple") return simpleDeleteDescription(pendingDelete.assessment);
  if (pendingDelete.step === "execution") return executionDeleteDescription(pendingDelete.assessment);
  return financialDeleteDescription(pendingDelete.assessment);
}

function pendingDeleteConfirmLabel(pendingDelete: PendingDeleteState): string {
  if (pendingDelete.step === "financial") return "Delete permanently";
  if (pendingDelete.step === "execution" && getNextDeleteStep(pendingDelete.assessment, pendingDelete.step)) {
    return "Continue";
  }
  return "Delete";
}

function procurementConsequenceLabel(
  consequence: DeleteAssessment["financial"]["procurement"][number],
): string {
  const statuses: string[] = [];
  if (consequence.orderedState === "partial") statuses.push("Partially ordered");
  if (consequence.orderedState === "full") statuses.push("Fully ordered");
  if (consequence.inStock) statuses.push("In stock");
  return statuses.join(", ");
}

function hrConsequenceLabel(
  consequence: DeleteAssessment["financial"]["hr"][number],
): string {
  return consequence.paymentState === "full" ? "Fully paid" : "Partially paid";
}

function ProjectEstimateSkeleton() {
  return (
    <div className="space-y-sp-2 p-sp-2">
      <div className="rounded-card border border-border bg-card p-sp-2 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-7 w-56 max-w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-8 w-28" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Skeleton className="h-40 rounded-card" />
          <Skeleton className="h-40 rounded-card" />
        </div>
        <Skeleton className="h-12 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    </div>
  );
}

function WorkTableFrame({ className, children }: { className?: string; children: ReactNode }) {
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [scrollState, setScrollState] = useState({
    hasOverflow: false,
    isScrolled: false,
  });

  useEffect(() => {
    const tableNode = tableRef.current;
    const container = tableNode?.parentElement as HTMLDivElement | null;
    if (!tableNode || !container) return undefined;

    const updateScrollState = () => {
      const hasOverflow = container.scrollWidth > container.clientWidth + 1;
      const isScrolled = container.scrollLeft > 0;
      setScrollState((current) => {
        if (current.hasOverflow === hasOverflow && current.isScrolled === isScrolled) {
          return current;
        }
        return { hasOverflow, isScrolled };
      });
    };

    updateScrollState();
    container.addEventListener("scroll", updateScrollState, { passive: true });
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updateScrollState)
      : null;
    resizeObserver?.observe(container);
    resizeObserver?.observe(tableNode);

    return () => {
      container.removeEventListener("scroll", updateScrollState);
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <div className="relative pl-4">
      <Table ref={tableRef} className={className}>
        {children}
      </Table>
      {scrollState.hasOverflow && !scrollState.isScrolled && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-card via-card/80 to-transparent" />
      )}
    </div>
  );
}

export default function ProjectEstimate() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pid = projectId!;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const workspaceMode = useWorkspaceMode();
  const perm = usePermission(pid);
  const hrAccess = getProjectDomainAccess(perm.seam, "hr");
  const hrReadsEnabled = projectDomainAllowsView(hrAccess);
  const { user: currentUser, isLoading: isCurrentUserLoading } = useWorkspaceCurrentUserState();
  const { project, isLoading: isProjectLoading } = useWorkspaceProjectState(pid);
  const { members, isLoading: isMembersLoading } = useWorkspaceProjectMembersState(pid);
  const projectInvites = useWorkspaceProjectInvites(pid);
  const tasks = useTasks(pid);
  const procurementItems = useProcurementV2(pid);
  const orders = useOrders(pid);
  const hrItems = useHRItems(pid, { enabled: hrReadsEnabled });
  const hrPayments = useHRPayments(pid, { enabled: hrReadsEnabled });
  const locations = useLocations(pid);

  const {
    project: estimateProject,
    stages,
    works,
    lines,
    dependencies,
    versions,
    scheduleBaseline,
    isLoading: isEstimateLoading,
  } = useEstimateV2Project(pid);

  const currentMembership = members.find((member) => member.user_id === currentUser.id) ?? null;
  const canSubmitByMembership = currentMembership?.role === "owner" || currentMembership?.role === "co_owner";
  const regime = estimateProject.regime;
  const estimateAccess = getProjectDomainAccess(perm.seam, "estimate");
  const canViewSensitiveDetail = seamCanViewSensitiveDetail(perm.seam);
  const canViewOperationalFinanceSummary = seamCanViewOperationalFinanceSummary(perm.seam);
  const canManageEstimate = projectDomainAllowsManage(estimateAccess) && regime !== "client";
  const canEditEstimate = canManageEstimate;
  const canSubmitToClient = canManageEstimate && canSubmitByMembership;
  const showEstimateInternalPricing = canViewSensitiveDetail && regime !== "client";
  const showEstimateMarkup = canViewSensitiveDetail && regime === "contractor";

  const [activeTab, setActiveTab] = useState("estimate");
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>([]);
  const [shareLinkModalState, setShareLinkModalState] = useState<{
    title: string;
    description: string;
    link: string;
    suggestUpgrade: boolean;
  } | null>(null);
  const [missingDatesWorkIds, setMissingDatesWorkIds] = useState<string[]>([]);
  const [incompleteTaskBlocks, setIncompleteTaskBlocks] = useState<Array<{ taskId: string | null; title: string }>>([]);
  const [bulkFinishedTasks, setBulkFinishedTasks] = useState<Task[] | null>(null);
  const [collapsedStageIds, setCollapsedStageIds] = useState<Set<string>>(new Set());
  const estimateHasSavedContent = stages.length > 0 || works.length > 0 || lines.length > 0 || versions.length > 0;
  const [estimateEditorStarted, setEstimateEditorStarted] = useState(estimateHasSavedContent);
  const previousProjectIdRef = useRef(pid);
  const [pendingStageTitleEditId, setPendingStageTitleEditId] = useState<string | null>(null);
  const [pendingWorkTitleEditId, setPendingWorkTitleEditId] = useState<string | null>(null);
  const [pendingLineTitleEditId, setPendingLineTitleEditId] = useState<string | null>(null);
  const [detailedCostOverviewOpen, setDetailedCostOverviewOpen] = useState(false);
  const [financialResourcesExpanded, setFinancialResourcesExpanded] = useState(false);
  const [customUnitDraftByLineId, setCustomUnitDraftByLineId] = useState<Record<string, string>>({});
  const [customUnitInputLineIds, setCustomUnitInputLineIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteState | null>(null);
  const suppressResourceCreateAutoFocusRef = useRef(false);
  const pendingDeleteNextStepRef = useRef<DeleteDialogStep | null>(null);

  useEffect(() => {
    if (!estimateHasSavedContent) return;
    setEstimateEditorStarted(true);
  }, [estimateHasSavedContent]);

  useEffect(() => {
    if (previousProjectIdRef.current === pid) return;
    previousProjectIdRef.current = pid;
    setEstimateEditorStarted(estimateHasSavedContent);
  }, [estimateHasSavedContent, pid]);

  useEffect(() => {
    if (!pendingStageTitleEditId) return;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setPendingStageTitleEditId(null);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [pendingStageTitleEditId]);

  useEffect(() => {
    if (!pendingWorkTitleEditId) return;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setPendingWorkTitleEditId(null);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [pendingWorkTitleEditId]);

  useEffect(() => {
    if (!pendingLineTitleEditId) return;
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setPendingLineTitleEditId(null);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [pendingLineTitleEditId]);

  useLayoutEffect(() => {
    if (!pid) return undefined;

    if (workspaceMode.kind === "supabase" && project?.owner_id && currentUser.id) {
      registerEstimateV2ProjectAccessContext(pid, {
        mode: "supabase",
        profileId: workspaceMode.profileId,
        projectOwnerProfileId: project.owner_id,
        membershipRole: currentMembership?.role ?? null,
        financeVisibility: currentMembership?.finance_visibility ?? null,
      });
      return () => {
        clearEstimateV2ProjectAccessContext(pid);
      };
    }

    if (workspaceMode.kind === "demo" || workspaceMode.kind === "local") {
      registerEstimateV2ProjectAccessContext(pid, {
        mode: workspaceMode.kind,
        profileId: currentUser.id || undefined,
        projectOwnerProfileId: project?.owner_id,
        membershipRole: currentMembership?.role ?? null,
        financeVisibility: currentMembership?.finance_visibility ?? null,
      });
      return () => {
        clearEstimateV2ProjectAccessContext(pid);
      };
    }

    clearEstimateV2ProjectAccessContext(pid);
    return undefined;
  }, [
    currentMembership?.finance_visibility,
    currentMembership?.role,
    currentUser.id,
    pid,
    project?.owner_id,
    workspaceMode.kind,
    workspaceMode.kind === "supabase" ? workspaceMode.profileId : null,
  ]);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages],
  );

  const worksByStage = useMemo(() => {
    const map = new Map<string, EstimateV2Work[]>();
    works.forEach((work) => {
      const list = map.get(work.stageId) ?? [];
      list.push(work);
      map.set(work.stageId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.order - b.order));
    return map;
  }, [works]);

  const linesByWork = useMemo(() => {
    const map = new Map<string, EstimateV2ResourceLine[]>();
    lines.forEach((line) => {
      const list = map.get(line.workId) ?? [];
      list.push(line);
      map.set(line.workId, list);
    });
    return map;
  }, [lines]);

  const checklistFallbackRowsByWork = useMemo(() => {
    const map = new Map<string, ChecklistFallbackEstimateRow[]>();

    tasks.forEach((task) => {
      const taskAssignee = resolveTaskAssignee(task);

      task.checklist.forEach((item, index) => {
        const workId = item.estimateV2WorkId ?? task.estimateV2WorkId ?? null;
        if (!workId) return;

        const type = resolveChecklistFallbackRowType(task, index);
        if (!type) return;

        const list = map.get(workId) ?? [];
        list.push({
          id: item.estimateV2LineId ?? `checklist-${task.id}-${item.id}`,
          workId,
          title: item.text || "Checklist item",
          type,
          typeLabel: resolveChecklistFallbackRowLabel(task, index),
          qtyMilli: Number.isFinite(item.estimateV2QtyMilli)
            ? Math.max(1, Math.round(item.estimateV2QtyMilli as number))
            : null,
          unit: item.estimateV2Unit?.trim() || null,
          assigneeId: taskAssignee.assigneeId,
          assigneeName: taskAssignee.assigneeName,
          assigneeEmail: taskAssignee.assigneeEmail,
        });
        map.set(workId, list);
      });
    });

    return map;
  }, [tasks]);

  const hierarchyNumbers = useMemo(
    () => buildHierarchyNumbers(sortedStages, worksByStage),
    [sortedStages, worksByStage],
  );

  const participantOptions = useMemo(() => (
    members
      .map((member) => {
        const participant = getUserById(member.user_id);
        if (!participant) return null;
        return {
          id: participant.id,
          name: participant.name,
          email: participant.email,
        };
      })
      .filter((entry): entry is { id: string; name: string; email: string } => Boolean(entry))
  ), [members]);
  const memberEmailSet = useMemo(
    () => new Set(participantOptions.map((participant) => participant.email.toLowerCase()).filter(Boolean)),
    [participantOptions],
  );
  const pendingInviteEmailSet = useMemo(
    () => new Set(projectInvites.filter((invite) => invite.status === "pending").map((invite) => invite.email.toLowerCase())),
    [projectInvites],
  );
  const pendingInviteOptions = useMemo(() => (
    projectInvites
      .filter((invite) => invite.status === "pending")
      .map((invite) => ({
        id: invite.id,
        email: invite.email,
      }))
  ), [projectInvites]);
  const projectMode = project?.project_mode === "build_myself" ? "build_myself" : "contractor";

  const handleAssigneeInvite = useCallback(async (identity: { name: string; email: string }) => {
    if (!canEditEstimate) return;
    if (workspaceMode.kind === "pending-supabase") {
      toast({
        title: "Invite unavailable",
        description: "Wait for workspace sync to complete, then try again.",
        variant: "destructive",
      });
      return;
    }
    if (!currentUser.id) {
      toast({ title: "Unable to create invite", description: "Current user is unavailable.", variant: "destructive" });
      return;
    }

    const normalizedEmail = identity.email.trim().toLowerCase();
    if (memberEmailSet.has(normalizedEmail)) {
      toast({
        title: "Already a participant",
        description: `${normalizedEmail} already has project access.`,
      });
      return;
    }
    if (pendingInviteEmailSet.has(normalizedEmail)) {
      toast({
        title: "Invite already pending",
        description: `An invite for ${normalizedEmail} already exists.`,
      });
      return;
    }

    try {
      const createdInvite = await createWorkspaceProjectInvite(workspaceMode, {
        projectId: pid,
        email: normalizedEmail,
        role: "contractor",
        aiAccess: "consult_only",
        viewerRegime: projectMode === "build_myself" ? "build_myself" : null,
        creditLimit: 50,
        invitedBy: currentUser.id,
        financeVisibility: getDefaultFinanceVisibility("contractor"),
      });

      if (workspaceMode.kind === "supabase") {
        try {
          const delivery = await sendWorkspaceProjectInviteEmail(workspaceMode, createdInvite.id);
          if (delivery.kind === "sent") {
            toast({
              title: "Invite sent",
              description: `Invitation email sent to ${delivery.payload.recipientEmail || normalizedEmail} for ${identity.name}.`,
            });
          } else {
            toast({
              title: "Invite created",
              description: `Pending invite created for ${identity.name} (${normalizedEmail}).`,
            });
          }
        } catch (sendErr) {
          const message = sendErr instanceof Error ? sendErr.message : "Unable to send invite email";
          toast({
            title: "Invite created, email not sent",
            description: message,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Invite created",
          description: `Pending invite created for ${identity.name} (${normalizedEmail}).`,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to create invite";
      toast({
        title: "Invite failed",
        description: message,
        variant: "destructive",
      });
    }
  }, [canEditEstimate, currentUser.id, memberEmailSet, pendingInviteEmailSet, pid, projectMode, toast, workspaceMode]);

  const clientRecipients = useMemo<ClientRecipient[]>(() => (
    members
      .filter((member) => member.role === "viewer" && member.viewer_regime === "client")
      .map((member) => {
        const user = getUserById(member.user_id);
        if (!user?.email) return null;
        return {
          userId: member.user_id,
          name: user.name,
          email: user.email,
        };
      })
      .filter((entry): entry is ClientRecipient => Boolean(entry))
  ), [members]);

  const ownerPlan = useMemo<UserPlan>(() => {
    if (!project?.owner_id) return currentUser.plan;
    const owner = getUserById(project.owner_id);
    return owner?.plan ?? currentUser.plan;
  }, [currentUser.plan, project?.owner_id]);
  const participantLimit = PLAN_PARTICIPANT_CAP[ownerPlan];
  const availableParticipantSlots = Math.max(participantLimit - members.length, 0);

  const workById = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);
  const deleteGuardSource = useMemo(() => ({
    projectId: pid,
    stages,
    works,
    lines,
    tasks,
    procurementItems,
    orders,
    hrItems,
    hrPayments,
    locations,
  }), [pid, stages, works, lines, tasks, procurementItems, orders, hrItems, hrPayments, locations]);

  const latestApproved = useMemo(() => (
    versions
      .filter((version) => version.submitted && version.status === "approved")
      .sort((a, b) => b.number - a.number)[0] ?? null
  ), [versions]);

  const latestProposed = useMemo(() => (
    versions
      .filter((version) => version.submitted && version.status === "proposed" && !version.archived)
      .sort((a, b) => b.number - a.number)[0] ?? null
  ), [versions]);

  const pendingProposed = Boolean(
    latestProposed
    && (!latestApproved || latestProposed.number > latestApproved.number),
  );

  const currentVersionSnapshot = useMemo(() => ({
    project: { ...estimateProject },
    stages: stages.map((stage) => ({ ...stage })),
    works: works.map((work) => ({ ...work })),
    lines: lines.map((line) => ({ ...line })),
    dependencies: dependencies.map((dependency) => ({ ...dependency })),
  }), [dependencies, estimateProject, lines, stages, works]);

  const hasPendingChangesSinceSubmission = useMemo(() => {
    if (!pendingProposed || !latestProposed) return true;
    const nextVersionLike: EstimateV2Version = {
      ...latestProposed,
      snapshot: currentVersionSnapshot,
    };
    return computeVersionDiff(latestProposed, nextVersionLike).changes.length > 0;
  }, [currentVersionSnapshot, latestProposed, pendingProposed]);

  const submitState = useMemo(
    () => resolveSubmitToClientState({
      hasPendingSubmittedVersion: pendingProposed,
      hasChangesSincePendingSubmission: hasPendingChangesSinceSubmission,
    }),
    [hasPendingChangesSinceSubmission, pendingProposed],
  );

  const diff = useMemo(
    () => (latestProposed ? computeVersionDiff(latestApproved, latestProposed) : {
      stageChanges: [],
      workChanges: [],
      lineChanges: [],
      changedStageIds: [],
      changedWorkIds: [],
      changedLineIds: [],
      changes: [],
    }),
    [latestApproved, latestProposed],
  );

  const changedLineIds = useMemo(() => new Set(diff.changedLineIds), [diff.changedLineIds]);

  const stageById = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages]);
  const lineById = useMemo(() => new Map(lines.map((line) => [line.id, line])), [lines]);

  const lineTotalsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeLineTotals>>();
    lines.forEach((line) => {
      const stage = stageById.get(line.stageId);
      if (!stage) return;
      map.set(line.id, computeLineTotals(line, stage, estimateProject, regime));
    });
    return map;
  }, [estimateProject, lines, regime, stageById]);

  const hasSummaryClientPricingOnAnyLine = useMemo(() => (
    lines.some((line) => (
      typeof line.summaryClientUnitCents === "number" && Number.isFinite(line.summaryClientUnitCents)
      && typeof line.summaryClientTotalCents === "number" && Number.isFinite(line.summaryClientTotalCents)
    ))
  ), [lines]);

  const totals = useMemo(
    () => computeProjectTotals(estimateProject, stages, works, lines, regime),
    [estimateProject, stages, works, lines, regime],
  );

  const stageTotalsById = useMemo(
    () => new Map(
      computeStageTotals(estimateProject, stages, lines, regime).map((item) => [item.stageId, item]),
    ),
    [estimateProject, stages, lines, regime],
  );

  const plannedRollups = useMemo(
    () => computePlannedFromEstimateV2({
      project: estimateProject,
      stages,
      lines,
    }),
    [estimateProject, stages, lines],
  );

  const factRollups = useMemo(
    () => computeFactFromDataSources({
      procurementItems,
      orders,
      hrItems,
      hrPayments,
    }),
    [procurementItems, orders, hrItems, hrPayments],
  );

  const incompleteLinkedTaskCount = useMemo(() => {
    const taskById = new Map(tasks.map((task) => [task.id, task]));
    return works.reduce((count, work) => {
      if (!work.taskId) return count;
      const task = taskById.get(work.taskId);
      if (!task) return count + 1;
      return task.status === "done" ? count : count + 1;
    }, 0);
  }, [tasks, works]);

  const combinedPlanFact = useMemo(
    () => combinePlanFact(
      plannedRollups,
      factRollups,
      scheduleBaseline,
      { unfinishedTaskCount: incompleteLinkedTaskCount },
    ),
    [plannedRollups, factRollups, scheduleBaseline, incompleteLinkedTaskCount],
  );
  const isInWork = estimateProject.estimateStatus === "in_work";

  const hasActualFinancialData = useMemo(
    () => (
      hrPayments.length > 0
      || orders.some((order) => (
        order.kind === "supplier"
        && (order.status === "placed" || order.status === "received")
        && order.lines.length > 0
      ))
    ),
    [hrPayments.length, orders],
  );

  const resourcesTotalCents = useMemo(
    () => totals.breakdownByType.material
      + totals.breakdownByType.tool
      + totals.breakdownByType.labor
      + totals.breakdownByType.subcontractor
      + totals.breakdownByType.other,
    [totals.breakdownByType],
  );

  const todayDay = toDayIndex(new Date());
  const currentRange = useMemo(() => worksRangeDays(works), [works]);
  const baselineRange = useMemo(() => {
    if (!scheduleBaseline?.projectBaselineStart || !scheduleBaseline.projectBaselineEnd) return null;
    const startDay = toDayIndex(scheduleBaseline.projectBaselineStart);
    const endDay = toDayIndex(scheduleBaseline.projectBaselineEnd);
    if (startDay == null || endDay == null) return null;
    return { startDay, endDay };
  }, [scheduleBaseline]);

  const planningRangeLabel = useMemo(() => {
    if (!currentRange) return "—";
    return `${formatDayIndex(currentRange.startDay)} → ${formatDayIndex(currentRange.endDay)}`;
  }, [currentRange]);

  const planningDurationDays = useMemo(
    () => durationDays(currentRange?.startDay ?? null, currentRange?.endDay ?? null),
    [currentRange],
  );

  const revenueExVatCents = totals.taxableBaseCents;
  const costExVatCents = totals.costTotalCents;
  const profitExVatCents = revenueExVatCents - costExVatCents;
  const profitabilityPct = revenueExVatCents > 0
    ? (profitExVatCents / revenueExVatCents) * 100
    : null;

  const timingMetrics = useMemo(() => {
    if (estimateProject.estimateStatus === "planning") {
      const plannedDuration = durationDays(currentRange?.startDay ?? null, currentRange?.endDay ?? null);
      const daysToEnd = currentRange && todayDay != null
        ? Math.max(0, currentRange.endDay - todayDay)
        : null;
      return {
        durationPlannedDays: plannedDuration,
        durationEstimatedDays: null,
        daysToEnd,
        behindScheduleDays: 0,
      };
    }

    const plannedDuration = durationDays(baselineRange?.startDay ?? null, baselineRange?.endDay ?? null);
    const estimatedDuration = durationDays(currentRange?.startDay ?? null, currentRange?.endDay ?? null);
    const targetEnd = currentRange?.endDay ?? baselineRange?.endDay ?? null;
    const daysToEnd = targetEnd != null && todayDay != null
      ? Math.max(0, targetEnd - todayDay)
      : null;
    const behindScheduleDays = baselineRange && todayDay != null && incompleteLinkedTaskCount > 0 && todayDay > baselineRange.endDay
      ? todayDay - baselineRange.endDay
      : 0;

    return {
      durationPlannedDays: plannedDuration,
      durationEstimatedDays: estimatedDuration,
      daysToEnd,
      behindScheduleDays,
    };
  }, [baselineRange, currentRange, estimateProject.estimateStatus, incompleteLinkedTaskCount, todayDay]);

  const ctaState = resolveProjectEstimateCtaState({
    regime,
    isOwner: canSubmitToClient,
    hasProposedVersion: Boolean(latestProposed),
  });
  const showEstimateWorkspace = estimateEditorStarted || estimateHasSavedContent;
  const reviewExpandedByDefault = regime === "client" && !canManageEstimate;
  const approvedVersionWithStamp = latestApproved?.approvalStamp ? latestApproved : null;
  const latestVersionNumber = useMemo(
    () => versions.reduce((max, version) => Math.max(max, version.number), 1),
    [versions],
  );
  const latestVersionApproved = Boolean(
    latestApproved
    && (!latestProposed || latestApproved.number >= latestProposed.number),
  );
  const financialBreakdownTypeRows = [
    { label: "Material cost", amountCents: totals.breakdownByType.material },
    { label: "Tool cost", amountCents: totals.breakdownByType.tool },
    { label: "Labor cost", amountCents: totals.breakdownByType.labor },
    { label: "Subcontractor cost", amountCents: totals.breakdownByType.subcontractor },
    { label: "Other cost", amountCents: totals.breakdownByType.other },
  ];
  const financialBreakdownSummaryRows = [
    { label: "Markup", amountCents: totals.markupTotalCents },
    { label: "Subtotal (ex VAT)", amountCents: totals.subtotalBeforeDiscountCents },
    { label: "Discount", amountCents: totals.discountTotalCents },
    { label: "VAT amount", amountCents: totals.taxAmountCents },
    { label: "Total (inc VAT)", amountCents: totals.totalCents, emphasized: true },
  ];
  const planVsActualRows = (["material", "tool", "labor", "subcontractor", "other"] as const).map((type) => ({
    label: labelForType(type),
    planned: money(combinedPlanFact.planned.plannedCostByTypeCents[type], estimateProject.currency),
    actual: hasActualFinancialData ? money(combinedPlanFact.fact.spentByTypeCents[type], estimateProject.currency) : "—",
  }));

  useEffect(() => {
    if (estimateProject.estimateStatus === "in_work") return;
    setDetailedCostOverviewOpen(false);
  }, [estimateProject.estimateStatus]);

  useEffect(() => {
    if (canViewSensitiveDetail) return;
    setDetailedCostOverviewOpen(false);
    setFinancialResourcesExpanded(false);
  }, [canViewSensitiveDetail]);

  const handleEstimateStatusChange = async (
    nextStatus: EstimateExecutionStatus,
    options?: { skipSetup?: boolean; projectTasks?: Task[] },
  ) => {
    if (!canEditEstimate) return;
    if (nextStatus === estimateProject.estimateStatus && !options?.skipSetup) return;

    if (
      workspaceMode.kind === "supabase"
      && nextStatus === "in_work"
    ) {
      const result = await transitionEstimateV2ProjectToInWork(pid, {
        ...options,
        ownerProfileId: workspaceMode.profileId,
      });
      if (!result.ok) {
        if (result.reason === "missing_work_dates") {
          setMissingDatesWorkIds(result.missingWorkIds ?? []);
          return;
        }

        if (result.reason === "transition_failed" || result.reason === "transition_blocked") {
          toast({
            title: result.blocking ? "Transition blocked" : "Status update failed",
            description: result.errorMessage ?? "The transition did not complete and must be retried.",
            variant: "destructive",
          });
          return;
        }

        toast({ title: "Only project owner can change status", variant: "destructive" });
        return;
      }

      setMissingDatesWorkIds([]);
      setIncompleteTaskBlocks([]);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: planningQueryKeys.projectStages(workspaceMode.profileId, pid),
        }),
        queryClient.invalidateQueries({
          queryKey: planningQueryKeys.projectTasks(workspaceMode.profileId, pid),
        }),
        queryClient.invalidateQueries({
          queryKey: procurementProjectItemsQueryRoot(workspaceMode.profileId, pid),
        }),
        queryClient.invalidateQueries({
          queryKey: hrQueryKeys.projectItems(workspaceMode.profileId, pid),
        }),
        queryClient.invalidateQueries({
          queryKey: activityQueryKeys.projectEvents(workspaceMode.profileId, pid),
        }),
      ]);

      if (result.autoScheduled) {
        toast({ title: "Status updated", description: "Missing work dates were auto-scheduled." });
        return;
      }

      toast({ title: "Status updated" });
      return;
    }

    const result = setProjectEstimateStatus(
      pid,
      nextStatus,
      workspaceMode.kind === "supabase"
        ? {
          ...options,
          ownerProfileId: workspaceMode.profileId,
          projectOwnerProfileId: project?.owner_id,
        }
        : options,
    );
    if (!result.ok) {
      if (result.reason === "missing_work_dates") {
        setMissingDatesWorkIds(result.missingWorkIds ?? []);
        return;
      }
      if (result.reason === "incomplete_tasks") {
        setIncompleteTaskBlocks(result.incompleteTasks ?? []);
        return;
      }
      toast({ title: "Only project owner can change status", variant: "destructive" });
      return;
    }

    setMissingDatesWorkIds([]);
    setIncompleteTaskBlocks([]);

    if (result.autoScheduled) {
      toast({ title: "Status updated", description: "Missing work dates were auto-scheduled." });
      return;
    }
    toast({ title: "Status updated" });
  };

  const handleSkipSetup = async () => {
    await handleEstimateStatusChange("in_work", { skipSetup: true });
  };

  const handleGoToWorkLog = () => {
    setIncompleteTaskBlocks([]);
    navigate(`/project/${pid}/tasks`);
  };

  const handleMarkAllTasksDone = useCallback(async () => {
    if (!canEditEstimate) return;

    const incompleteTasks = tasks.filter((task) => task.status !== "done");
    if (incompleteTasks.length === 0) {
      setIncompleteTaskBlocks([]);
      setBulkFinishedTasks(tasks);
      return;
    }

    try {
      const source = await getPlanningSource(
        workspaceMode.kind === "pending-supabase" ? undefined : workspaceMode,
      );
      const updatedTasks = await Promise.all(
        incompleteTasks.map((task) => source.updateProjectTask(task.id, { status: "done" })),
      );
      const updatedTaskById = new Map(updatedTasks.map((task) => [task.id, task]));
      const nextTasks = tasks.map((task) => updatedTaskById.get(task.id) ?? task);

      if (workspaceMode.kind === "supabase") {
        await queryClient.invalidateQueries({
          queryKey: planningQueryKeys.projectTasks(workspaceMode.profileId, pid),
        });
      }

      setIncompleteTaskBlocks([]);
      setBulkFinishedTasks(nextTasks);
      toast({ title: "All project tasks marked done" });
    } catch (error) {
      toast({
        title: "Unable to mark all tasks done",
        description: error instanceof Error ? error.message : "Retry the action.",
        variant: "destructive",
      });
    }
  }, [canEditEstimate, pid, queryClient, tasks, toast, workspaceMode]);

  const handleConfirmFinishAfterBulkDone = useCallback(async () => {
    if (!bulkFinishedTasks) return;
    await handleEstimateStatusChange("finished", { projectTasks: bulkFinishedTasks });
    setBulkFinishedTasks(null);
  }, [bulkFinishedTasks, handleEstimateStatusChange]);

  const handleTabChange = (nextTab: string) => {
    if (!showEstimateWorkspace && nextTab !== "estimate") return;
    if (nextTab === "work_log") {
      navigate(`/project/${pid}/tasks`);
      return;
    }
    setActiveTab(nextTab);
  };

  const buildShareLink = useCallback((shareId: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/share/estimate/${shareId}`;
  }, []);

  const copyShareLink = useCallback(async (link: string) => {
    if (!navigator.clipboard?.writeText) {
      toast({ title: "Copy failed", description: "Clipboard is unavailable.", variant: "destructive" });
      return false;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Share link copied" });
      return true;
    } catch {
      toast({ title: "Copy failed", description: "Clipboard is unavailable.", variant: "destructive" });
      return false;
    }
  }, [toast]);

  const submitToClientRecipients = useCallback((recipients: ClientRecipient[]) => {
    if (!canSubmitToClient) return;
    if (submitState.submitDisabled) {
      toast({ title: submitState.submitDisabledReason ?? "No changes since last submission", variant: "destructive" });
      return;
    }

    const hasDirectRecipients = recipients.length > 0;
    const previewOnly = !hasDirectRecipients && availableParticipantSlots === 0;
    const submitOptions = previewOnly
      ? {
        shareApprovalPolicy: "disabled" as const,
        shareApprovalDisabledReason: "no_participant_slot" as const,
      }
      : {
        shareApprovalPolicy: "registered" as const,
      };

    let ok = false;
    let shareId = "";

    if (pendingProposed && latestProposed) {
      ok = refreshVersionSnapshot(pid, latestProposed.id, currentUser.id, submitOptions);
      shareId = latestProposed.shareId;
    } else {
      const snapshot = createVersionSnapshot(pid, currentUser.id);
      ok = submitVersion(pid, snapshot.versionId, submitOptions);
      shareId = snapshot.shareId;
    }

    if (!ok) {
      toast({ title: "Only owner or co-owner can submit versions", variant: "destructive" });
      return;
    }

    if (hasDirectRecipients) {
      const recipientEmails = recipients.map((recipient) => recipient.email).join(", ");
      toast({
        title: pendingProposed && latestProposed ? "Estimate resubmitted to client" : "Estimate submitted to client",
        description: recipientEmails,
      });
      return;
    }

    const shareLink = buildShareLink(shareId);
    void copyShareLink(shareLink);
    if (previewOnly) {
      setShareLinkModalState({
        title: "Client not added and no participant slots",
        description: "Client can preview this estimate via link. Approval is disabled until you upgrade the plan and add client as participant.",
        link: shareLink,
        suggestUpgrade: true,
      });
      return;
    }
    setShareLinkModalState({
      title: "Client not added",
      description: "Share this link with client. They can preview without registration and register in app to approve.",
      link: shareLink,
      suggestUpgrade: false,
    });
  }, [
    availableParticipantSlots,
    buildShareLink,
    canSubmitToClient,
    copyShareLink,
    currentUser.id,
    latestProposed,
    pendingProposed,
    pid,
    submitState.submitDisabled,
    submitState.submitDisabledReason,
    toast,
  ]);

  const handleSubmitToClient = () => {
    if (!canSubmitToClient) return;
    if (clientRecipients.length > 1) {
      setSelectedRecipientIds([]);
      setRecipientPickerOpen(true);
      return;
    }
    submitToClientRecipients(clientRecipients);
  };

  const handleSubmitToSelectedRecipients = () => {
    const selectedRecipients = clientRecipients.filter((recipient) => selectedRecipientIds.includes(recipient.userId));
    if (selectedRecipients.length === 0) {
      toast({ title: "Select at least one client recipient", variant: "destructive" });
      return;
    }
    setRecipientPickerOpen(false);
    submitToClientRecipients(selectedRecipients);
  };

  const handleCopyShareLink = () => {
    if (!shareLinkModalState?.link) return;
    void copyShareLink(shareLinkModalState.link);
  };

  const handleProjectApprove = (stamp: ApprovalStamp) => {
    if (!latestProposed) return;
    const ok = approveVersion(pid, latestProposed.id, stamp, { actorId: currentUser.id });
    if (!ok) {
      toast({ title: "Unable to approve version", variant: "destructive" });
      return;
    }
    setApprovalModalOpen(false);
    toast({ title: "Approved" });
  };

  const handleAskQuestions = () => {
    if (!latestProposed) return;
    addEvent({
      id: `evt-estimate-question-${Date.now()}`,
      project_id: pid,
      actor_id: currentUser.id,
      type: "comment_added",
      object_type: "estimate_version",
      object_id: latestProposed.id,
      timestamp: new Date().toISOString(),
      payload: { text: "Client asked a question about estimate changes" },
    });
    toast({ title: "Question sent" });
  };

  const handleExportCsv = () => {
    const rows: string[][] = [];
    rows.push(["Estimate v2 export"]);
    rows.push(["Project", estimateProject.title]);
    rows.push(["Regime", regime]);
    rows.push([]);

    const summaryFinancialExport = !canViewSensitiveDetail
      && canViewOperationalFinanceSummary
      && hasSummaryClientPricingOnAnyLine;
    const requireSummaryRpcForExport = canViewOperationalFinanceSummary && !canViewSensitiveDetail;

    if (!canViewSensitiveDetail && !summaryFinancialExport) {
      rows.push(["Stage", "Work", "Line", "Qty", "Unit"]);
    } else if (!canViewSensitiveDetail && summaryFinancialExport) {
      rows.push(["Stage", "Work", "Line", "Qty", "Unit", "Client unit", "Client total"]);
    } else if (regime === "client") {
      rows.push(["Stage", "Work", "Line", "Qty", "Unit", "Client unit", "Client total"]);
    } else if (regime === "contractor") {
      rows.push(["Stage", "Work", "Line", "Type", "Qty", "Unit", "Cost unit", "Cost total", "Markup %", "Discount %", "Client unit", "Client total"]);
    } else if (regime === "build_myself") {
      rows.push(["Stage", "Work", "Line", "Type", "Qty", "Unit", "Cost unit", "Cost total", "Discount %", "Client unit", "Client total"]);
    }

    sortedStages.forEach((stage) => {
      const stageWorks = worksByStage.get(stage.id) ?? [];
      stageWorks.forEach((work) => {
        const workLines = linesByWork.get(work.id) ?? [];
        workLines.forEach((line) => {
          const lineTotals = lineTotalsById.get(line.id);
          if (!lineTotals) return;

          if (!canViewSensitiveDetail) {
            if (summaryFinancialExport) {
              const clientMoney = displayLineClientAmounts(line, lineTotals, { requireSummaryRpc: requireSummaryRpcForExport });
              rows.push([
                stage.title,
                work.title,
                line.title,
                qtyFromMilli(line.qtyMilli),
                line.unit,
                clientMoney ? money(clientMoney.clientUnitCents, estimateProject.currency) : "—",
                clientMoney ? money(clientMoney.clientTotalCents, estimateProject.currency) : "—",
              ]);
              return;
            }
            rows.push([
              stage.title,
              work.title,
              line.title,
              qtyFromMilli(line.qtyMilli),
              line.unit,
            ]);
            return;
          }

          const clientForCsv = displayLineClientAmounts(line, lineTotals)
            ?? { clientUnitCents: lineTotals.clientUnitCents, clientTotalCents: lineTotals.clientTotalCents };
          const clientUnitStr = money(clientForCsv.clientUnitCents, estimateProject.currency);
          const clientTotalStr = money(clientForCsv.clientTotalCents, estimateProject.currency);

          if (regime === "client") {
            rows.push([
              stage.title,
              work.title,
              line.title,
              qtyFromMilli(line.qtyMilli),
              line.unit,
              clientUnitStr,
              clientTotalStr,
            ]);
            return;
          }

          if (regime === "contractor") {
            rows.push([
              stage.title,
              work.title,
              line.title,
              labelForType(line.type),
              qtyFromMilli(line.qtyMilli),
              line.unit,
              money(line.costUnitCents, estimateProject.currency),
              money(lineTotals.costTotalCents, estimateProject.currency),
              fromBpsToPercent(line.markupBps),
              fromBpsToPercent(effectiveDiscountForDisplay(line, stage, estimateProject.discountBps)),
              clientUnitStr,
              clientTotalStr,
            ]);
            return;
          }

          rows.push([
            stage.title,
            work.title,
            line.title,
            labelForType(line.type),
            qtyFromMilli(line.qtyMilli),
            line.unit,
            money(line.costUnitCents, estimateProject.currency),
            money(lineTotals.costTotalCents, estimateProject.currency),
            fromBpsToPercent(effectiveDiscountForDisplay(line, stage, estimateProject.discountBps)),
            clientUnitStr,
            clientTotalStr,
          ]);
        });
      });
    });

    rows.push([]);
    if (canViewSensitiveDetail) {
      rows.push(["Subtotal (ex VAT)", money(totals.subtotalBeforeDiscountCents, estimateProject.currency)]);
      rows.push(["Discount", money(totals.discountTotalCents, estimateProject.currency)]);
      rows.push(["Taxable base (ex VAT)", money(totals.taxableBaseCents, estimateProject.currency)]);
    }
    rows.push(["Tax", `${(estimateProject.taxBps / 100).toFixed(2)}%`]);
    rows.push(["Tax amount", money(totals.taxAmountCents, estimateProject.currency)]);
    rows.push(["Total (inc VAT)", money(totals.totalCents, estimateProject.currency)]);

    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `estimate-v2-${pid}-${canViewSensitiveDetail ? regime : "operational"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: "Estimate export generated" });
  };

  const toggleStageCollapsed = (stageId: string) => {
    setCollapsedStageIds((current) => {
      const next = new Set(current);
      if (next.has(stageId)) {
        next.delete(stageId);
        return next;
      }
      next.add(stageId);
      return next;
    });
  };

  const handleStartEstimate = () => {
    setEstimateEditorStarted(true);
    setActiveTab("estimate");
  };

  const handleCreateStage = () => {
    const created = createStage(pid, { title: "Add stage" });
    if (!created) return;
    trackEvent("estimate_stage_created", { project_id: pid });
    setPendingStageTitleEditId(created.id);
  };

  const handleCreateWork = (stageId: string) => {
    const created = createWork(pid, { stageId, title: "Add work" });
    if (!created) return;
    trackEvent("estimate_work_created", { project_id: pid, stage_id: stageId });
    setPendingWorkTitleEditId(created.id);
  };

  const handleCreateResourceLine = (
    stageId: string,
    workId: string,
    option: { value: ResourceLineType },
  ) => {
    suppressResourceCreateAutoFocusRef.current = true;
    const created = createLine(pid, {
      stageId,
      workId,
      title: "Add resource",
      type: option.value,
      qtyMilli: 1_000,
      costUnitCents: 0,
    });
    if (!created) {
      suppressResourceCreateAutoFocusRef.current = false;
      return;
    }
    trackEvent("estimate_line_created", { project_id: pid, stage_id: stageId, work_id: workId, resource_type: option.value });
    window.requestAnimationFrame(() => {
      setPendingLineTitleEditId(created.id);
    });
  };

  const openCustomUnitInput = (lineId: string, currentUnit: string) => {
    setCustomUnitInputLineIds((current) => {
      const next = new Set(current);
      next.add(lineId);
      return next;
    });
    setCustomUnitDraftByLineId((current) => ({
      ...current,
      [lineId]: current[lineId] ?? (currentUnit.trim() || "other"),
    }));
  };

  const closeCustomUnitInput = (lineId: string) => {
    setCustomUnitInputLineIds((current) => {
      if (!current.has(lineId)) return current;
      const next = new Set(current);
      next.delete(lineId);
      return next;
    });
  };

  const commitCustomUnit = (line: EstimateV2ResourceLine) => {
    const nextUnit = (customUnitDraftByLineId[line.id] ?? "").trim();
    if (!nextUnit) {
      closeCustomUnitInput(line.id);
      return;
    }
    if (nextUnit !== line.unit) {
      updateLine(pid, line.id, { unit: nextUnit });
    }
    closeCustomUnitInput(line.id);
  };

  const handlePendingDeleteOpenChange = (open: boolean) => {
    if (open) return;
    const nextStep = pendingDeleteNextStepRef.current;
    pendingDeleteNextStepRef.current = null;
    if (nextStep) {
      setPendingDelete((current) => {
        if (!current) return current;
        return {
          ...current,
          step: nextStep,
        };
      });
      return;
    }
    setPendingDelete(null);
  };

  const openResourceDelete = (lineId: string) => {
    const line = lineById.get(lineId);
    if (!line) return;
    const assessment = assessResourceDelete(line, deleteGuardSource);
    setPendingDelete({
      assessment,
      step: assessment.initialStep,
    });
  };

  const openWorkDelete = (workId: string) => {
    const work = workById.get(workId);
    if (!work) return;
    const assessment = assessWorkDelete(work, deleteGuardSource);
    setPendingDelete({
      assessment,
      step: assessment.initialStep,
    });
  };

  const openStageDelete = (stageId: string) => {
    const stage = stageById.get(stageId);
    if (!stage) return;
    const assessment = assessStageDelete(stage, deleteGuardSource);
    setPendingDelete({
      assessment,
      step: assessment.initialStep,
    });
  };

  const confirmPendingDelete = () => {
    if (!pendingDelete) return;
    const nextStep = getNextDeleteStep(pendingDelete.assessment, pendingDelete.step);
    if (nextStep) {
      pendingDeleteNextStepRef.current = nextStep;
      return;
    }

    if (pendingDelete.assessment.kind === "resource") {
      deleteLine(pid, pendingDelete.assessment.entityId);
      return;
    }
    if (pendingDelete.assessment.kind === "work") {
      deleteWork(pid, pendingDelete.assessment.entityId);
      return;
    }
    deleteStage(pid, pendingDelete.assessment.entityId);
  };

  const isEstimatePageLoading = workspaceMode.kind === "pending-supabase"
    || isProjectLoading
    || isCurrentUserLoading
    || isMembersLoading
    || isEstimateLoading;

  if (isEstimatePageLoading) {
    return <ProjectEstimateSkeleton />;
  }

  if (!project) {
    return <EmptyState icon={AlertTriangle} title="Not found" description="Project not found." />;
  }

  return (
    <div className="space-y-sp-2 p-sp-2">
      <div className="rounded-card border border-border bg-card p-sp-2 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3 lg:flex-nowrap">
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="truncate text-xl font-semibold text-foreground">{project.title}</h2>
            {showEstimateWorkspace && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Status</span>
                <Select
                  value={estimateProject.estimateStatus}
                  onValueChange={(value) => handleEstimateStatusChange(value as EstimateExecutionStatus)}
                  disabled={!canEditEstimate}
                >
                  <SelectTrigger className={`h-8 w-auto min-w-[116px] rounded-md border px-3 text-xs font-semibold shadow-none ${estimateStatusClassName(estimateProject.estimateStatus)}`}>
                    <SelectValue placeholder={estimateStatusLabel(estimateProject.estimateStatus)} />
                  </SelectTrigger>
                  <SelectContent>
                    {estimateProject.estimateStatus !== "in_work" && <SelectItem value="planning">Planning</SelectItem>}
                    <SelectItem value="in_work">In work</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="finished">Finished</SelectItem>
                  </SelectContent>
                </Select>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Badge
                        variant="secondary"
                        className={latestVersionApproved ? "border border-success/20 bg-success/10 text-success" : "border border-warning/20 bg-warning/10 text-warning-foreground"}
                      >
                        Estimate v{latestVersionNumber}
                      </Badge>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Share link with client for approval of the latest estimate version.
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          {showEstimateWorkspace && (
            <div className="flex w-full min-w-0 flex-col items-start gap-1 lg:w-auto lg:items-end">
              <div className="flex w-full flex-wrap items-center gap-2 lg:justify-end">
                <Button variant="outline" size="sm" onClick={handleExportCsv}>
                  <Download className="mr-1 h-4 w-4" /> Export CSV
                </Button>

                {ctaState.showSubmit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-accent/30 text-accent hover:bg-accent/10"
                    onClick={handleSubmitToClient}
                    disabled={submitState.submitDisabled}
                    title={submitState.submitDisabledReason ?? undefined}
                  >
                    Submit to client
                  </Button>
                )}

                {ctaState.showApprove && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-accent/30 text-accent hover:bg-accent/10"
                    onClick={() => setApprovalModalOpen(true)}
                    disabled={ctaState.approveDisabled}
                    title={ctaState.approveDisabledReason ?? undefined}
                  >
                    Approve
                  </Button>
                )}
              </div>

              {(!canEditEstimate || (ctaState.showApprove && ctaState.approveDisabledReason) || (ctaState.showSubmit && submitState.submitDisabledReason)) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground lg:justify-end">
                  {!canEditEstimate && <span>Owner only</span>}
                  {ctaState.showApprove && ctaState.approveDisabledReason && <span>{ctaState.approveDisabledReason}</span>}
                  {ctaState.showSubmit && submitState.submitDisabledReason && <span>{submitState.submitDisabledReason}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {showEstimateWorkspace && (isInWork ? (
          <div className="rounded-lg border border-border p-3">
            {regime === "client" ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  <p className="col-span-2 text-sm font-semibold text-foreground md:col-span-3 lg:col-span-4">Financial</p>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="text-[11px] text-muted-foreground">Total (inc VAT)</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{money(totals.totalCents, estimateProject.currency)}</p>
                  </div>
                  <p className="col-span-2 text-sm font-semibold text-foreground md:col-span-3 lg:col-span-4">Timing</p>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      Days to end
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{TIMING_TOOLTIP_TEXT.daysToEnd}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {timingMetrics.daysToEnd == null ? "—" : `${timingMetrics.daysToEnd} d`}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      Behind schedule
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{TIMING_TOOLTIP_TEXT.behindSchedule}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{timingMetrics.behindScheduleDays} d</p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      Duration planned
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{TIMING_TOOLTIP_TEXT.durationPlanned}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {timingMetrics.durationPlannedDays == null ? "—" : `${timingMetrics.durationPlannedDays} d`}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      Duration estimated
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{TIMING_TOOLTIP_TEXT.durationEstimated}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {timingMetrics.durationEstimatedDays == null ? "—" : `${timingMetrics.durationEstimatedDays} d`}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  <p className="col-span-2 text-sm font-semibold text-foreground md:col-span-3 lg:col-span-4">Financial</p>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="text-[11px] text-muted-foreground">Planned total</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {money(combinedPlanFact.planned.plannedBudgetCents, estimateProject.currency)}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="text-[11px] text-muted-foreground">Actual spent</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {hasActualFinancialData ? money(combinedPlanFact.fact.spentCents, estimateProject.currency) : "—"}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="text-[11px] text-muted-foreground">Over/Under</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {hasActualFinancialData
                        ? money(combinedPlanFact.fact.spentCents - combinedPlanFact.planned.plannedBudgetCents, estimateProject.currency)
                        : "—"}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="text-[11px] text-muted-foreground">To be paid</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {money(combinedPlanFact.fact.toBePaidPlannedCents, estimateProject.currency)}
                    </p>
                  </div>
                  <p className="col-span-2 text-sm font-semibold text-foreground md:col-span-3 lg:col-span-4">Timing</p>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      Days to end
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{TIMING_TOOLTIP_TEXT.daysToEnd}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {timingMetrics.daysToEnd == null ? "—" : `${timingMetrics.daysToEnd} d`}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      Behind schedule
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{TIMING_TOOLTIP_TEXT.behindSchedule}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{timingMetrics.behindScheduleDays} d</p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      Duration planned
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{TIMING_TOOLTIP_TEXT.durationPlanned}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {timingMetrics.durationPlannedDays == null ? "—" : `${timingMetrics.durationPlannedDays} d`}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      Duration estimated
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{TIMING_TOOLTIP_TEXT.durationEstimated}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {timingMetrics.durationEstimatedDays == null ? "—" : `${timingMetrics.durationEstimatedDays} d`}
                    </p>
                  </div>
                </div>

                {canViewSensitiveDetail && (
                  <div className="border-t border-border/60 pt-3">
                  <Collapsible open={detailedCostOverviewOpen} onOpenChange={setDetailedCostOverviewOpen}>
                    <div className="rounded-lg border border-border/70">
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-muted/20"
                        >
                          <span className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
                            {detailedCostOverviewOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            Detailed cost overview
                          </span>
                          <span className="text-caption tabular-nums text-muted-foreground">
                            {money(totals.totalCents, estimateProject.currency)}
                          </span>
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="border-t border-border/60 px-3 py-3">
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          <div className="space-y-2 rounded-md border border-border/60 bg-background/30 p-3">
                            <p className="text-sm font-semibold text-foreground">Financial breakdown</p>
                            <div className="space-y-2">
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-left text-sm hover:bg-muted/30"
                                onClick={() => setFinancialResourcesExpanded((current) => !current)}
                              >
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  {financialResourcesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  Resources
                                </span>
                                <span className="font-medium tabular-nums text-foreground">{money(resourcesTotalCents, estimateProject.currency)}</span>
                              </button>
                              {financialResourcesExpanded && (
                                <div className="space-y-2 pl-3">
                                  {financialBreakdownTypeRows.map((row) => (
                                    <div key={row.label} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                                      <span className="text-muted-foreground">{row.label}</span>
                                      <span className="font-medium tabular-nums text-foreground">
                                        {money(row.amountCents, estimateProject.currency)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {financialBreakdownSummaryRows.map((row) => (
                                <div
                                  key={row.label}
                                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
                                    row.emphasized ? "border-border/70 bg-muted/30" : "border-border/60"
                                  }`}
                                >
                                  <span className={row.emphasized ? "font-medium text-foreground" : "text-muted-foreground"}>
                                    {row.label}
                                  </span>
                                  <span className={`${row.emphasized ? "font-semibold" : "font-medium"} tabular-nums text-foreground`}>
                                    {money(row.amountCents, estimateProject.currency)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="space-y-2 rounded-md border border-border/60 bg-background/30 p-3">
                            <p className="text-sm font-semibold text-foreground">Plan vs actual</p>
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(112px,auto)_minmax(112px,auto)] gap-3 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                              <span>Category</span>
                              <span className="text-right">Planned</span>
                              <span className="text-right">Actual</span>
                            </div>
                            <div className="space-y-2">
                              {planVsActualRows.map((row) => (
                                <div key={row.label} className="grid grid-cols-[minmax(0,1fr)_minmax(112px,auto)_minmax(112px,auto)] items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                                  <span className="text-muted-foreground">{row.label}</span>
                                  <span className="text-right font-medium tabular-nums text-foreground">{row.planned}</span>
                                  <span className="text-right font-medium tabular-nums text-foreground">{row.actual}</span>
                                </div>
                              ))}
                              <div className="grid grid-cols-[minmax(0,1fr)_minmax(112px,auto)_minmax(112px,auto)] items-center gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                                <span className="font-medium text-foreground">Total</span>
                                <span className="text-right font-semibold tabular-nums text-foreground">
                                  {money(combinedPlanFact.planned.plannedBudgetCents, estimateProject.currency)}
                                </span>
                                <span className="text-right font-semibold tabular-nums text-foreground">
                                  {hasActualFinancialData ? money(combinedPlanFact.fact.spentCents, estimateProject.currency) : "—"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-foreground">Timing</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-caption">
                <div className="rounded-md border border-border/70 p-2">
                  <p className="text-muted-foreground">Duration range</p>
                  <p className="text-sm font-medium text-foreground">{planningRangeLabel}</p>
                </div>
                <div className="rounded-md border border-border/70 p-2">
                  <p className="text-muted-foreground">Duration days</p>
                  <p className="text-sm font-medium text-foreground">{planningDurationDays == null ? "—" : `${planningDurationDays} d`}</p>
                </div>
                <div className="rounded-md border border-border/70 p-2">
                  <p className="text-muted-foreground">Days to end</p>
                  <p className="text-sm font-medium text-foreground">
                    {timingMetrics.daysToEnd == null ? "—" : `${timingMetrics.daysToEnd} d`}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 p-2">
                  <p className="text-muted-foreground">Behind schedule</p>
                  <p className="text-sm font-medium text-foreground">{timingMetrics.behindScheduleDays} d</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-foreground">Financial</p>
              {regime === "client" || !canViewSensitiveDetail ? (
                <div className="mt-2 rounded-md border border-border/70 p-2">
                  <p className="text-xs text-muted-foreground">Total (inc VAT)</p>
                  <p className="text-2xl font-semibold text-foreground">{money(totals.totalCents, estimateProject.currency)}</p>
                </div>
              ) : (
                <div className="mt-2 space-y-1 text-caption">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-border/70 px-2 py-1 text-left hover:bg-muted/30"
                    onClick={() => setFinancialResourcesExpanded((current) => !current)}
                  >
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      {financialResourcesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Resources
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{money(resourcesTotalCents, estimateProject.currency)}</span>
                  </button>
                  {financialResourcesExpanded && (
                    <div className="space-y-1 pl-5">
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">Material cost</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.material, estimateProject.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">Tool cost</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.tool, estimateProject.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">Labor cost</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.labor, estimateProject.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">Subcontractor cost</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.subcontractor, estimateProject.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">Other cost</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.other, estimateProject.currency)}</span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                    <span className="text-muted-foreground">Markup</span>
                    <span className="tabular-nums text-foreground">{money(totals.markupTotalCents, estimateProject.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                    <span className="text-muted-foreground">Subtotal (ex VAT)</span>
                    <span className="tabular-nums text-foreground">{money(totals.subtotalBeforeDiscountCents, estimateProject.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="tabular-nums text-foreground">{money(totals.discountTotalCents, estimateProject.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                    <span className="text-muted-foreground">VAT amount</span>
                    <span className="tabular-nums text-foreground">{money(totals.taxAmountCents, estimateProject.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-2 py-1">
                    <span className="font-medium text-foreground">Total (inc VAT)</span>
                    <span className="font-semibold tabular-nums text-foreground">{money(totals.totalCents, estimateProject.currency)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="rounded-md border border-border/70 p-2">
                      <p className="text-muted-foreground">Profit (ex VAT)</p>
                      <p className="text-sm font-medium text-foreground">{money(profitExVatCents, estimateProject.currency)}</p>
                    </div>
                    <div className="rounded-md border border-border/70 p-2">
                      <p className="text-muted-foreground">Profitability (%)</p>
                      <p className="text-sm font-medium text-foreground">{profitabilityPct == null ? "—" : formatPercent(profitabilityPct)}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {showEstimateWorkspace && <VersionBanner
          hasPending={pendingProposed && Boolean(latestProposed)}
          isOpenByDefault={reviewExpandedByDefault}
          title="New version submitted"
          secondaryActions={(
            !canManageEstimate && regime === "client" ? (
              <Button variant="outline" size="sm" onClick={handleAskQuestions}>Ask questions</Button>
            ) : undefined
          )}
        >
          <p className="mb-2 text-caption font-medium text-foreground">Changed items</p>
          <VersionDiffList
            changes={diff.changes}
            regime={regime}
            currency={estimateProject.currency}
            showSensitiveDetail={canViewSensitiveDetail}
          />
        </VersionBanner>}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="estimate">Estimate</TabsTrigger>
            <TabsTrigger value="work_schedule" disabled={!showEstimateWorkspace}>Work schedule</TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger value="work_log" disabled={!showEstimateWorkspace}>
                    Work log
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              {!showEstimateWorkspace && (
                <TooltipContent>
                  Create an estimate first. Tasks are available from here, and Procurement/HR unlock after In work.
                </TooltipContent>
              )}
            </Tooltip>
          </TabsList>

          <TabsContent value="estimate" className="mt-3 space-y-3">
            {!showEstimateWorkspace ? (
              <EmptyState
                icon={AlertTriangle}
                title="No estimate created yet"
                description="Create the estimate when you are ready to start building stages, works and resources."
                actionLabel={canEditEstimate ? "Create estimate" : undefined}
                onAction={canEditEstimate ? handleStartEstimate : undefined}
              />
            ) : (
              <>
            {approvedVersionWithStamp && approvedVersionWithStamp.approvalStamp && (
              <ApprovalStampCard
                stamp={approvedVersionWithStamp.approvalStamp}
                versionNumber={approvedVersionWithStamp.number}
              />
            )}

            {sortedStages.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/70 bg-background/40 p-4">
                <p className="text-sm font-medium text-foreground">No stages yet</p>
                <p className="mt-1 text-caption text-muted-foreground">
                  Start with a stage. Works appear after a stage is added, and resources appear after a work is added.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedStages.map((stage) => {
                  const stageWorks = worksByStage.get(stage.id) ?? [];
                  const stageNumber = hierarchyNumbers.stageNumberById.get(stage.id) ?? stage.order;
                  const isCollapsed = collapsedStageIds.has(stage.id);
                  const stageTotals = stageTotalsById.get(stage.id);

                  return (
                    <div key={stage.id} className="group/stage rounded-card border border-border p-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() => toggleStageCollapsed(stage.id)}
                          >
                            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <span className="w-7 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">
                            {stageNumber}
                          </span>
                          <InlineEditableText
                            value={stage.title}
                            readOnly={!canEditEstimate}
                            startInEditMode={pendingStageTitleEditId === stage.id}
                            onCommit={(nextValue) => updateStage(pid, stage.id, { title: nextValue || stage.title })}
                            className="min-w-[220px] flex-1"
                            displayClassName="text-body-sm font-semibold"
                            inputClassName="text-body-sm font-semibold"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          {canViewSensitiveDetail && (
                            <div className="flex items-center gap-1">
                              <span className="text-caption text-muted-foreground">Stage discount:</span>
                              {canEditEstimate ? (
                                <InlineEditableNumber
                                  value={stage.discountBps}
                                  onCommit={(nextValue) => updateStage(pid, stage.id, { discountBps: nextValue })}
                                  formatDisplay={(value) => `${fromBpsToPercent(value)}%`}
                                  formatInput={(value) => fromBpsToPercent(value)}
                                  parseInput={(raw) => toBpsFromPercent(raw)}
                                  className="w-20"
                                />
                              ) : (
                                <span className="text-sm tabular-nums text-foreground">{fromBpsToPercent(stage.discountBps)}%</span>
                              )}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-caption text-muted-foreground">Stage total:</span>
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {money(stageTotals?.totalCents ?? 0, estimateProject.currency)}
                            </span>
                          </div>
                          {canEditEstimate && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              aria-label={`Delete stage ${stage.title}`}
                              title="Delete stage"
                              onClick={() => openStageDelete(stage.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="mt-2 space-y-2 pl-6">
                          {stageWorks.map((work) => {
                            const workLines = linesByWork.get(work.id) ?? [];
                            const fallbackChecklistRows = !canViewSensitiveDetail && workLines.length === 0
                              ? (checklistFallbackRowsByWork.get(work.id) ?? [])
                              : [];
                            const hasChecklistFallbackRows = fallbackChecklistRows.length > 0;
                            const workNumber = hierarchyNumbers.workNumberById.get(work.id) ?? `${stageNumber}.1`;
                            const showAssignmentColumn = workLines.some((line) => isAssignableResourceType(line.type))
                              || fallbackChecklistRows.some((row) => (
                                isAssignableResourceType(row.type)
                                && Boolean(row.assigneeId || row.assigneeName || row.assigneeEmail)
                              ));
                            // Show client money columns whenever we render real estimate lines (not checklist-only fallback).
                            // Do not gate on `canViewSensitiveDetail`: summary-finance members still need these columns
                            // (values come from RPC snapshot when present, else computed — often zero for operational hydrate).
                            const showClientPricingColumns = !hasChecklistFallbackRows;
                            const tableColumnCount = 3
                              + (showAssignmentColumn ? 1 : 0)
                              + (showEstimateInternalPricing ? 2 : 0)
                              + (showEstimateMarkup ? 1 : 0)
                              + (showEstimateInternalPricing ? 1 : 0)
                              + (showClientPricingColumns ? 2 : 0)
                              + (canEditEstimate ? 1 : 0);

                            return (
                              <div key={work.id} className="group/work space-y-2 rounded-md border border-border/80 p-2">
                                <div className="flex flex-wrap items-start justify-between gap-2 pl-2">
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{workNumber}</span>
                                    <InlineEditableText
                                      value={work.title}
                                      readOnly={!canEditEstimate}
                                      startInEditMode={pendingWorkTitleEditId === work.id}
                                      onCommit={(nextValue) => updateWork(pid, work.id, { title: nextValue || work.title })}
                                      className="min-w-[220px] flex-1"
                                      displayClassName="text-sm font-medium"
                                      inputClassName="text-sm font-medium"
                                    />
                                  </div>
                                  {canEditEstimate && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      aria-label={`Delete work ${work.title}`}
                                      title="Delete work"
                                      onClick={() => openWorkDelete(work.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </div>

                                <WorkTableFrame className="table-fixed min-w-[980px]">
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="sticky left-0 z-30 h-9 w-[360px] border-r border-border bg-card py-1 pr-2 shadow-[6px_0_10px_-10px_hsl(var(--foreground)/0.45)]">
                                          Resource
                                        </TableHead>
                                        {showAssignmentColumn && (
                                          <TableHead className="h-9 w-[170px] py-1 pr-2">
                                            <span
                                              className="inline-flex items-center gap-1"
                                              title="Assignment identifies responsibility only. Project access is managed separately."
                                            >
                                              <User className="h-3.5 w-3.5" />
                                              <span>Assigned</span>
                                            </span>
                                          </TableHead>
                                        )}
                                        <TableHead className="h-9 w-[92px] py-1 pr-2 text-right tabular-nums">Qty</TableHead>
                                        <TableHead className="h-9 w-[128px] py-1 pr-2">Unit</TableHead>
                                        {showEstimateInternalPricing && <TableHead className="h-9 w-[120px] py-1 pr-2 text-right tabular-nums">Cost unit</TableHead>}
                                        {showEstimateInternalPricing && <TableHead className="h-9 w-[120px] py-1 pr-2 text-right tabular-nums">Cost total</TableHead>}
                                        {showEstimateMarkup && (
                                          <TableHead className="h-9 w-[92px] whitespace-nowrap py-1 pr-2 text-right tabular-nums">Markup %</TableHead>
                                        )}
                                        {showEstimateInternalPricing && (
                                          <TableHead className="h-9 w-[92px] whitespace-nowrap py-1 pr-2 text-right tabular-nums">Discount %</TableHead>
                                        )}
                                        {showClientPricingColumns && (
                                          <TableHead className="h-9 w-[120px] py-1 pr-2 text-right tabular-nums">Client unit</TableHead>
                                        )}
                                        {showClientPricingColumns && (
                                          <TableHead className="h-9 w-[126px] py-1 pr-2 text-right tabular-nums">Client total</TableHead>
                                        )}
                                        {canEditEstimate && <TableHead className="h-9 w-10 py-1 pr-0" />}
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {workLines.map((line) => {
                                        const computed = lineTotalsById.get(line.id);
                                        if (!computed) return null;
                                        const clientMoney = displayLineClientAmounts(line, computed);
                                        const typeLabel = line.type === "other" && line.title.toLowerCase().includes("overhead")
                                          ? "Overheads"
                                          : labelForType(line.type);
                                        const resolvedUnitSelectValue = resolveUnitSelectValue(line.type, line.unit);
                                        const isCustomUnit = resolvedUnitSelectValue === CUSTOM_UNIT_SENTINEL;
                                        const unitSelectValue = customUnitInputLineIds.has(line.id)
                                          ? CUSTOM_UNIT_SENTINEL
                                          : resolvedUnitSelectValue;
                                        const customDraft = customUnitDraftByLineId[line.id] ?? (isCustomUnit ? line.unit : "");
                                        const shouldShowCustomInput = isCustomUnit || customUnitInputLineIds.has(line.id);
                                        return (
                                          <TableRow key={line.id} className={changedLineIds.has(line.id) ? "bg-warning/10" : ""}>
                                            <TableCell className="sticky left-0 z-20 w-[360px] border-r border-border bg-card py-1.5 pr-2 align-top shadow-[6px_0_10px_-10px_hsl(var(--foreground)/0.35)]">
                                              <div className="flex min-w-0 items-start gap-2">
                                                {canEditEstimate ? (
                                                  <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                      <button
                                                        type="button"
                                                        title={typeLabel}
                                                        className="rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
                                                      >
                                                        <ResourceTypeBadge type={line.type} iconOnly />
                                                      </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start">
                                                      {RESOURCE_TYPE_OPTIONS.map((option) => (
                                                        <DropdownMenuItem
                                                          key={option.value}
                                                          onSelect={() => updateLine(pid, line.id, { type: option.value })}
                                                        >
                                                          <ResourceTypeBadge type={option.value} className="border-transparent" />
                                                        </DropdownMenuItem>
                                                      ))}
                                                    </DropdownMenuContent>
                                                  </DropdownMenu>
                                                ) : (
                                                  <span title={typeLabel}>
                                                    <ResourceTypeBadge type={line.type} iconOnly />
                                                  </span>
                                                )}
                                                <InlineEditableText
                                                  value={line.title}
                                                  readOnly={!canEditEstimate}
                                                  startInEditMode={pendingLineTitleEditId === line.id}
                                                  onCommit={(nextValue) => updateLine(pid, line.id, { title: nextValue || line.title })}
                                                  className="min-w-0 flex-1"
                                                  displayClassName="whitespace-normal break-words leading-5 max-h-10 overflow-hidden font-medium"
                                                />
                                              </div>
                                            </TableCell>

                                            {showAssignmentColumn && (
                                              <TableCell className="w-[170px] py-1.5 pr-2 align-top">
                                                {isAssignableResourceType(line.type) ? (
                                                  <AssigneeCell
                                                    assigneeId={line.assigneeId}
                                                    assigneeName={line.assigneeName}
                                                    assigneeEmail={line.assigneeEmail}
                                                    participants={participantOptions}
                                                    pendingInvites={pendingInviteOptions}
                                                    editable={canEditEstimate}
                                                    clientView={regime === "client"}
                                                    onInvite={handleAssigneeInvite}
                                                    onCommit={(nextValue) => updateLine(pid, line.id, nextValue)}
                                                  />
                                                ) : (
                                                  <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                              </TableCell>
                                            )}

                                            <TableCell className="w-[92px] py-1.5 pr-2 align-top">
                                              <InlineEditableNumber
                                                value={line.qtyMilli}
                                                readOnly={!canEditEstimate}
                                                onCommit={(nextValue) => updateLine(pid, line.id, { qtyMilli: nextValue })}
                                                formatDisplay={(value) => qtyFromMilli(value)}
                                                formatInput={(value) => qtyFromMilli(value)}
                                                parseInput={(raw) => toQtyMilli(raw)}
                                              />
                                            </TableCell>

                                            <TableCell className="w-[128px] py-1.5 pr-2 align-top">
                                              {canEditEstimate ? (
                                                shouldShowCustomInput ? (
                                                  <div className="inline-flex max-w-full items-center gap-1">
                                                    <Input
                                                      className="h-7 w-auto max-w-[calc(100%-1.75rem)] px-2 py-0 text-sm"
                                                      size={Math.min(18, Math.max(3, (customDraft ?? "").length + 1))}
                                                      value={customDraft}
                                                      placeholder=""
                                                      aria-label="Unit"
                                                      onChange={(event) => {
                                                        const nextValue = event.target.value;
                                                        setCustomUnitDraftByLineId((current) => ({
                                                          ...current,
                                                          [line.id]: nextValue,
                                                        }));
                                                      }}
                                                      onBlur={() => commitCustomUnit(line)}
                                                      onKeyDown={(event) => {
                                                        if (event.key !== "Enter") return;
                                                        event.preventDefault();
                                                        commitCustomUnit(line);
                                                      }}
                                                    />
                                                    <DropdownMenu>
                                                      <DropdownMenuTrigger asChild>
                                                        <Button
                                                          type="button"
                                                          variant="ghost"
                                                          size="icon"
                                                          className="h-7 w-7 shrink-0 border border-transparent bg-transparent text-foreground shadow-none hover:bg-muted/60 focus-visible:ring-1 focus-visible:ring-ring/40"
                                                          aria-label="Preset units"
                                                        >
                                                          <ChevronDown className="h-4 w-4 opacity-50" />
                                                        </Button>
                                                      </DropdownMenuTrigger>
                                                      <DropdownMenuContent align="end" className="max-h-60 overflow-y-auto">
                                                        {getUnitOptionsForType(line.type).map((unit) => (
                                                          <DropdownMenuItem
                                                            key={`${line.id}-preset-${unit}`}
                                                            onSelect={() => {
                                                              closeCustomUnitInput(line.id);
                                                              updateLine(pid, line.id, { unit });
                                                            }}
                                                          >
                                                            {unit}
                                                          </DropdownMenuItem>
                                                        ))}
                                                      </DropdownMenuContent>
                                                    </DropdownMenu>
                                                  </div>
                                                ) : (
                                                  <Select
                                                    value={unitSelectValue}
                                                    onValueChange={(nextValue) => {
                                                      if (nextValue === CUSTOM_UNIT_SENTINEL) {
                                                        openCustomUnitInput(line.id, isCustomUnit ? line.unit : "");
                                                        return;
                                                      }
                                                      closeCustomUnitInput(line.id);
                                                      updateLine(pid, line.id, { unit: nextValue });
                                                    }}
                                                  >
                                                    <SelectTrigger className="h-7 w-auto max-w-full min-w-0 border-transparent bg-transparent px-2 py-0 text-sm shadow-none focus:ring-1 focus:ring-ring/40">
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                      {buildUnitSelectOptions(line.type).map((option) => (
                                                        <SelectItem key={`${line.id}-${option.value}`} value={option.value}>
                                                          {option.label}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                )
                                              ) : (
                                                <div className="min-h-7 px-1 py-0.5 text-sm text-foreground">
                                                  {line.unit || "—"}
                                                </div>
                                              )}
                                            </TableCell>

                                            {showEstimateInternalPricing && (
                                              <TableCell className="w-[120px] py-1.5 pr-2 align-top">
                                                <InlineEditableNumber
                                                  value={line.costUnitCents}
                                                  readOnly={!canEditEstimate}
                                                  onCommit={(nextValue) => updateLine(pid, line.id, { costUnitCents: nextValue })}
                                                  formatDisplay={(value) => money(value, estimateProject.currency)}
                                                  formatInput={(value) => (value / 100).toString()}
                                                  parseInput={(raw) => toCentsFromMajor(raw)}
                                                />
                                              </TableCell>
                                            )}

                                            {showEstimateInternalPricing && (
                                              <TableCell className="w-[120px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                                {money(computed.costTotalCents, estimateProject.currency)}
                                              </TableCell>
                                            )}

                                            {showEstimateMarkup && (
                                              <TableCell className="w-[92px] py-1.5 pr-2 align-top">
                                                <InlineEditableNumber
                                                  value={line.markupBps}
                                                  readOnly={!canEditEstimate}
                                                  onCommit={(nextValue) => updateLine(pid, line.id, { markupBps: nextValue })}
                                                  formatDisplay={(value) => `${fromBpsToPercent(value)}%`}
                                                  formatInput={(value) => fromBpsToPercent(value)}
                                                  parseInput={(raw) => toBpsFromPercent(raw)}
                                                />
                                              </TableCell>
                                            )}

                                            {showEstimateInternalPricing && (
                                              <TableCell className="w-[92px] py-1.5 pr-2 align-top">
                                                {canEditEstimate ? (
                                                  <InlineEditableNumber
                                                    value={line.discountBpsOverride ?? 0}
                                                    onCommit={(nextValue) => updateLine(pid, line.id, { discountBpsOverride: nextValue })}
                                                    formatDisplay={(value) => `${fromBpsToPercent(value)}%`}
                                                    formatInput={(value) => fromBpsToPercent(value)}
                                                    parseInput={(raw) => toBpsFromPercent(raw)}
                                                  />
                                                ) : (
                                                  <div className="min-h-7 whitespace-nowrap px-1 py-0.5 text-right text-sm tabular-nums text-foreground">
                                                    {`${fromBpsToPercent(effectiveDiscountForDisplay(line, stage, estimateProject.discountBps))}%`}
                                                  </div>
                                                )}
                                              </TableCell>
                                            )}

                                            {showClientPricingColumns && (
                                              <TableCell className="w-[120px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                                {money(clientMoney.clientUnitCents, estimateProject.currency)}
                                              </TableCell>
                                            )}
                                            {showClientPricingColumns && (
                                              <TableCell className="w-[126px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                                {money(clientMoney.clientTotalCents, estimateProject.currency)}
                                              </TableCell>
                                            )}

                                            {canEditEstimate && (
                                              <TableCell className="w-10 py-1.5 pr-0 align-top">
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  className="h-7 w-7"
                                                  aria-label={`Delete resource ${line.title}`}
                                                  title="Delete resource"
                                                  onClick={() => openResourceDelete(line.id)}
                                                >
                                                  <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                              </TableCell>
                                            )}
                                          </TableRow>
                                        );
                                      })}

                                      {fallbackChecklistRows.map((row) => {
                                        const typeLabel = row.typeLabel ?? labelForType(row.type);
                                        return (
                                          <TableRow key={row.id}>
                                            <TableCell className="sticky left-0 z-20 w-[360px] border-r border-border bg-card py-1.5 pr-2 align-top shadow-[6px_0_10px_-10px_hsl(var(--foreground)/0.35)]">
                                              <div className="flex min-w-0 items-start gap-2">
                                                <span title={typeLabel}>
                                                  <ResourceTypeBadge type={row.type} iconOnly labelOverride={row.typeLabel ?? undefined} />
                                                </span>
                                                <div className="min-w-0 flex-1 whitespace-normal break-words leading-5 font-medium">
                                                  {row.title}
                                                </div>
                                              </div>
                                            </TableCell>

                                            {showAssignmentColumn && (
                                              <TableCell className="w-[170px] py-1.5 pr-2 align-top">
                                                {isAssignableResourceType(row.type) && (row.assigneeName || row.assigneeEmail) ? (
                                                  <div className="min-h-7 px-1 py-0.5 text-sm text-foreground">
                                                    {row.assigneeName || row.assigneeEmail}
                                                  </div>
                                                ) : (
                                                  <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                              </TableCell>
                                            )}

                                            <TableCell className="w-[92px] py-1.5 pr-2 align-top">
                                              <div className="min-h-7 px-1 py-0.5 text-sm text-foreground">
                                                {row.qtyMilli != null ? qtyFromMilli(row.qtyMilli) : "—"}
                                              </div>
                                            </TableCell>

                                            <TableCell className="w-[128px] py-1.5 pr-2 align-top">
                                              <div className="min-h-7 px-1 py-0.5 text-sm text-foreground">
                                                {row.unit || "—"}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}

                                      {canEditEstimate && (
                                        <TableRow className="border-b-0 hover:bg-transparent">
                                          <TableCell className="sticky left-0 z-20 w-[360px] border-r border-border bg-card py-1 pr-2 shadow-[6px_0_10px_-10px_hsl(var(--foreground)/0.35)]">
                                            <div className="flex h-8 items-center rounded-md border border-dashed border-border/70 bg-background/40 px-2">
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    className="h-6 gap-1 px-2 text-xs"
                                                  >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Add resource
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent
                                                  align="start"
                                                  onCloseAutoFocus={(event) => {
                                                    if (!suppressResourceCreateAutoFocusRef.current) return;
                                                    event.preventDefault();
                                                    suppressResourceCreateAutoFocusRef.current = false;
                                                  }}
                                                >
                                                  {RESOURCE_CREATE_OPTIONS.map((option) => (
                                                    <DropdownMenuItem
                                                      key={`${work.id}-${option.label}`}
                                                      onSelect={() => handleCreateResourceLine(stage.id, work.id, option)}
                                                    >
                                                      <ResourceTypeBadge
                                                        type={option.value}
                                                        labelOverride={option.label}
                                                        className="border-transparent"
                                                      />
                                                    </DropdownMenuItem>
                                                  ))}
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                          </TableCell>
                                          <TableCell colSpan={tableColumnCount - 1} className="py-1" />
                                        </TableRow>
                                      )}
                                    </TableBody>
                                </WorkTableFrame>
                              </div>
                            );
                          })}

                          {canEditEstimate && (
                            <div className="rounded-md border border-dashed border-border/70 bg-background/40 px-2 py-1">
                              <div className="flex h-7 items-center">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-6 gap-1 px-2 text-xs"
                                  onClick={() => handleCreateWork(stage.id)}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Add work
                                </Button>
                              </div>
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {canEditEstimate && (
              <div className="rounded-md border border-dashed border-border/70 bg-background/40 p-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 gap-1 px-2 text-xs"
                  onClick={handleCreateStage}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add stage
                </Button>
              </div>
            )}
            <div className="rounded-lg border border-border p-3">
              <div className={`grid items-center gap-x-4 gap-y-2 ${regime === "client" ? "md:grid-cols-[minmax(0,1fr)_max-content]" : "md:grid-cols-[minmax(0,1fr)_max-content_max-content]"}`}>
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="truncate">Total across all stages</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{FOOTER_HELPER_TOOLTIP}</TooltipContent>
                  </Tooltip>
                </div>

                {showEstimateInternalPricing && (
                  <div className="flex items-center justify-between gap-2 whitespace-nowrap text-sm md:min-w-[170px] md:justify-end">
                    <span className="text-muted-foreground">Total cost</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {money(totals.costTotalCents, estimateProject.currency)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 whitespace-nowrap text-sm md:min-w-[190px] md:justify-end">
                  <span className="text-muted-foreground">Total for client</span>
                  <span className="font-semibold tabular-nums text-foreground">
                    {money(totals.totalCents, estimateProject.currency)}
                  </span>
                </div>
              </div>

              <div className={`mt-2 grid items-center gap-x-4 gap-y-2 ${regime === "client" ? "md:grid-cols-[minmax(0,1fr)_max-content]" : "md:grid-cols-[minmax(0,1fr)_max-content_max-content]"}`}>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">VAT</span>
                  {canEditEstimate ? (
                    <InlineEditableNumber
                      value={estimateProject.taxBps}
                      onCommit={(nextValue) => updateEstimateV2Project(pid, { taxBps: nextValue })}
                      formatDisplay={(value) => `${fromBpsToPercent(value)}%`}
                      formatInput={(value) => fromBpsToPercent(value)}
                      parseInput={(raw) => toBpsFromPercent(raw)}
                      className="w-14"
                      displayClassName="font-semibold"
                      inputClassName="font-semibold"
                    />
                  ) : (
                    <span className="font-semibold tabular-nums text-foreground">
                      {fromBpsToPercent(estimateProject.taxBps)}%
                    </span>
                  )}
                  <span className="tabular-nums text-muted-foreground">
                    {money(totals.taxAmountCents, estimateProject.currency)}
                  </span>
                </div>

                {showEstimateInternalPricing && <div aria-hidden="true" className="hidden md:block" />}
                <div aria-hidden="true" className="hidden md:block" />
              </div>
            </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="work_schedule" className="mt-3 space-y-3">
            <EstimateGantt
              projectId={pid}
              stages={stages}
              works={works}
              dependencies={dependencies}
              isOwner={canEditEstimate}
            />
          </TabsContent>

        </Tabs>

        <ConfirmModal
          open={Boolean(pendingDelete)}
          onOpenChange={handlePendingDeleteOpenChange}
          title={pendingDelete ? deleteDialogTitle(pendingDelete.assessment, pendingDelete.step) : "Delete"}
          description={pendingDelete ? pendingDeleteDescription(pendingDelete) : ""}
          confirmLabel={pendingDelete ? pendingDeleteConfirmLabel(pendingDelete) : "Delete"}
          cancelLabel="Cancel"
          onConfirm={confirmPendingDelete}
          onCancel={() => {
            pendingDeleteNextStepRef.current = null;
            setPendingDelete(null);
          }}
        >
          {pendingDelete?.step === "execution" && pendingDelete.assessment.kind === "stage" && pendingDelete.assessment.startedEntries.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border border-border p-2">
              <p className="mb-2 text-caption text-muted-foreground">Started work and tasks in this stage</p>
              <ul className="space-y-1">
                {pendingDelete.assessment.startedEntries.map((entry) => (
                  <li key={`${entry.kind}-${entry.id}`} className="text-caption text-foreground">
                    {entry.title} ({entry.kind === "work" ? "Work" : "Task"}: {entry.statusLabel})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingDelete?.step === "financial" && pendingDelete.assessment.financial.hasConsequences && (
            <div className="max-h-56 overflow-auto rounded-md border border-border p-2 space-y-3">
              {pendingDelete.assessment.financial.procurement.length > 0 && (
                <div>
                  <p className="mb-2 text-caption text-muted-foreground">Procurement and stock already affected</p>
                  <ul className="space-y-1">
                    {pendingDelete.assessment.financial.procurement.map((item) => (
                      <li key={item.procurementItemId} className="text-caption text-foreground">
                        {item.title} ({procurementConsequenceLabel(item)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pendingDelete.assessment.financial.hr.length > 0 && (
                <div>
                  <p className="mb-2 text-caption text-muted-foreground">HR and payment records already affected</p>
                  <ul className="space-y-1">
                    {pendingDelete.assessment.financial.hr.map((item) => (
                      <li key={item.hrItemId} className="text-caption text-foreground">
                        {item.title} ({hrConsequenceLabel(item)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </ConfirmModal>

        <ConfirmModal
          open={missingDatesWorkIds.length > 0}
          onOpenChange={(open) => {
            if (!open) setMissingDatesWorkIds([]);
          }}
          title="Missing work dates"
          description="Some works are missing planned start/end dates. You can skip setup to auto-generate a sequential schedule."
          confirmLabel="Skip setup"
          cancelLabel="Cancel"
          onConfirm={handleSkipSetup}
          onCancel={() => setMissingDatesWorkIds([])}
        >
          <div className="max-h-48 overflow-auto rounded-md border border-border p-2">
            <ul className="space-y-1">
              {missingDatesWorkIds.map((workId) => {
                const work = workById.get(workId);
                return (
                  <li key={workId} className="text-caption text-foreground">
                    {work?.title ?? workId}
                  </li>
                );
              })}
            </ul>
          </div>
        </ConfirmModal>

        <ConfirmModal
          open={incompleteTaskBlocks.length > 0}
          onOpenChange={(open) => {
            if (!open) setIncompleteTaskBlocks([]);
          }}
          title="Cannot mark as Finished"
          description="All project tasks must be Done before project status can move to Finished."
          confirmLabel="Mark all tasks done"
          cancelLabel="Close"
          tertiaryLabel="Go to Work log"
          onTertiary={handleGoToWorkLog}
          onConfirm={() => {
            void handleMarkAllTasksDone();
          }}
          onCancel={() => setIncompleteTaskBlocks([])}
        >
          <div className="max-h-48 overflow-auto rounded-md border border-border p-2">
            <ul className="space-y-1">
              {incompleteTaskBlocks.map((task, index) => (
                <li key={`${task.taskId ?? "missing"}-${index}`} className="text-caption text-foreground">
                  {task.title}
                </li>
              ))}
            </ul>
          </div>
        </ConfirmModal>

        <ConfirmModal
          open={Boolean(bulkFinishedTasks)}
          onOpenChange={(open) => {
            if (!open) setBulkFinishedTasks(null);
          }}
          title="All tasks are Done"
          description="Do you want to mark the estimate as Finished now?"
          confirmLabel="Mark estimate Finished"
          cancelLabel="Not now"
          onConfirm={() => {
            void handleConfirmFinishAfterBulkDone();
          }}
          onCancel={() => setBulkFinishedTasks(null)}
        />

        <ConfirmModal
          open={recipientPickerOpen}
          onOpenChange={(open) => {
            setRecipientPickerOpen(open);
            if (!open) setSelectedRecipientIds([]);
          }}
          title="Choose client recipients"
          description="Select client emails that should receive this submission."
          confirmLabel="Submit to selected"
          cancelLabel="Cancel"
          onConfirm={handleSubmitToSelectedRecipients}
          onCancel={() => {
            setRecipientPickerOpen(false);
            setSelectedRecipientIds([]);
          }}
        >
          <div className="max-h-56 overflow-auto rounded-md border border-border p-2 space-y-2">
            {clientRecipients.map((recipient) => {
              const checked = selectedRecipientIds.includes(recipient.userId);
              return (
                <label
                  key={recipient.userId}
                  className="flex items-center gap-2 rounded-md border border-border/70 px-2 py-1.5 text-sm text-foreground"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(nextChecked) => {
                      const isChecked = Boolean(nextChecked);
                      setSelectedRecipientIds((current) => {
                        if (isChecked) {
                          if (current.includes(recipient.userId)) return current;
                          return [...current, recipient.userId];
                        }
                        return current.filter((id) => id !== recipient.userId);
                      });
                    }}
                  />
                  <span>{recipient.name}</span>
                  <span className="text-caption text-muted-foreground">{recipient.email}</span>
                </label>
              );
            })}
          </div>
        </ConfirmModal>

        <ConfirmModal
          open={Boolean(shareLinkModalState)}
          onOpenChange={(open) => {
            if (!open) setShareLinkModalState(null);
          }}
          title={shareLinkModalState?.title ?? "Share estimate"}
          description={shareLinkModalState?.description ?? ""}
          confirmLabel={shareLinkModalState?.suggestUpgrade ? "Upgrade plan" : "Close"}
          showCancel={Boolean(shareLinkModalState?.suggestUpgrade)}
          cancelLabel="Close"
          tertiaryLabel="Copy link"
          onTertiary={handleCopyShareLink}
          onConfirm={() => {
            if (shareLinkModalState?.suggestUpgrade) {
              navigate("/pricing");
            }
            setShareLinkModalState(null);
          }}
          onCancel={() => setShareLinkModalState(null)}
        >
          <div className="space-y-2 py-1">
            <p className="text-caption text-muted-foreground">Share estimate link</p>
            <Input readOnly value={shareLinkModalState?.link ?? ""} />
          </div>
        </ConfirmModal>

        <ApprovalStampFormModal
          open={approvalModalOpen}
          onOpenChange={setApprovalModalOpen}
          title="Approve estimate version"
          defaults={{
            name: currentUser.name.split(" ")[0] ?? "",
            surname: currentUser.name.split(" ").slice(1).join(" "),
            email: currentUser.email,
          }}
          onSubmit={handleProjectApprove}
        />
      </div>
    </div>
  );
}
