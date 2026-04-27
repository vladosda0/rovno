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
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Info,
  Layers,
  Loader2,
  Plus,
  Trash2,
  User,
} from "lucide-react";
import { TutorialModal } from "@/components/onboarding/TutorialModal";
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
import { useIsMobile } from "@/hooks/use-mobile";
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
import type { EstimateV2ProjectSyncState } from "@/data/estimate-v2-store";
import { getPlanningSource } from "@/data/planning-source";
import { addEvent, getUserById } from "@/data/store";
import { createWorkspaceProjectInvite, sendWorkspaceProjectInviteEmail } from "@/data/workspace-source";
import {
  computeLineTotals,
  computeProjectTotals,
  computeStageTotals,
  displayLineClientAmounts,
  roundHalfUpDiv,
  type ComputeLineTotalsOptions,
  type EstimateLineClientDisplayMode,
} from "@/lib/estimate-v2/pricing";
import { SHOW_ESTIMATE_VERSION_UI } from "@/lib/estimate-v2/show-estimate-version-ui";
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
  seamAllowsEstimateExportCsv,
  seamCanViewOperationalFinanceSummary,
  seamCanViewSensitiveDetail,
  seamEstimateFinanceVisibilityMode,
  usePermission,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { ApprovalStampCard } from "@/components/estimate-v2/ApprovalStampCard";
import { ApprovalStampFormModal } from "@/components/estimate-v2/ApprovalStampFormModal";
import { VersionBanner } from "@/components/estimate-v2/VersionBanner";
import { VersionDiffList } from "@/components/estimate-v2/VersionDiffList";
import { EstimateGantt } from "@/components/estimate-v2/gantt/EstimateGantt";
import {
  buildUnitSelectOptions,
  CUSTOM_UNIT_SENTINEL,
  getUnitLabel,
  getUnitOptionsForType,
  resolveUnitSelectValue,
} from "@/lib/estimate-v2/resource-units";
import { buildDefaultResourceLineName, getDefaultResourceLinePrefix } from "@/lib/estimate-v2/default-resource-line-name";
import {
  parsePersistedEstimateResourceType,
  resourceLineSemanticLabel,
  resourceLineTypeFromPersisted,
} from "@/lib/estimate-v2/resource-type-contract";
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
  return resourceLineSemanticLabel(type);
}

function semanticLabelKeyForType(type: ResourceLineType): string {
  return `estimate.resource.semantic.${type}`;
}

/** `other` lines created as “Overheads” default to titles like “Overhead 1”; use truck badge for those vs generic “Other”. */
function isDeliveryOverheadsOtherLine(type: ResourceLineType, title: string): boolean {
  return type === "other" && title.toLowerCase().includes("overhead");
}

function labelForRpcResourceTypeKey(key: string, t: (k: string) => string): string {
  const parsed = parsePersistedEstimateResourceType(key);
  return parsed.ok ? t(semanticLabelKeyForType(resourceLineTypeFromPersisted(parsed.db))) : key;
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
  return null;
}

function resolveTaskAssignee(task: Task): {
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
} {
  const fromList = task.assignees?.length
    ? (
      task.assignee_id
        ? task.assignees.find((entry) => entry.id === task.assignee_id)
        : task.assignees.find((entry) => entry.name?.trim() || entry.email?.trim())
    ) ?? task.assignees[0]
    : null;

  if (fromList) {
    const user = fromList.id ? getUserById(fromList.id) : null;
    return {
      assigneeId: fromList.id ?? null,
      assigneeName: fromList.name?.trim() || user?.name || null,
      assigneeEmail: fromList.email?.trim() || user?.email || null,
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

function effectiveDiscountForDisplay(line: EstimateV2ResourceLine, _stage: EstimateV2Stage, projectDiscountBps: number): number {
  if (line.discountBpsOverride != null && line.discountBpsOverride > 0) return line.discountBpsOverride;
  return projectDiscountBps;
}

function effectiveMarkupForDisplay(line: EstimateV2ResourceLine, projectMarkupBps: number): number {
  if (line.markupBps > 0) return line.markupBps;
  return projectMarkupBps;
}

function effectiveTaxForDisplay(line: EstimateV2ResourceLine, projectTaxBps: number): number {
  if (line.taxBpsOverride != null && line.taxBpsOverride > 0) return line.taxBpsOverride;
  return projectTaxBps;
}

function estimateStatusLabelKey(status: EstimateExecutionStatus): string {
  if (status === "planning") return "estimate.status.planning";
  if (status === "in_work") return "estimate.status.inWork";
  if (status === "paused") return "estimate.status.paused";
  return "estimate.status.finished";
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

const TIMING_TOOLTIP_KEYS: Record<
  "durationPlanned" | "durationEstimated" | "daysToEnd" | "behindSchedule",
  string
> = {
  durationPlanned: "estimate.tooltip.durationPlanned",
  durationEstimated: "estimate.tooltip.durationEstimated",
  daysToEnd: "estimate.tooltip.daysToEnd",
  behindSchedule: "estimate.tooltip.behindSchedule",
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

const RESOURCE_TYPE_OPTIONS: Array<{ value: ResourceLineType; labelKey: string }> = [
  { value: "material", labelKey: "estimate.resource.type.material" },
  { value: "tool", labelKey: "estimate.resource.type.tool" },
  { value: "labor", labelKey: "estimate.resource.type.labor" },
  { value: "subcontractor", labelKey: "estimate.resource.type.subcontractor" },
  { value: "other", labelKey: "estimate.resource.type.other" },
];

const RESOURCE_CREATE_OPTIONS: Array<{ labelKey: string; overheadLabelKey?: string; value: ResourceLineType }> = [
  { labelKey: "estimate.resource.createOption.material", value: "material" },
  { labelKey: "estimate.resource.createOption.tool", value: "tool" },
  { labelKey: "estimate.resource.createOption.hr", value: "labor" },
  { labelKey: "estimate.resource.createOption.overheads", overheadLabelKey: "estimate.resource.overheadsLabel", value: "other" },
  { labelKey: "estimate.resource.createOption.subcontractor", value: "subcontractor" },
  { labelKey: "estimate.resource.createOption.other", value: "other" },
];

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

type TFn = (key: string, options?: Record<string, unknown>) => string;

function deleteEntityLabel(kind: DeleteAssessment["kind"], t: TFn): string {
  if (kind === "resource") return t("estimate.delete.entity.resource");
  if (kind === "work") return t("estimate.delete.entity.work");
  return t("estimate.delete.entity.stage");
}

function deleteDialogTitle(assessment: DeleteAssessment, step: DeleteDialogStep, t: TFn): string {
  const label = deleteEntityLabel(assessment.kind, t);
  if (step === "financial") return t("estimate.delete.title.permanent", { entity: label });
  return t("estimate.delete.title.simple", { entity: label });
}

function simpleDeleteDescription(assessment: DeleteAssessment, t: TFn): string {
  if (assessment.kind === "resource") {
    return t("estimate.delete.desc.simple.resource");
  }
  if (assessment.kind === "work") {
    return t("estimate.delete.desc.simple.work");
  }
  return t("estimate.delete.desc.simple.stage");
}

function workExecutionDescription(assessment: DeleteAssessment, t: TFn): string {
  if (assessment.kind !== "work") return "";
  if (assessment.execution.isDone) {
    return t("estimate.delete.desc.execution.work.done");
  }
  if (assessment.execution.status === "in_progress") {
    return t("estimate.delete.desc.execution.work.inProgress");
  }
  if (assessment.execution.status === "blocked") {
    return t("estimate.delete.desc.execution.work.blocked");
  }
  return t("estimate.delete.desc.execution.work.started");
}

function executionDeleteDescription(assessment: DeleteAssessment, t: TFn): string {
  if (assessment.kind === "work") return workExecutionDescription(assessment, t);
  if (assessment.kind === "stage") {
    return t("estimate.delete.desc.execution.stage");
  }
  return simpleDeleteDescription(assessment, t);
}

function financialDeleteDescription(assessment: DeleteAssessment, t: TFn): string {
  const label = deleteEntityLabel(assessment.kind, t);
  return t("estimate.delete.desc.financial", { entity: label });
}

function pendingDeleteDescription(pendingDelete: PendingDeleteState, t: TFn): string {
  if (pendingDelete.step === "simple") return simpleDeleteDescription(pendingDelete.assessment, t);
  if (pendingDelete.step === "execution") return executionDeleteDescription(pendingDelete.assessment, t);
  return financialDeleteDescription(pendingDelete.assessment, t);
}

function pendingDeleteConfirmLabel(pendingDelete: PendingDeleteState, t: TFn): string {
  if (pendingDelete.step === "financial") return t("estimate.delete.confirm.permanent");
  if (pendingDelete.step === "execution" && getNextDeleteStep(pendingDelete.assessment, pendingDelete.step)) {
    return t("estimate.delete.confirm.continue");
  }
  return t("common.delete");
}

function procurementConsequenceLabel(
  consequence: DeleteAssessment["financial"]["procurement"][number],
  t: TFn,
): string {
  const statuses: string[] = [];
  if (consequence.orderedState === "partial") statuses.push(t("estimate.delete.procurement.partial"));
  if (consequence.orderedState === "full") statuses.push(t("estimate.delete.procurement.full"));
  if (consequence.inStock) statuses.push(t("estimate.delete.procurement.inStock"));
  return statuses.join(", ");
}

function hrConsequenceLabel(
  consequence: DeleteAssessment["financial"]["hr"][number],
  t: TFn,
): string {
  return consequence.paymentState === "full" ? t("estimate.delete.hr.full") : t("estimate.delete.hr.partial");
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

type WorkTableColumnDef = {
  key: string;
  title: ReactNode;
  widthPx: number;
  align?: "left" | "right";
  sticky?: boolean;
  hideOnMobile?: boolean;
};

function WorkTableFrame({
  className,
  columns,
  minWidthPx = 980,
  children,
}: {
  className?: string;
  columns: WorkTableColumnDef[];
  minWidthPx?: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const tableRef = useRef<HTMLTableElement | null>(null);
  const mirrorScrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({
    hasOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const updateScrollState = useCallback(() => {
    const tableNode = tableRef.current;
    const container = tableNode?.parentElement as HTMLDivElement | null;
    if (!tableNode || !container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const maxLeft = Math.max(0, scrollWidth - clientWidth);
    const edgeSlack = 3;
    const hasOverflow = scrollWidth > clientWidth + edgeSlack;
    const canScrollLeft = scrollLeft > edgeSlack;
    const canScrollRight = scrollLeft < maxLeft - edgeSlack;
    setScrollState((current) => {
      if (
        current.hasOverflow === hasOverflow
        && current.canScrollLeft === canScrollLeft
        && current.canScrollRight === canScrollRight
      ) {
        return current;
      }
      return { hasOverflow, canScrollLeft, canScrollRight };
    });
  }, []);

  useEffect(() => {
    const tableNode = tableRef.current;
    const container = tableNode?.parentElement as HTMLDivElement | null;
    if (!tableNode || !container) return undefined;

    const mirror = mirrorScrollRef.current;
    const syncScroll = () => {
      updateScrollState();
      if (mirror) mirror.scrollLeft = container.scrollLeft;
    };

    syncScroll();
    container.addEventListener("scroll", syncScroll, { passive: true });
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(syncScroll)
      : null;
    resizeObserver?.observe(container);
    resizeObserver?.observe(tableNode);

    return () => {
      container.removeEventListener("scroll", syncScroll);
      resizeObserver?.disconnect();
    };
  }, [updateScrollState]);

  const scrollTable = useCallback((direction: "left" | "right") => {
    const container = tableRef.current?.parentElement as HTMLDivElement | null;
    if (!container) return;
    const jump = Math.min(Math.round(container.clientWidth * 0.55), 420);
    container.scrollBy({ left: direction === "right" ? jump : -jump, behavior: "smooth" });
  }, []);

  const showEdgeHints = scrollState.hasOverflow;
  const showRightCue = showEdgeHints && scrollState.canScrollRight;
  const showLeftCue = showEdgeHints && scrollState.canScrollLeft;

  const isMobile = useIsMobile();
  const mobileVisibleWidth = useMemo(
    () => columns.filter((col) => !col.hideOnMobile).reduce((sum, col) => sum + col.widthPx, 0),
    [columns],
  );
  const effectiveMinWidth = isMobile ? mobileVisibleWidth : minWidthPx;

  return (
    <div className="relative space-y-1.5 pl-0 md:pl-4">
      <div className="sticky top-14 z-30 flex items-stretch rounded-md bg-card/95 shadow-sm ring-1 ring-border/60 backdrop-blur">
        <div ref={mirrorScrollRef} className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-stretch" style={{ minWidth: effectiveMinWidth }}>
            {columns.map((col) => (
              <div
                key={col.key}
                className={cn(
                  "flex items-center px-2 py-1.5 text-xs font-semibold text-muted-foreground shrink-0",
                  col.align === "right" ? "justify-end text-right tabular-nums" : "text-left",
                  col.sticky && "sticky left-0 z-10 border-r border-border bg-card",
                  col.hideOnMobile && "hidden md:flex",
                )}
                style={{ width: col.widthPx }}
              >
                <span className="truncate">{col.title}</span>
              </div>
            ))}
          </div>
        </div>
        {showEdgeHints ? (
          <div className="hidden md:flex shrink-0 items-center gap-1 border-l border-border/60 px-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-card/80 text-amber-600 shadow-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label={t("estimate.table.hiddenColumnsAria")}
                >
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[min(280px,calc(100vw-2rem))] text-left text-xs leading-snug">
                {t("estimate.table.hiddenColumnsTooltip")}
              </TooltipContent>
            </Tooltip>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 border-border/80 bg-card/90 shadow-sm"
                disabled={!scrollState.canScrollLeft}
                aria-label={t("estimate.table.scrollLeftAria")}
                title={t("estimate.table.scrollLeftTitle")}
                onClick={() => scrollTable("left")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  "h-7 w-7 border-border/80 bg-card/90 shadow-sm",
                  scrollState.canScrollRight
                  && !scrollState.canScrollLeft
                  && "motion-safe:animate-pulse",
                )}
                disabled={!scrollState.canScrollRight}
                aria-label={t("estimate.table.scrollRightAria")}
                title={t("estimate.table.scrollRightTitle")}
                onClick={() => scrollTable("right")}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="relative min-w-0">
        <Table
          ref={tableRef}
          className={className}
          wrapperClassName={cn(
            "relative w-full",
            "overflow-y-auto overflow-x-scroll",
            "[scrollbar-width:thin]",
            "[scrollbar-color:hsl(var(--muted-foreground)/0.4)_hsl(var(--muted)/0.35)]",
            "[&::-webkit-scrollbar]:h-2",
            "[&::-webkit-scrollbar-thumb]:rounded-full",
            "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/35",
            "[&::-webkit-scrollbar-track]:bg-muted/30",
          )}
        >
          <colgroup>
            {columns.map((col) => (
              <col
                key={col.key}
                className={cn(col.hideOnMobile && "hidden md:[display:table-column]")}
                style={{ width: col.widthPx }}
              />
            ))}
          </colgroup>
          {children}
        </Table>

        {showLeftCue ? (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-9 bg-gradient-to-r from-card/95 via-card/55 to-transparent md:block"
            aria-hidden
          />
        ) : null}
        {showRightCue ? (
          <div
            className="pointer-events-none absolute inset-y-0 right-0 z-10 hidden w-14 bg-gradient-to-l from-card via-card/90 to-transparent shadow-[inset_-12px_0_14px_-8px_hsl(var(--foreground)/0.08)] md:block"
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string | null, t: TFn): string | null {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 5_000) return t("common.time.justNow");
  if (diff < 60_000) return t("common.time.secondsAgo", { count: Math.round(diff / 1_000) });
  if (diff < 3_600_000) return t("common.time.minutesAgo", { count: Math.round(diff / 60_000) });
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function EstimateSyncStatusIndicator({ sync }: { sync: EstimateV2ProjectSyncState }) {
  const { t } = useTranslation();
  const status = sync.draftSaveStatus ?? "idle";
  const label = status === "saving" ? t("estimate.sync.saving")
    : status === "pending" ? t("estimate.sync.pending")
    : status === "saved" ? t("estimate.sync.saved", { time: formatRelativeTime(sync.draftSaveLastSucceededAt, t) ?? "" })
    : status === "error" ? t("estimate.sync.error")
    : null;

  if (!label) return null;

  const colorClass = status === "error"
    ? "text-destructive"
    : status === "saved"
      ? "text-muted-foreground"
      : "text-muted-foreground/70";

  return (
    <span className={`text-[11px] font-medium ${colorClass}`}>
      {label}
    </span>
  );
}

export default function ProjectEstimate() {
  const { t } = useTranslation();
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
    operationalUpperBlock,
    sync: estimateSync,
    isLoading: isEstimateLoading,
  } = useEstimateV2Project(pid);

  const currentMembership = members.find((member) => member.user_id === currentUser.id) ?? null;
  const canSubmitByMembership = currentMembership?.role === "owner" || currentMembership?.role === "co_owner";
  const projectMode = estimateProject.projectMode;
  const estimateAccess = getProjectDomainAccess(perm.seam, "estimate");
  const canViewSensitiveDetail = seamCanViewSensitiveDetail(perm.seam);
  const canViewOperationalFinanceSummary = seamCanViewOperationalFinanceSummary(perm.seam);
  const estimateFinanceMode = seamEstimateFinanceVisibilityMode(perm.seam);
  const canExportEstimateCsv = seamAllowsEstimateExportCsv(perm.seam);
  const canManageEstimate = projectDomainAllowsManage(estimateAccess);
  const canEditEstimate = canManageEstimate;
  const canSubmitToClient = canManageEstimate && canSubmitByMembership;
  const isContractorMode = projectMode === "contractor";
  const useReadOnlySummaryPricing = estimateFinanceMode === "summary"
    && !canEditEstimate
    && !isCurrentUserLoading
    && !isProjectLoading
    && !isMembersLoading
    && !isEstimateLoading;
  const showEstimateInternalPricing = estimateFinanceMode === "detail";
  const showEstimateMarkup = estimateFinanceMode === "detail" && isContractorMode;
  const showEstimateCommercialSummary = estimateFinanceMode === "detail" && isContractorMode;

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
  const [isTransitioningToInWork, setIsTransitioningToInWork] = useState(false);
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
          title: item.text || t("estimate.checklist.fallbackItemTitle"),
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

  const handleAssigneeInvite = useCallback(async (identity: { name: string; email: string }) => {
    if (!canEditEstimate) return;
    if (workspaceMode.kind === "pending-supabase") {
      toast({
        title: t("estimate.toast.inviteUnavailable.title"),
        description: t("estimate.toast.inviteUnavailable.description"),
        variant: "destructive",
      });
      return;
    }
    if (!currentUser.id) {
      toast({
        title: t("estimate.toast.inviteCreateFailed.title"),
        description: t("estimate.toast.inviteCreateFailed.description"),
        variant: "destructive",
      });
      return;
    }

    const normalizedEmail = identity.email.trim().toLowerCase();
    if (memberEmailSet.has(normalizedEmail)) {
      toast({
        title: t("estimate.toast.alreadyParticipant.title"),
        description: t("estimate.toast.alreadyParticipant.description", { email: normalizedEmail }),
      });
      return;
    }
    if (pendingInviteEmailSet.has(normalizedEmail)) {
      toast({
        title: t("estimate.toast.invitePending.title"),
        description: t("estimate.toast.invitePending.description", { email: normalizedEmail }),
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
              title: t("estimate.toast.inviteSent.title"),
              description: t("estimate.toast.inviteSent.description", {
                email: delivery.payload.recipientEmail || normalizedEmail,
                name: identity.name,
              }),
            });
          } else {
            toast({
              title: t("estimate.toast.inviteCreated.title"),
              description: t("estimate.toast.inviteCreated.description", { name: identity.name, email: normalizedEmail }),
            });
          }
        } catch (sendErr) {
          const message = sendErr instanceof Error ? sendErr.message : t("estimate.toast.inviteSendFailedFallback");
          toast({
            title: t("estimate.toast.inviteCreatedEmailFailed.title"),
            description: message,
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: t("estimate.toast.inviteCreated.title"),
          description: t("estimate.toast.inviteCreated.description", { name: identity.name, email: normalizedEmail }),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t("estimate.toast.inviteCreateFailedFallback");
      toast({
        title: t("estimate.toast.inviteFailed.title"),
        description: message,
        variant: "destructive",
      });
    }
  }, [canEditEstimate, currentUser.id, memberEmailSet, pendingInviteEmailSet, pid, projectMode, t, toast, workspaceMode]);

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

  const lineTotalsComputeOptions = useMemo((): ComputeLineTotalsOptions | undefined => {
    // Owner/Co-owner (detail finance mode): never read persisted RPC snapshot —
    // always recompute from live fields so edits to cost/qty/markup/discount-override
    // flow into Client Unit/Total immediately.
    if (estimateFinanceMode === "detail") return undefined;
    return useReadOnlySummaryPricing ? { preferPersistedClientSnapshot: true } : undefined;
  }, [estimateFinanceMode, useReadOnlySummaryPricing]);

  const lineClientDisplayMode = useMemo<EstimateLineClientDisplayMode>(() => {
    if (estimateFinanceMode === "none") return "none";
    if (estimateFinanceMode === "detail") return "detail";
    return useReadOnlySummaryPricing ? "summary" : "detail";
  }, [estimateFinanceMode, useReadOnlySummaryPricing]);

  const lineTotalsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeLineTotals>>();
    lines.forEach((line) => {
      const stage = stageById.get(line.stageId);
      if (!stage) return;
      map.set(line.id, computeLineTotals(line, stage, estimateProject, projectMode, lineTotalsComputeOptions));
    });
    return map;
  }, [estimateProject, lines, projectMode, stageById, lineTotalsComputeOptions]);

  const hasSummaryClientPricingOnAnyLine = useMemo(() => (
    lines.some((line) => (
      typeof line.summaryClientUnitCents === "number" && Number.isFinite(line.summaryClientUnitCents)
      && typeof line.summaryClientTotalCents === "number" && Number.isFinite(line.summaryClientTotalCents)
    ))
  ), [lines]);

  const totals = useMemo(
    () => computeProjectTotals(estimateProject, stages, works, lines, projectMode, lineTotalsComputeOptions),
    [estimateProject, stages, works, lines, projectMode, lineTotalsComputeOptions],
  );

  const rpcSummarySubtotalCents =
    useReadOnlySummaryPricing && operationalUpperBlock?.clientTotalCents != null
      ? operationalUpperBlock.clientTotalCents
      : null;
  const rpcSummaryVatBps =
    operationalUpperBlock?.vatBps != null && Number.isFinite(operationalUpperBlock.vatBps)
      ? operationalUpperBlock.vatBps
      : estimateProject.taxBps;
  const rpcSummaryTaxCents = rpcSummarySubtotalCents != null
    ? roundHalfUpDiv(rpcSummarySubtotalCents * rpcSummaryVatBps, 10_000)
    : null;
  const rpcSummaryTotalIncVatCents = rpcSummarySubtotalCents != null && rpcSummaryTaxCents != null
    ? rpcSummarySubtotalCents + rpcSummaryTaxCents
    : null;

  const uiTaxAmountCents = rpcSummaryTaxCents ?? totals.taxAmountCents;
  const uiTotalIncVatCents = rpcSummaryTotalIncVatCents ?? totals.totalCents;
  const uiTaxableBaseCents = rpcSummarySubtotalCents ?? totals.taxableBaseCents;

  const stageTotalsById = useMemo(
    () => new Map(
      computeStageTotals(estimateProject, stages, lines, projectMode, lineTotalsComputeOptions).map((item) => [item.stageId, item]),
    ),
    [estimateProject, stages, lines, projectMode, lineTotalsComputeOptions],
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
    projectMode,
    isOwner: canSubmitToClient,
    hasProposedVersion: Boolean(latestProposed),
  });
  const showEstimateWorkspace = estimateEditorStarted || estimateHasSavedContent;
  const reviewExpandedByDefault = false;
  const approvedVersionWithStamp = latestApproved?.approvalStamp ? latestApproved : null;
  const latestVersionNumber = useMemo(
    () => versions.reduce((max, version) => Math.max(max, version.number), 1),
    [versions],
  );
  const latestVersionApproved = Boolean(
    latestApproved
    && (!latestProposed || latestApproved.number >= latestProposed.number),
  );
  const financialBreakdownTypeRows: Array<{ label: string; amountCents: number }> = [
    { label: t("estimate.breakdown.materialCost"), amountCents: totals.breakdownByType.material },
    { label: t("estimate.breakdown.toolCost"), amountCents: totals.breakdownByType.tool },
    { label: t("estimate.breakdown.laborCost"), amountCents: totals.breakdownByType.labor },
    { label: t("estimate.breakdown.subcontractorCost"), amountCents: totals.breakdownByType.subcontractor },
    { label: t("estimate.breakdown.otherCost"), amountCents: totals.breakdownByType.other },
  ];
  const financialBreakdownSummaryRows: Array<{ label: string; amountCents: number; emphasized?: boolean }> = [
    ...(isContractorMode ? [{ label: t("estimate.breakdown.markup"), amountCents: totals.markupTotalCents }] : []),
    { label: t("estimate.breakdown.subtotalExVat"), amountCents: totals.subtotalBeforeDiscountCents },
    { label: t("estimate.breakdown.discount"), amountCents: totals.discountTotalCents },
    { label: t("estimate.breakdown.vatAmount"), amountCents: totals.taxAmountCents },
    { label: t("estimate.breakdown.totalIncVat"), amountCents: totals.totalCents, emphasized: true },
  ];
  const planVsActualRows = (["material", "tool", "labor", "subcontractor", "other"] as const).map((type) => ({
    label: t(semanticLabelKeyForType(type)),
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
      setIsTransitioningToInWork(true);
      try {
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
              title: result.blocking ? t("estimate.toast.transitionBlocked") : t("estimate.toast.statusUpdateFailed"),
              description: result.errorMessage ?? t("estimate.toast.transitionRetryFallback"),
              variant: "destructive",
            });
            return;
          }

          toast({ title: t("estimate.toast.ownerOnly"), variant: "destructive" });
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
          toast({ title: t("estimate.toast.statusUpdated"), description: t("estimate.toast.autoScheduledDesc") });
          return;
        }

        toast({ title: t("estimate.toast.statusUpdated") });
        return;
      } finally {
        setIsTransitioningToInWork(false);
      }
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
      toast({ title: t("estimate.toast.ownerOnly"), variant: "destructive" });
      return;
    }

    setMissingDatesWorkIds([]);
    setIncompleteTaskBlocks([]);

    if (result.autoScheduled) {
      toast({ title: t("estimate.toast.statusUpdated"), description: t("estimate.toast.autoScheduledDesc") });
      return;
    }
    toast({ title: t("estimate.toast.statusUpdated") });
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
      toast({ title: t("estimate.toast.allTasksDone") });
    } catch (error) {
      toast({
        title: t("estimate.toast.markAllTasksFailed.title"),
        description: error instanceof Error ? error.message : t("estimate.toast.markAllTasksFailed.description"),
        variant: "destructive",
      });
    }
  }, [canEditEstimate, pid, queryClient, t, tasks, toast, workspaceMode]);

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
      toast({ title: t("estimate.toast.copyFailed.title"), description: t("estimate.toast.copyFailed.description"), variant: "destructive" });
      return false;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: t("estimate.toast.shareCopied") });
      return true;
    } catch {
      toast({ title: t("estimate.toast.copyFailed.title"), description: t("estimate.toast.copyFailed.description"), variant: "destructive" });
      return false;
    }
  }, [t, toast]);

  const submitToClientRecipients = useCallback((recipients: ClientRecipient[]) => {
    if (!canSubmitToClient) return;
    if (submitState.submitDisabled) {
      toast({ title: submitState.submitDisabledReason ?? t("estimate.toast.noChangesFallback"), variant: "destructive" });
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
      toast({ title: t("estimate.toast.submitRoleRequired"), variant: "destructive" });
      return;
    }

    if (hasDirectRecipients) {
      const recipientEmails = recipients.map((recipient) => recipient.email).join(", ");
      toast({
        title: pendingProposed && latestProposed ? t("estimate.toast.resubmitted") : t("estimate.toast.submitted"),
        description: recipientEmails,
      });
      return;
    }

    const shareLink = buildShareLink(shareId);
    void copyShareLink(shareLink);
    if (previewOnly) {
      setShareLinkModalState({
        title: t("estimate.share.noSlotsTitle"),
        description: t("estimate.share.noSlotsDesc"),
        link: shareLink,
        suggestUpgrade: true,
      });
      return;
    }
    setShareLinkModalState({
      title: t("estimate.share.noClientTitle"),
      description: t("estimate.share.noClientDesc"),
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
    t,
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
      toast({ title: t("estimate.toast.selectRecipient"), variant: "destructive" });
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
      toast({ title: t("estimate.toast.approveFailed"), variant: "destructive" });
      return;
    }
    setApprovalModalOpen(false);
    toast({ title: t("estimate.toast.approved") });
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
      payload: { text: t("estimate.event.clientQuestion") },
    });
    toast({ title: t("estimate.toast.questionSent") });
  };

  const handleExportCsv = () => {
    if (!canExportEstimateCsv) return;

    const rows: string[][] = [];
    rows.push([t("estimate.csv.title")]);
    rows.push([t("estimate.csv.project"), estimateProject.title]);
    rows.push([t("estimate.csv.mode"), projectMode]);
    rows.push([]);

    const summaryFinancialExport = !canViewSensitiveDetail
      && canViewOperationalFinanceSummary
      && hasSummaryClientPricingOnAnyLine;
    const requireSummaryRpcForExport = canViewOperationalFinanceSummary && !canViewSensitiveDetail;
    const exportDiscountedColumn = summaryFinancialExport && lines.some(
      (line) => typeof line.summaryDiscountedClientTotalCents === "number",
    );

    const csvH = {
      stage: t("estimate.csv.header.stage"),
      work: t("estimate.csv.header.work"),
      line: t("estimate.csv.header.line"),
      qty: t("estimate.csv.header.qty"),
      unit: t("estimate.csv.header.unit"),
      type: t("estimate.csv.header.type"),
      costUnit: t("estimate.csv.header.costUnit"),
      costTotal: t("estimate.csv.header.costTotal"),
      markupPct: t("estimate.csv.header.markupPct"),
      discountPct: t("estimate.csv.header.discountPct"),
      clientUnit: t("estimate.csv.header.clientUnit"),
      clientTotal: t("estimate.csv.header.clientTotal"),
      discountedClientTotal: t("estimate.csv.header.discountedClientTotal"),
    };
    if (!canViewSensitiveDetail && !summaryFinancialExport) {
      rows.push([csvH.stage, csvH.work, csvH.line, csvH.qty, csvH.unit]);
    } else if (!canViewSensitiveDetail && summaryFinancialExport) {
      rows.push(
        exportDiscountedColumn
          ? [csvH.stage, csvH.work, csvH.line, csvH.qty, csvH.unit, csvH.clientUnit, csvH.clientTotal, csvH.discountedClientTotal]
          : [csvH.stage, csvH.work, csvH.line, csvH.qty, csvH.unit, csvH.clientUnit, csvH.clientTotal],
      );
    } else if (projectMode === "contractor") {
      rows.push([csvH.stage, csvH.work, csvH.line, csvH.type, csvH.qty, csvH.unit, csvH.costUnit, csvH.costTotal, csvH.markupPct, csvH.discountPct, csvH.clientUnit, csvH.clientTotal]);
    } else if (projectMode === "build_myself") {
      rows.push([csvH.stage, csvH.work, csvH.line, csvH.type, csvH.qty, csvH.unit, csvH.costUnit, csvH.costTotal, csvH.discountPct, csvH.clientUnit, csvH.clientTotal]);
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
              const clientMoney = displayLineClientAmounts(line, lineTotals, {
                financeMode: requireSummaryRpcForExport ? "summary" : "detail",
              });
              const discounted = typeof line.summaryDiscountedClientTotalCents === "number"
                ? money(line.summaryDiscountedClientTotalCents, estimateProject.currency)
                : "—";
              rows.push(
                exportDiscountedColumn
                  ? [
                    stage.title,
                    work.title,
                    line.title,
                    qtyFromMilli(line.qtyMilli),
                    line.unit,
                    clientMoney ? money(clientMoney.clientUnitCents, estimateProject.currency) : "—",
                    clientMoney ? money(clientMoney.clientTotalCents, estimateProject.currency) : "—",
                    discounted,
                  ]
                  : [
                    stage.title,
                    work.title,
                    line.title,
                    qtyFromMilli(line.qtyMilli),
                    line.unit,
                    clientMoney ? money(clientMoney.clientUnitCents, estimateProject.currency) : "—",
                    clientMoney ? money(clientMoney.clientTotalCents, estimateProject.currency) : "—",
                  ],
              );
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

          const clientForCsv = displayLineClientAmounts(line, lineTotals, { financeMode: "detail" })
            ?? { clientUnitCents: lineTotals.clientUnitCents, clientTotalCents: lineTotals.clientTotalCents };
          const clientUnitStr = money(clientForCsv.clientUnitCents, estimateProject.currency);
          const clientTotalStr = money(clientForCsv.clientTotalCents, estimateProject.currency);

          if (projectMode === "contractor") {
            rows.push([
              stage.title,
              work.title,
              line.title,
              t(semanticLabelKeyForType(line.type)),
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
            t(semanticLabelKeyForType(line.type)),
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
      rows.push([t("estimate.csv.subtotalExVat"), money(totals.subtotalBeforeDiscountCents, estimateProject.currency)]);
      rows.push([t("estimate.csv.discount"), money(totals.discountTotalCents, estimateProject.currency)]);
      rows.push([t("estimate.csv.taxableBaseExVat"), money(totals.taxableBaseCents, estimateProject.currency)]);
    }
    rows.push([
      t("estimate.csv.tax"),
      `${((operationalUpperBlock?.vatBps ?? estimateProject.taxBps) / 100).toFixed(2)}%`,
    ]);
    rows.push([t("estimate.csv.taxAmount"), money(uiTaxAmountCents, estimateProject.currency)]);
    rows.push([t("estimate.csv.totalIncVat"), money(uiTotalIncVatCents, estimateProject.currency)]);

    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `estimate-v2-${pid}-${canViewSensitiveDetail ? projectMode : "operational"}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({ title: t("estimate.toast.exportDone") });
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
    const created = createStage(pid, { title: t("estimate.stage.newTitle") });
    if (!created) return;
    trackEvent("estimate_stage_created", { project_id: pid });
    setPendingStageTitleEditId(created.id);
  };

  const handleCreateWork = (stageId: string) => {
    const created = createWork(pid, { stageId, title: t("estimate.work.newTitle") });
    if (!created) return;
    trackEvent("estimate_work_created", { project_id: pid, stage_id: stageId });
    setPendingWorkTitleEditId(created.id);
  };

  const handleCreateResourceLine = (
    stageId: string,
    workId: string,
    option: { value: ResourceLineType },
  ) => {
    const localizedPrefix = t(`estimate.resource.defaultPrefix.${option.value}`);
    const canonicalPrefix = getDefaultResourceLinePrefix(option.value);
    const detectPrefixes =
      localizedPrefix === canonicalPrefix ? [localizedPrefix] : [localizedPrefix, canonicalPrefix];
    const defaultTitle = buildDefaultResourceLineName(linesByWork.get(workId) ?? [], option.value, {
      prefix: localizedPrefix,
      detectPrefixes,
    });
    suppressResourceCreateAutoFocusRef.current = true;
    const defaultUnit = getUnitOptionsForType(option.value)[0] ?? "pcs";
    const created = createLine(pid, {
      stageId,
      workId,
      title: defaultTitle,
      type: option.value,
      unit: defaultUnit,
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
    return <EmptyState icon={AlertTriangle} title={t("estimate.error.notFound.title")} description={t("estimate.error.notFound.description")} />;
  }

  return (
    <div className="space-y-sp-2 p-0 md:p-sp-2">
      <TutorialModal
        tutorialKey="estimate_flow"
        steps={[
          {
            titleKey: "tutorial.estimateFlow.step1.title",
            descriptionKey: "tutorial.estimateFlow.step1.description",
            visual: (
              <div className="w-full space-y-1.5 text-left">
                <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-caption">
                  <span className="font-medium text-foreground">{t("tutorial.estimateFlow.step1.row1Label")}</span>
                  <span className="tabular-nums text-muted-foreground">10 × 1 500 ₽</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-caption">
                  <span className="font-medium text-foreground">{t("tutorial.estimateFlow.step1.row2Label")}</span>
                  <span className="tabular-nums text-muted-foreground">6 × 4 200 ₽</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-caption">
                  <span className="font-medium text-foreground">{t("tutorial.estimateFlow.step1.totalLabel")}</span>
                  <span className="tabular-nums font-semibold text-foreground">40 200 ₽</span>
                </div>
              </div>
            ),
            icon: <BookOpen className="h-8 w-8 text-accent" />,
          },
          {
            titleKey: "tutorial.estimateFlow.step2.title",
            descriptionKey: "tutorial.estimateFlow.step2.description",
            visual: (
              <div className="flex items-center justify-center gap-2">
                <span className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-caption font-semibold text-sky-600 dark:text-sky-300">{t("estimate.status.planning")}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-caption font-semibold text-emerald-600 dark:text-emerald-300">{t("estimate.status.inWork")}</span>
              </div>
            ),
            icon: <ArrowRight className="h-8 w-8 text-accent" />,
          },
          {
            titleKey: "tutorial.estimateFlow.step3.title",
            descriptionKey: "tutorial.estimateFlow.step3.description",
            visual: (
              <div className="w-full space-y-1.5">
                <div className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-caption">
                  <span className="font-medium text-muted-foreground">{t("tutorial.estimateFlow.step3.internalLabel")}</span>
                  <span className="tabular-nums text-muted-foreground">32 000 ₽</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-caption">
                  <span className="font-semibold text-foreground">{t("tutorial.estimateFlow.step3.clientLabel")}</span>
                  <span className="tabular-nums font-semibold text-foreground">40 200 ₽</span>
                </div>
              </div>
            ),
            icon: <Layers className="h-8 w-8 text-accent" />,
          },
        ]}
      />
      <div className="space-y-3 md:rounded-card md:border md:border-border md:bg-card md:p-sp-2">
        <div className="flex flex-wrap items-start justify-between gap-3 lg:flex-nowrap">
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="truncate text-xl font-semibold text-foreground">{project.title}</h2>
            {showEstimateWorkspace && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">{t("estimate.header.statusLabel")}</span>
                <Select
                  value={estimateProject.estimateStatus}
                  onValueChange={(value) => handleEstimateStatusChange(value as EstimateExecutionStatus)}
                  disabled={!canEditEstimate || isTransitioningToInWork}
                >
                  <SelectTrigger className={`h-8 w-auto min-w-[116px] rounded-md border px-3 text-xs font-semibold shadow-none ${estimateStatusClassName(estimateProject.estimateStatus)}`}>
                    <span className="flex items-center gap-1.5">
                      <span>{t(estimateStatusLabelKey(estimateProject.estimateStatus))}</span>
                      {isTransitioningToInWork ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_work">{t("estimate.status.inWork")}</SelectItem>
                    <SelectItem value="paused">{t("estimate.status.paused")}</SelectItem>
                    <SelectItem value="finished">{t("estimate.status.finished")}</SelectItem>
                  </SelectContent>
                </Select>

                {SHOW_ESTIMATE_VERSION_UI ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Badge
                          variant="secondary"
                          className={latestVersionApproved ? "border border-success/20 bg-success/10 text-success" : "border border-warning/20 bg-warning/10 text-warning-foreground"}
                        >
                          {t("estimate.header.versionBadge", { version: latestVersionNumber })}
                        </Badge>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      {t("estimate.header.versionTooltip")}
                    </TooltipContent>
                  </Tooltip>
                ) : null}
                <EstimateSyncStatusIndicator sync={estimateSync} />
              </div>
            )}
          </div>

          {showEstimateWorkspace && (
            <div className="flex w-full min-w-0 flex-col items-start gap-1 lg:w-auto lg:items-end">
              <div className="flex w-full flex-wrap items-center gap-2 lg:justify-end">
                {canExportEstimateCsv && (
                  <Button variant="outline" size="sm" onClick={handleExportCsv}>
                    <Download className="mr-1 h-4 w-4" /> {t("estimate.header.exportCsv")}
                  </Button>
                )}

                {ctaState.showSubmit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-accent/30 text-accent hover:bg-accent/10"
                    onClick={handleSubmitToClient}
                    disabled={submitState.submitDisabled}
                    title={submitState.submitDisabledReason ?? undefined}
                  >
                    {t("estimate.header.submitToClient")}
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
                    {t("estimate.header.approve")}
                  </Button>
                )}
              </div>

              {(!canEditEstimate || (ctaState.showApprove && ctaState.approveDisabledReason) || (ctaState.showSubmit && submitState.submitDisabledReason)) && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-caption text-muted-foreground lg:justify-end">
                  {!canEditEstimate && <span>{t("estimate.header.ownerOnly")}</span>}
                  {ctaState.showApprove && ctaState.approveDisabledReason && <span>{ctaState.approveDisabledReason}</span>}
                  {ctaState.showSubmit && submitState.submitDisabledReason && <span>{submitState.submitDisabledReason}</span>}
                </div>
              )}
            </div>
          )}
        </div>

        {showEstimateWorkspace && (isInWork ? (
          <div className="rounded-lg border border-border p-3">
            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {estimateFinanceMode === "detail" && (
                    <>
                      <p className="col-span-2 text-sm font-semibold text-foreground md:col-span-3 lg:col-span-4">{t("estimate.summary.financial")}</p>
                      <div className="rounded-md bg-muted/30 px-2.5 py-2">
                        <p className="text-[11px] text-muted-foreground">{t("estimate.summary.plannedTotal")}</p>
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {money(combinedPlanFact.planned.plannedBudgetCents, estimateProject.currency)}
                        </p>
                      </div>
                      <div className="rounded-md bg-muted/30 px-2.5 py-2">
                        <p className="text-[11px] text-muted-foreground">{t("estimate.summary.actualSpent")}</p>
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {hasActualFinancialData ? money(combinedPlanFact.fact.spentCents, estimateProject.currency) : "—"}
                        </p>
                      </div>
                      <div className="rounded-md bg-muted/30 px-2.5 py-2">
                        <p className="text-[11px] text-muted-foreground">{t("estimate.summary.overUnder")}</p>
                        <p className={`text-sm font-semibold tabular-nums ${
                          hasActualFinancialData
                            && combinedPlanFact.fact.spentCents - combinedPlanFact.planned.plannedBudgetCents > 0
                              ? "text-destructive"
                              : "text-foreground"
                        }`}>
                          {hasActualFinancialData
                            ? money(combinedPlanFact.fact.spentCents - combinedPlanFact.planned.plannedBudgetCents, estimateProject.currency)
                            : "—"}
                        </p>
                        {hasActualFinancialData
                          && combinedPlanFact.fact.spentCents - combinedPlanFact.planned.plannedBudgetCents > 0 && (
                            <p className="text-[11px] font-medium text-destructive">{t("estimate.budgetExceeded")}</p>
                          )}
                      </div>
                      <div className="rounded-md bg-muted/30 px-2.5 py-2">
                        <p className="text-[11px] text-muted-foreground">{t("estimate.summary.toBePaid")}</p>
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {money(combinedPlanFact.fact.toBePaidPlannedCents, estimateProject.currency)}
                        </p>
                      </div>
                    </>
                  )}
                  {useReadOnlySummaryPricing && operationalUpperBlock && (
                    <>
                      <p className="col-span-2 text-sm font-semibold text-foreground md:col-span-3 lg:col-span-4">{t("estimate.summary.financial")}</p>
                      {operationalUpperBlock.clientTotalCents != null && (
                        <div className="rounded-md bg-muted/30 px-2.5 py-2">
                          <p className="text-[11px] text-muted-foreground">{t("estimate.summary.clientTotalExVat")}</p>
                          <p className="text-sm font-semibold tabular-nums text-foreground">
                            {money(operationalUpperBlock.clientTotalCents, estimateProject.currency)}
                          </p>
                        </div>
                      )}
                      <div className="rounded-md bg-muted/30 px-2.5 py-2">
                        <p className="text-[11px] text-muted-foreground">{t("estimate.summary.vatRate")}</p>
                        <p className="text-sm font-semibold tabular-nums text-foreground">
                          {fromBpsToPercent(operationalUpperBlock.vatBps ?? estimateProject.taxBps)}%
                        </p>
                      </div>
                      {operationalUpperBlock.discountBps != null && operationalUpperBlock.discountBps > 0 && (
                        <div className="rounded-md bg-muted/30 px-2.5 py-2">
                          <p className="text-[11px] text-muted-foreground">{t("estimate.summary.discountMax")}</p>
                          <p className="text-sm font-semibold tabular-nums text-foreground">
                            {fromBpsToPercent(operationalUpperBlock.discountBps)}%
                          </p>
                        </div>
                      )}
                      {rpcSummaryTotalIncVatCents != null && (
                        <div className="rounded-md bg-muted/30 px-2.5 py-2">
                          <p className="text-[11px] text-muted-foreground">{t("estimate.summary.totalIncVat")}</p>
                          <p className="text-sm font-semibold tabular-nums text-foreground">
                            {money(rpcSummaryTotalIncVatCents, estimateProject.currency)}
                          </p>
                        </div>
                      )}
                      {operationalUpperBlock.resourceCostBreakdownClientSafeOnly
                        && Object.keys(operationalUpperBlock.resourceCostBreakdownClientSafeOnly).length > 0 && (
                        <div className="col-span-2 rounded-md bg-muted/30 px-2.5 py-2 md:col-span-3 lg:col-span-4">
                          <p className="text-[11px] text-muted-foreground">{t("estimate.summary.byResourceTypeClient")}</p>
                          <div className="mt-1 space-y-1">
                            {Object.entries(operationalUpperBlock.resourceCostBreakdownClientSafeOnly).map(([key, cents]) => (
                              <div key={key} className="flex justify-between text-sm">
                                <span className="text-muted-foreground">{labelForRpcResourceTypeKey(key, t)}</span>
                                <span className="font-medium tabular-nums text-foreground">{money(cents, estimateProject.currency)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                  <p className="col-span-2 text-sm font-semibold text-foreground md:col-span-3 lg:col-span-4">{t("estimate.summary.timing")}</p>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {t("estimate.summary.daysToEnd")}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t(TIMING_TOOLTIP_KEYS.daysToEnd)}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {timingMetrics.daysToEnd == null ? "—" : t("estimate.summary.dayUnit", { count: timingMetrics.daysToEnd })}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {t("estimate.summary.behindSchedule")}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t(TIMING_TOOLTIP_KEYS.behindSchedule)}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{t("estimate.summary.dayUnit", { count: timingMetrics.behindScheduleDays })}</p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {t("estimate.summary.durationPlanned")}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t(TIMING_TOOLTIP_KEYS.durationPlanned)}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {timingMetrics.durationPlannedDays == null ? "—" : t("estimate.summary.dayUnit", { count: timingMetrics.durationPlannedDays })}
                    </p>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2.5 py-2">
                    <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {t("estimate.summary.durationEstimated")}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button type="button" className="text-muted-foreground hover:text-foreground">
                            <Info className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t(TIMING_TOOLTIP_KEYS.durationEstimated)}</TooltipContent>
                      </Tooltip>
                    </p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {timingMetrics.durationEstimatedDays == null ? "—" : t("estimate.summary.dayUnit", { count: timingMetrics.durationEstimatedDays })}
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
                            {t("estimate.costOverview.title")}
                          </span>
                          <span className="text-caption tabular-nums text-muted-foreground">
                            {money(totals.totalCents, estimateProject.currency)}
                          </span>
                        </button>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="border-t border-border/60 px-3 py-3">
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          <div className="space-y-2 rounded-md border border-border/60 bg-background/30 p-3">
                            <p className="text-sm font-semibold text-foreground">{t("estimate.costOverview.financialBreakdown")}</p>
                            <div className="space-y-2">
                              <button
                                type="button"
                                className="flex w-full items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-left text-sm hover:bg-muted/30"
                                onClick={() => setFinancialResourcesExpanded((current) => !current)}
                              >
                                <span className="inline-flex items-center gap-1 text-muted-foreground">
                                  {financialResourcesExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                  {t("estimate.costOverview.resources")}
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
                            <p className="text-sm font-semibold text-foreground">{t("estimate.costOverview.planVsActual")}</p>
                            <div className="grid grid-cols-[minmax(0,1fr)_minmax(112px,auto)_minmax(112px,auto)] gap-3 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                              <span>{t("estimate.costOverview.col.category")}</span>
                              <span className="text-right">{t("estimate.costOverview.col.planned")}</span>
                              <span className="text-right">{t("estimate.costOverview.col.actual")}</span>
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
                                <span className="font-medium text-foreground">{t("estimate.costOverview.total")}</span>
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
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-foreground">{t("estimate.summary.timing")}</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-caption">
                <div className="rounded-md border border-border/70 p-2">
                  <p className="text-muted-foreground">{t("estimate.planning.durationRange")}</p>
                  <p className="text-sm font-medium text-foreground">{planningRangeLabel}</p>
                </div>
                <div className="rounded-md border border-border/70 p-2">
                  <p className="text-muted-foreground">{t("estimate.planning.durationDays")}</p>
                  <p className="text-sm font-medium text-foreground">{planningDurationDays == null ? "—" : t("estimate.summary.dayUnit", { count: planningDurationDays })}</p>
                </div>
                <div className="rounded-md border border-border/70 p-2">
                  <p className="text-muted-foreground">{t("estimate.summary.daysToEnd")}</p>
                  <p className="text-sm font-medium text-foreground">
                    {timingMetrics.daysToEnd == null ? "—" : t("estimate.summary.dayUnit", { count: timingMetrics.daysToEnd })}
                  </p>
                </div>
                <div className="rounded-md border border-border/70 p-2">
                  <p className="text-muted-foreground">{t("estimate.summary.behindSchedule")}</p>
                  <p className="text-sm font-medium text-foreground">{t("estimate.summary.dayUnit", { count: timingMetrics.behindScheduleDays })}</p>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-semibold text-foreground">{t("estimate.summary.financial")}</p>
              {estimateFinanceMode === "none" ? (
                <p className="mt-2 text-caption text-muted-foreground">
                  {t("estimate.planning.financeHidden")}
                </p>
              ) : useReadOnlySummaryPricing && operationalUpperBlock ? (
                <div className="mt-2 space-y-2 text-caption">
                  {operationalUpperBlock.clientTotalCents != null && (
                    <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                      <span className="text-muted-foreground">{t("estimate.summary.clientTotalExVat")}</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {money(operationalUpperBlock.clientTotalCents, estimateProject.currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                    <span className="text-muted-foreground">{t("estimate.summary.vatRate")}</span>
                    <span className="font-medium tabular-nums text-foreground">
                      {fromBpsToPercent(operationalUpperBlock.vatBps ?? estimateProject.taxBps)}%
                    </span>
                  </div>
                  {operationalUpperBlock.discountBps != null && operationalUpperBlock.discountBps > 0 && (
                    <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                      <span className="text-muted-foreground">{t("estimate.summary.discountMax")}</span>
                      <span className="font-medium tabular-nums text-foreground">
                        {fromBpsToPercent(operationalUpperBlock.discountBps)}%
                      </span>
                    </div>
                  )}
                  {operationalUpperBlock.resourceCostBreakdownClientSafeOnly
                    && Object.keys(operationalUpperBlock.resourceCostBreakdownClientSafeOnly).length > 0 && (
                    <div className="space-y-1 rounded-md border border-border/70 px-2 py-2">
                      <span className="text-muted-foreground">{t("estimate.summary.byResourceTypeClient")}</span>
                      {Object.entries(operationalUpperBlock.resourceCostBreakdownClientSafeOnly).map(([key, cents]) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{labelForRpcResourceTypeKey(key, t)}</span>
                          <span className="tabular-nums text-foreground">{money(cents, estimateProject.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-2 py-1">
                    <span className="font-medium text-foreground">{t("estimate.summary.totalIncVat")}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {money(uiTotalIncVatCents, estimateProject.currency)}
                    </span>
                  </div>
                </div>
              ) : !canViewSensitiveDetail ? (
                <div className="mt-2 rounded-md border border-border/70 p-2">
                  <p className="text-xs text-muted-foreground">{t("estimate.summary.totalIncVat")}</p>
                  <p className="text-2xl font-semibold text-foreground">{money(uiTotalIncVatCents, estimateProject.currency)}</p>
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
                      {t("estimate.costOverview.resources")}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{money(resourcesTotalCents, estimateProject.currency)}</span>
                  </button>
                  {financialResourcesExpanded && (
                    <div className="space-y-1 pl-5">
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">{t("estimate.breakdown.materialCost")}</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.material, estimateProject.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">{t("estimate.breakdown.toolCost")}</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.tool, estimateProject.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">{t("estimate.breakdown.laborCost")}</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.labor, estimateProject.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">{t("estimate.breakdown.subcontractorCost")}</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.subcontractor, estimateProject.currency)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1">
                        <span className="text-muted-foreground">{t("estimate.breakdown.otherCost")}</span>
                        <span className="tabular-nums text-foreground">{money(totals.breakdownByType.other, estimateProject.currency)}</span>
                      </div>
                    </div>
                  )}
                  {showEstimateCommercialSummary && (
                    <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                      <span className="text-muted-foreground">{t("estimate.breakdown.markup")}</span>
                      <span className="tabular-nums text-foreground">{money(totals.markupTotalCents, estimateProject.currency)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                    <span className="text-muted-foreground">{t("estimate.breakdown.subtotalExVat")}</span>
                    <span className="tabular-nums text-foreground">{money(totals.subtotalBeforeDiscountCents, estimateProject.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                    <span className="text-muted-foreground">{t("estimate.breakdown.discount")}</span>
                    <span className="tabular-nums text-foreground">{money(totals.discountTotalCents, estimateProject.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/70 px-2 py-1">
                    <span className="text-muted-foreground">{t("estimate.breakdown.vatAmount")}</span>
                    <span className="tabular-nums text-foreground">{money(totals.taxAmountCents, estimateProject.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-2 py-1">
                    <span className="font-medium text-foreground">{t("estimate.breakdown.totalIncVat")}</span>
                    <span className="font-semibold tabular-nums text-foreground">{money(totals.totalCents, estimateProject.currency)}</span>
                  </div>
                  {showEstimateCommercialSummary && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-md border border-border/70 p-2">
                        <p className="text-muted-foreground">{t("estimate.planning.profitExVat")}</p>
                        <p className="text-sm font-medium text-foreground">{money(profitExVatCents, estimateProject.currency)}</p>
                      </div>
                      <div className="rounded-md border border-border/70 p-2">
                        <p className="text-muted-foreground">{t("estimate.planning.profitabilityPct")}</p>
                        <p className="text-sm font-medium text-foreground">{profitabilityPct == null ? "—" : formatPercent(profitabilityPct)}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {showEstimateWorkspace && <VersionBanner
          hasPending={pendingProposed && Boolean(latestProposed)}
          isOpenByDefault={reviewExpandedByDefault}
          title={t("estimate.versionBanner.title")}
          secondaryActions={undefined}
        >
          <p className="mb-2 text-caption font-medium text-foreground">{t("estimate.versionBanner.changedItems")}</p>
          <VersionDiffList
            changes={diff.changes}
            projectMode={projectMode}
            currency={estimateProject.currency}
            showSensitiveDetail={canViewSensitiveDetail}
          />
        </VersionBanner>}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0 flex-nowrap overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsTrigger value="estimate">{t("estimate.tabs.estimate")}</TabsTrigger>
            <TabsTrigger value="work_schedule" disabled={!showEstimateWorkspace}>{t("estimate.tabs.workSchedule")}</TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger value="work_log" disabled={!showEstimateWorkspace}>
                    {t("estimate.tabs.workLog")}
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              {!showEstimateWorkspace && (
                <TooltipContent>
                  {t("estimate.tabs.workLogDisabledTooltip")}
                </TooltipContent>
              )}
            </Tooltip>
          </TabsList>

          <TabsContent value="estimate" className="mt-3 space-y-3">
            {!showEstimateWorkspace ? (
              <EmptyState
                icon={AlertTriangle}
                title={t("estimate.empty.title")}
                description={t("estimate.empty.description")}
                actionLabel={canEditEstimate ? t("estimate.empty.createAction") : undefined}
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
                <p className="text-sm font-medium text-foreground">{t("estimate.empty.noStagesTitle")}</p>
                <p className="mt-1 text-caption text-muted-foreground">
                  {t("estimate.empty.noStagesDescription")}
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
                    <div key={stage.id} className="group/stage p-0 md:rounded-card md:border md:border-border md:p-2">
                      <div className="flex flex-col gap-1 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-2">
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
                          <span className="w-6 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums md:w-7">
                            {stageNumber}
                          </span>
                          <InlineEditableText
                            value={stage.title}
                            readOnly={!canEditEstimate}
                            startInEditMode={pendingStageTitleEditId === stage.id}
                            onCommit={(nextValue) => updateStage(pid, stage.id, { title: nextValue || stage.title })}
                            className="min-w-0 md:min-w-[220px] flex-1"
                            displayClassName="text-body-sm font-semibold"
                            inputClassName="text-body-sm font-semibold"
                          />
                          {canEditEstimate && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0"
                              aria-label={t("estimate.stage.deleteAria", { title: stage.title })}
                              title={t("estimate.stage.deleteTitle")}
                              onClick={() => openStageDelete(stage.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>

                        {estimateFinanceMode !== "none" && (
                          <div className="flex items-center gap-1">
                            <span className="text-caption text-muted-foreground">{t("estimate.stage.totalLabel")}</span>
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              {money(stageTotals?.totalCents ?? 0, estimateProject.currency)}
                            </span>
                          </div>
                        )}
                      </div>

                      {!isCollapsed && (
                        <div className="mt-2 space-y-2 pl-0 md:pl-6">
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
                            const showClientPricingColumns = estimateFinanceMode !== "none" && !hasChecklistFallbackRows;
                            const showDiscountedClientColumn = estimateFinanceMode === "summary"
                              && workLines.some((line) => typeof line.summaryDiscountedClientTotalCents === "number");
                            const tableColumnCount = 3
                              + (showAssignmentColumn ? 1 : 0)
                              + (showEstimateInternalPricing ? 2 : 0)
                              + (showEstimateMarkup ? 1 : 0)
                              + (showEstimateInternalPricing ? 1 : 0)
                              + (showClientPricingColumns ? 2 : 0)
                              + (showDiscountedClientColumn ? 1 : 0)
                              + (canEditEstimate ? 1 : 0);

                            const workTableColumns: WorkTableColumnDef[] = [
                              { key: "resource", title: t("estimate.table.col.resource"), widthPx: 180, sticky: true },
                              ...(showAssignmentColumn
                                ? [{
                                    key: "assigned",
                                    title: (
                                      <span className="inline-flex items-center gap-1" title={t("estimate.table.assignedTitle")}>
                                        <User className="h-3.5 w-3.5" />
                                        <span>{t("estimate.table.col.assigned")}</span>
                                      </span>
                                    ),
                                    widthPx: 170,
                                    hideOnMobile: true,
                                  } as WorkTableColumnDef]
                                : []),
                              { key: "qty", title: t("estimate.table.col.qty"), widthPx: 92, align: "right" },
                              { key: "unit", title: t("estimate.table.col.unit"), widthPx: 128 },
                              ...(showEstimateInternalPricing
                                ? [
                                    { key: "costUnit", title: t("estimate.table.col.costUnit"), widthPx: 120, align: "right", hideOnMobile: true } as WorkTableColumnDef,
                                    { key: "costTotal", title: t("estimate.table.col.costTotal"), widthPx: 120, align: "right" } as WorkTableColumnDef,
                                    { key: "vatPct", title: t("estimate.table.col.vatPct"), widthPx: 92, align: "right", hideOnMobile: true } as WorkTableColumnDef,
                                  ]
                                : []),
                              ...(showEstimateMarkup
                                ? [{ key: "markupPct", title: t("estimate.table.col.markupPct"), widthPx: 92, align: "right", hideOnMobile: true } as WorkTableColumnDef]
                                : []),
                              ...(showEstimateInternalPricing
                                ? [{ key: "discountPct", title: t("estimate.table.col.discountPct"), widthPx: 92, align: "right", hideOnMobile: true } as WorkTableColumnDef]
                                : []),
                              ...(showClientPricingColumns
                                ? [
                                    { key: "clientUnit", title: t("estimate.table.col.clientUnit"), widthPx: 120, align: "right", hideOnMobile: true } as WorkTableColumnDef,
                                    { key: "clientTotal", title: t("estimate.table.col.clientTotal"), widthPx: 126, align: "right" } as WorkTableColumnDef,
                                  ]
                                : []),
                              ...(showDiscountedClientColumn
                                ? [{ key: "discountedClient", title: t("estimate.table.col.discountedClient"), widthPx: 140, align: "right", hideOnMobile: true } as WorkTableColumnDef]
                                : []),
                              ...(canEditEstimate
                                ? [{ key: "actions", title: "", widthPx: 40 } as WorkTableColumnDef]
                                : []),
                            ];

                            return (
                              <div key={work.id} className="group/work space-y-2 p-0 md:rounded-md md:border md:border-border/80 md:p-2">
                                <div className="flex flex-wrap items-start justify-between gap-2 pl-0 md:pl-2">
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{workNumber}</span>
                                    <InlineEditableText
                                      value={work.title}
                                      readOnly={!canEditEstimate}
                                      startInEditMode={pendingWorkTitleEditId === work.id}
                                      onCommit={(nextValue) => updateWork(pid, work.id, { title: nextValue || work.title })}
                                      className="min-w-0 md:min-w-[220px] flex-1"
                                      displayClassName="text-sm font-medium"
                                      inputClassName="text-sm font-medium"
                                    />
                                  </div>
                                  {canEditEstimate && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      aria-label={t("estimate.work.deleteAria", { title: work.title })}
                                      title={t("estimate.work.deleteTitle")}
                                      onClick={() => openWorkDelete(work.id)}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </div>

                                <WorkTableFrame className="table-fixed md:min-w-[980px]" columns={workTableColumns}>
                                    <TableBody>
                                      {workLines.map((line) => {
                                        const computed = lineTotalsById.get(line.id);
                                        if (!computed) return null;
                                        const clientMoney = displayLineClientAmounts(
                                          line,
                                          computed,
                                          { financeMode: lineClientDisplayMode },
                                        );
                                        const typeLabel = isDeliveryOverheadsOtherLine(line.type, line.title)
                                          ? t("estimate.resource.overheadsLabel")
                                          : t(semanticLabelKeyForType(line.type));
                                        const otherPresentation = isDeliveryOverheadsOtherLine(line.type, line.title)
                                          ? "overhead"
                                          : "generic";
                                        const resolvedUnitSelectValue = resolveUnitSelectValue(line.type, line.unit);
                                        const isCustomUnit = resolvedUnitSelectValue === CUSTOM_UNIT_SENTINEL;
                                        const unitSelectValue = customUnitInputLineIds.has(line.id)
                                          ? CUSTOM_UNIT_SENTINEL
                                          : resolvedUnitSelectValue;
                                        const customDraft = customUnitDraftByLineId[line.id] ?? (isCustomUnit ? line.unit : "");
                                        const shouldShowCustomInput = isCustomUnit || customUnitInputLineIds.has(line.id);
                                        return (
                                          <TableRow key={line.id} className={cn("border-b border-border/40 last:border-b-0 md:border-b-0", changedLineIds.has(line.id) ? "bg-warning/10" : "")}>
                                            <TableCell className="sticky left-0 z-20 w-[180px] border-r border-border bg-card py-1.5 pr-2 align-top shadow-[6px_0_10px_-10px_hsl(var(--foreground)/0.35)]">
                                              <div className="flex min-w-0 items-start gap-2">
                                                {canEditEstimate ? (
                                                  <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                      <button
                                                        type="button"
                                                        title={typeLabel}
                                                        className="rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
                                                      >
                                                        <ResourceTypeBadge type={line.type} iconOnly otherPresentation={otherPresentation} />
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
                                                    <ResourceTypeBadge type={line.type} iconOnly otherPresentation={otherPresentation} />
                                                  </span>
                                                )}
                                                <InlineEditableText
                                                  value={line.title}
                                                  readOnly={!canEditEstimate}
                                                  startInEditMode={pendingLineTitleEditId === line.id}
                                                  onCommit={(nextValue) => updateLine(pid, line.id, { title: nextValue || line.title })}
                                                  className="min-w-0 flex-1"
                                                  displayClassName="whitespace-normal break-words leading-5 line-clamp-2 font-medium"
                                                />
                                              </div>
                                            </TableCell>

                                            {showAssignmentColumn && (
                                              <TableCell className="hidden md:table-cell md:w-[170px] py-1.5 pr-2 align-top">
                                                {isAssignableResourceType(line.type) ? (
                                                  <AssigneeCell
                                                    assigneeId={line.assigneeId}
                                                    assigneeName={line.assigneeName}
                                                    assigneeEmail={line.assigneeEmail}
                                                    participants={participantOptions}
                                                    pendingInvites={pendingInviteOptions}
                                                    editable={canEditEstimate}
                                                    clientView={false}
                                                    onInvite={handleAssigneeInvite}
                                                    onCommit={(nextValue) => updateLine(pid, line.id, nextValue)}
                                                  />
                                                ) : (
                                                  <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                              </TableCell>
                                            )}

                                            <TableCell className="md:w-[92px] py-1.5 pr-2 align-top">
                                              <InlineEditableNumber
                                                value={line.qtyMilli}
                                                readOnly={!canEditEstimate}
                                                onCommit={(nextValue) => updateLine(pid, line.id, { qtyMilli: nextValue })}
                                                formatDisplay={(value) => qtyFromMilli(value)}
                                                formatInput={(value) => qtyFromMilli(value)}
                                                parseInput={(raw) => toQtyMilli(raw)}
                                              />
                                            </TableCell>

                                            <TableCell className="md:w-[128px] py-1.5 pr-2 align-top">
                                              {canEditEstimate ? (
                                                shouldShowCustomInput ? (
                                                  <div className="inline-flex max-w-full items-center gap-1">
                                                    <Input
                                                      className="h-7 w-auto max-w-[calc(100%-1.75rem)] px-2 py-0 text-sm"
                                                      size={Math.min(18, Math.max(3, (customDraft ?? "").length + 1))}
                                                      value={customDraft}
                                                      placeholder=""
                                                      aria-label={t("estimate.table.unitAria")}
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
                                                          aria-label={t("estimate.unit.presetAria")}
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
                                                            {getUnitLabel(unit, t)}
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
                                                      {buildUnitSelectOptions(line.type, t).map((option) => (
                                                        <SelectItem key={`${line.id}-${option.value}`} value={option.value}>
                                                          {option.label}
                                                        </SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                )
                                              ) : (
                                                <div className="min-h-7 px-1 py-0.5 text-sm text-foreground">
                                                  {line.unit ? getUnitLabel(line.unit, t) : "—"}
                                                </div>
                                              )}
                                            </TableCell>

                                            {showEstimateInternalPricing && (
                                              <TableCell className="hidden md:table-cell md:w-[120px] py-1.5 pr-2 align-top">
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
                                              <TableCell className="md:w-[120px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                                {money(computed.costTotalCents, estimateProject.currency)}
                                              </TableCell>
                                            )}

                                            {showEstimateInternalPricing && (
                                              <TableCell className="hidden md:table-cell md:w-[92px] py-1.5 pr-2 align-top">
                                                {canEditEstimate ? (
                                                  <InlineEditableNumber
                                                    value={effectiveTaxForDisplay(line, estimateProject.taxBps)}
                                                    onCommit={(nextValue) => updateLine(pid, line.id, { taxBpsOverride: nextValue > 0 ? nextValue : null })}
                                                    formatDisplay={(value) => `${fromBpsToPercent(value)}%`}
                                                    formatInput={(value) => fromBpsToPercent(value)}
                                                    parseInput={(raw) => toBpsFromPercent(raw)}
                                                  />
                                                ) : (
                                                  <div className="min-h-7 whitespace-nowrap px-1 py-0.5 text-right text-sm tabular-nums text-foreground">
                                                    {`${fromBpsToPercent(effectiveTaxForDisplay(line, estimateProject.taxBps))}%`}
                                                  </div>
                                                )}
                                              </TableCell>
                                            )}

                                            {showEstimateMarkup && (
                                              <TableCell className="hidden md:table-cell md:w-[92px] py-1.5 pr-2 align-top">
                                                <InlineEditableNumber
                                                  value={effectiveMarkupForDisplay(line, estimateProject.markupBps)}
                                                  readOnly={!canEditEstimate}
                                                  onCommit={(nextValue) => updateLine(pid, line.id, { markupBps: nextValue })}
                                                  formatDisplay={(value) => `${fromBpsToPercent(value)}%`}
                                                  formatInput={(value) => fromBpsToPercent(value)}
                                                  parseInput={(raw) => toBpsFromPercent(raw)}
                                                />
                                              </TableCell>
                                            )}

                                            {showEstimateInternalPricing && (
                                              <TableCell className="hidden md:table-cell md:w-[92px] py-1.5 pr-2 align-top">
                                                {canEditEstimate ? (
                                                  <InlineEditableNumber
                                                    value={effectiveDiscountForDisplay(line, stage, estimateProject.discountBps)}
                                                    onCommit={(nextValue) => updateLine(pid, line.id, { discountBpsOverride: nextValue > 0 ? nextValue : null })}
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
                                              <TableCell className="hidden md:table-cell md:w-[120px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                                {clientMoney ? money(clientMoney.clientUnitCents, estimateProject.currency) : "—"}
                                              </TableCell>
                                            )}
                                            {showClientPricingColumns && (
                                              <TableCell className="md:w-[126px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                                {clientMoney ? money(clientMoney.clientTotalCents, estimateProject.currency) : "—"}
                                              </TableCell>
                                            )}
                                            {showDiscountedClientColumn && (
                                              <TableCell className="hidden md:table-cell md:w-[140px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                                {typeof line.summaryDiscountedClientTotalCents === "number"
                                                  ? money(line.summaryDiscountedClientTotalCents, estimateProject.currency)
                                                  : "—"}
                                              </TableCell>
                                            )}

                                            {canEditEstimate && (
                                              <TableCell className="md:w-10 py-1.5 pr-0 align-top">
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  className="h-7 w-7"
                                                  aria-label={t("estimate.resource.deleteAria", { title: line.title })}
                                                  title={t("estimate.resource.deleteTitle")}
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
                                        const typeLabel = row.typeLabel ?? t(semanticLabelKeyForType(row.type));
                                        const fallbackOtherPresentation = isDeliveryOverheadsOtherLine(row.type, row.title)
                                          ? "overhead"
                                          : "generic";
                                        return (
                                          <TableRow key={row.id} className="border-b border-border/40 last:border-b-0 md:border-b-0">
                                            <TableCell className="sticky left-0 z-20 w-[180px] border-r border-border bg-card py-1.5 pr-2 align-top shadow-[6px_0_10px_-10px_hsl(var(--foreground)/0.35)]">
                                              <div className="flex min-w-0 items-start gap-2">
                                                <span title={typeLabel}>
                                                  <ResourceTypeBadge
                                                    type={row.type}
                                                    iconOnly
                                                    labelOverride={row.typeLabel ?? undefined}
                                                    otherPresentation={fallbackOtherPresentation}
                                                  />
                                                </span>
                                                <div className="min-w-0 flex-1 whitespace-normal break-words leading-5 font-medium">
                                                  {row.title}
                                                </div>
                                              </div>
                                            </TableCell>

                                            {showAssignmentColumn && (
                                              <TableCell className="hidden md:table-cell md:w-[170px] py-1.5 pr-2 align-top">
                                                {isAssignableResourceType(row.type) && (row.assigneeName || row.assigneeEmail) ? (
                                                  <div className="min-h-7 px-1 py-0.5 text-sm text-foreground">
                                                    {row.assigneeName || row.assigneeEmail}
                                                  </div>
                                                ) : (
                                                  <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                              </TableCell>
                                            )}

                                            <TableCell className="md:w-[92px] py-1.5 pr-2 align-top">
                                              <div className="min-h-7 px-1 py-0.5 text-sm text-foreground">
                                                {row.qtyMilli != null ? qtyFromMilli(row.qtyMilli) : "—"}
                                              </div>
                                            </TableCell>

                                            <TableCell className="md:w-[128px] py-1.5 pr-2 align-top">
                                              <div className="min-h-7 px-1 py-0.5 text-sm text-foreground">
                                                {row.unit || "—"}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        );
                                      })}

                                      {canEditEstimate && (
                                        <TableRow className="border-b-0 hover:bg-transparent">
                                          <TableCell className="sticky left-0 z-20 w-[180px] border-r border-border bg-card py-1 pr-2 shadow-[6px_0_10px_-10px_hsl(var(--foreground)/0.35)]">
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
                                                    {t("estimate.resource.addButton")}
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
                                                  {RESOURCE_CREATE_OPTIONS.map((option) => {
                                                    const optionLabel = t(option.labelKey);
                                                    return (
                                                      <DropdownMenuItem
                                                        key={`${work.id}-${option.labelKey}`}
                                                        onSelect={() => handleCreateResourceLine(stage.id, work.id, option)}
                                                      >
                                                        <ResourceTypeBadge
                                                          type={option.value}
                                                          labelOverride={optionLabel}
                                                          className="border-transparent"
                                                          otherPresentation={
                                                            option.overheadLabelKey
                                                              ? "overhead"
                                                              : "generic"
                                                          }
                                                        />
                                                      </DropdownMenuItem>
                                                    );
                                                  })}
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
                                  {t("estimate.work.addButton")}
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
                  {t("estimate.stage.addButton")}
                </Button>
              </div>
            )}
            <div className="rounded-lg border border-border p-3">
              <div className="grid items-center gap-x-4 gap-y-2 md:grid-cols-[minmax(0,1fr)_max-content_max-content]">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                  <span className="truncate">{t("estimate.footer.totalAcrossStages")}</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="shrink-0 text-muted-foreground hover:text-foreground">
                        <Info className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{t("estimate.footer.helperTooltip")}</TooltipContent>
                  </Tooltip>
                </div>

                {showEstimateInternalPricing && (
                  <div className="flex items-center justify-between gap-2 whitespace-nowrap text-sm md:min-w-[170px] md:justify-end">
                    <span className="text-muted-foreground">{t("estimate.footer.totalCost")}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {money(totals.costTotalCents, estimateProject.currency)}
                    </span>
                  </div>
                )}

                {estimateFinanceMode !== "none" && (
                  <div className="flex items-center justify-between gap-2 whitespace-nowrap text-sm md:min-w-[190px] md:justify-end">
                    <span className="text-muted-foreground">{t("estimate.footer.totalForClient")}</span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {money(uiTotalIncVatCents, estimateProject.currency)}
                    </span>
                  </div>
                )}
              </div>

              {estimateFinanceMode !== "none" && (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-2 text-caption font-semibold text-muted-foreground">
                  {t("estimate.footer.financialSettings")}
                </div>
                <div className="flex flex-col gap-2">
                  {showEstimateMarkup && (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{t("estimate.footer.markup")}</span>
                      <div className="flex items-center gap-3">
                        {canEditEstimate ? (
                          <InlineEditableNumber
                            value={estimateProject.markupBps}
                            onCommit={(nextValue) => updateEstimateV2Project(pid, { markupBps: nextValue })}
                            formatDisplay={(value) => (value > 0 ? `${fromBpsToPercent(value)}%` : "—")}
                            formatInput={(value) => fromBpsToPercent(value)}
                            parseInput={(raw) => toBpsFromPercent(raw)}
                            className="w-16"
                            displayClassName="font-semibold text-right"
                            inputClassName="font-semibold text-right"
                          />
                        ) : (
                          <span className="font-semibold tabular-nums text-foreground">
                            {estimateProject.markupBps > 0 ? `${fromBpsToPercent(estimateProject.markupBps)}%` : "—"}
                          </span>
                        )}
                        <span className="min-w-[110px] text-right tabular-nums text-foreground">
                          {money(totals.markupTotalCents, estimateProject.currency)}
                        </span>
                      </div>
                    </div>
                  )}

                  {canViewSensitiveDetail && (
                    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">{t("estimate.footer.discount")}</span>
                      <div className="flex items-center gap-3">
                        {canEditEstimate ? (
                          <InlineEditableNumber
                            value={estimateProject.discountBps}
                            onCommit={(nextValue) => updateEstimateV2Project(pid, { discountBps: nextValue })}
                            formatDisplay={(value) => (value > 0 ? `${fromBpsToPercent(value)}%` : "—")}
                            formatInput={(value) => fromBpsToPercent(value)}
                            parseInput={(raw) => toBpsFromPercent(raw)}
                            className="w-16"
                            displayClassName="font-semibold text-right"
                            inputClassName="font-semibold text-right"
                          />
                        ) : (
                          <span className="font-semibold tabular-nums text-foreground">
                            {estimateProject.discountBps > 0 ? `${fromBpsToPercent(estimateProject.discountBps)}%` : "—"}
                          </span>
                        )}
                        <span className="min-w-[110px] text-right tabular-nums text-foreground">
                          {money(totals.discountTotalCents, estimateProject.currency)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t("estimate.footer.vat")}</span>
                    <div className="flex items-center gap-3">
                      {canEditEstimate ? (
                        <InlineEditableNumber
                          value={estimateProject.taxBps}
                          onCommit={(nextValue) => updateEstimateV2Project(pid, { taxBps: nextValue })}
                          formatDisplay={(value) => `${fromBpsToPercent(value)}%`}
                          formatInput={(value) => fromBpsToPercent(value)}
                          parseInput={(raw) => toBpsFromPercent(raw)}
                          className="w-16"
                          displayClassName="font-semibold text-right"
                          inputClassName="font-semibold text-right"
                        />
                      ) : (
                        <span className="font-semibold tabular-nums text-foreground">
                          {fromBpsToPercent(operationalUpperBlock?.vatBps ?? estimateProject.taxBps)}%
                        </span>
                      )}
                      <span className="min-w-[110px] text-right tabular-nums text-foreground">
                        {money(uiTaxAmountCents, estimateProject.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              )}
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
          title={pendingDelete ? deleteDialogTitle(pendingDelete.assessment, pendingDelete.step, t) : t("common.delete")}
          description={pendingDelete ? pendingDeleteDescription(pendingDelete, t) : ""}
          confirmLabel={pendingDelete ? pendingDeleteConfirmLabel(pendingDelete, t) : t("common.delete")}
          cancelLabel={t("common.cancel")}
          onConfirm={confirmPendingDelete}
          onCancel={() => {
            pendingDeleteNextStepRef.current = null;
            setPendingDelete(null);
          }}
        >
          {pendingDelete?.step === "execution" && pendingDelete.assessment.kind === "stage" && pendingDelete.assessment.startedEntries.length > 0 && (
            <div className="max-h-48 overflow-auto rounded-md border border-border p-2">
              <p className="mb-2 text-caption text-muted-foreground">{t("estimate.delete.startedHeading")}</p>
              <ul className="space-y-1">
                {pendingDelete.assessment.startedEntries.map((entry) => (
                  <li key={`${entry.kind}-${entry.id}`} className="text-caption text-foreground">
                    {entry.kind === "work"
                      ? t("estimate.delete.startedEntry.work", { title: entry.title, status: entry.statusLabel })
                      : t("estimate.delete.startedEntry.task", { title: entry.title, status: entry.statusLabel })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pendingDelete?.step === "financial" && pendingDelete.assessment.financial.hasConsequences && (
            <div className="max-h-56 overflow-auto rounded-md border border-border p-2 space-y-3">
              {pendingDelete.assessment.financial.procurement.length > 0 && (
                <div>
                  <p className="mb-2 text-caption text-muted-foreground">{t("estimate.delete.procurementHeading")}</p>
                  <ul className="space-y-1">
                    {pendingDelete.assessment.financial.procurement.map((item) => (
                      <li key={item.procurementItemId} className="text-caption text-foreground">
                        {item.title} ({procurementConsequenceLabel(item, t)})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {pendingDelete.assessment.financial.hr.length > 0 && (
                <div>
                  <p className="mb-2 text-caption text-muted-foreground">{t("estimate.delete.hrHeading")}</p>
                  <ul className="space-y-1">
                    {pendingDelete.assessment.financial.hr.map((item) => (
                      <li key={item.hrItemId} className="text-caption text-foreground">
                        {item.title} ({hrConsequenceLabel(item, t)})
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
          title={t("estimate.missingDates.title")}
          description={t("estimate.missingDates.description")}
          confirmLabel={t("estimate.missingDates.skipSetup")}
          cancelLabel={t("common.cancel")}
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
          title={t("estimate.finish.blockedTitle")}
          description={t("estimate.finish.blockedDescription")}
          confirmLabel={t("estimate.finish.markAllDone")}
          cancelLabel={t("common.close")}
          tertiaryLabel={t("estimate.finish.goToWorkLog")}
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
          title={t("estimate.finish.allDoneTitle")}
          description={t("estimate.finish.allDoneDescription")}
          confirmLabel={t("estimate.finish.markFinished")}
          cancelLabel={t("estimate.finish.notNow")}
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
          title={t("estimate.recipients.title")}
          description={t("estimate.recipients.description")}
          confirmLabel={t("estimate.recipients.submitSelected")}
          cancelLabel={t("common.cancel")}
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
          title={shareLinkModalState?.title ?? t("estimate.share.defaultTitle")}
          description={shareLinkModalState?.description ?? ""}
          confirmLabel={shareLinkModalState?.suggestUpgrade ? t("estimate.share.upgradePlan") : t("common.close")}
          showCancel={Boolean(shareLinkModalState?.suggestUpgrade)}
          cancelLabel={t("common.close")}
          tertiaryLabel={t("estimate.share.copyLink")}
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
            <p className="text-caption text-muted-foreground">{t("estimate.share.linkLabel")}</p>
            <Input readOnly value={shareLinkModalState?.link ?? ""} />
          </div>
        </ConfirmModal>

        <ApprovalStampFormModal
          open={approvalModalOpen}
          onOpenChange={setApprovalModalOpen}
          title={t("estimate.approve.title")}
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
