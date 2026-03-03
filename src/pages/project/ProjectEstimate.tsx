import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ChevronDown, ChevronRight, Download, Plus, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { AssigneeCell } from "@/components/estimate-v2/AssigneeCell";
import { InlineEditableNumber } from "@/components/estimate-v2/InlineEditableNumber";
import { InlineEditableText } from "@/components/estimate-v2/InlineEditableText";
import { ResourceTypeBadge } from "@/components/estimate-v2/ResourceTypeBadge";
import {
  useCurrentUser,
  useHRItems,
  useHRPayments,
  useProcurementV2,
  useProject,
  useTasks,
} from "@/hooks/use-mock-data";
import { getAuthRole } from "@/lib/auth-state";
import {
  approveVersion,
  computeVersionDiff,
  createLine,
  createStage,
  createVersionSnapshot,
  createWork,
  deleteLine,
  deleteStage,
  deleteWork,
  setProjectEstimateStatus,
  submitVersion,
  updateEstimateV2Project,
  updateLine,
  updateStage,
  updateWork,
} from "@/data/estimate-v2-store";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";
import { addEvent, getUserById } from "@/data/store";
import { computeLineTotals, computeProjectTotals, computeStageSubtotals } from "@/lib/estimate-v2/pricing";
import { resolveProjectEstimateCtaState } from "@/lib/estimate-v2/project-estimate-cta";
import {
  combinePlanFact,
  computeFactFromDataSources,
  computePlannedFromEstimateV2,
} from "@/lib/estimate-v2/rollups";
import { toDayIndex } from "@/lib/estimate-v2/schedule";
import { useOrders } from "@/hooks/use-order-data";
import { ApprovalStampCard } from "@/components/estimate-v2/ApprovalStampCard";
import { ApprovalStampFormModal } from "@/components/estimate-v2/ApprovalStampFormModal";
import { VersionBanner } from "@/components/estimate-v2/VersionBanner";
import { VersionDiffList } from "@/components/estimate-v2/VersionDiffList";
import { EstimateGantt } from "@/components/estimate-v2/gantt/EstimateGantt";
import type {
  ApprovalStamp,
  EstimateV2ResourceLine,
  EstimateV2Stage,
  EstimateV2Work,
  EstimateExecutionStatus,
  ResourceLineType,
} from "@/types/estimate-v2";

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
  if (status === "planning") return "bg-muted text-muted-foreground";
  if (status === "in_work") return "bg-info/15 text-info";
  if (status === "paused") return "bg-warning/15 text-warning-foreground";
  return "bg-success/15 text-success";
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

const RESOURCE_CREATE_OPTIONS: Array<{ label: string; value: ResourceLineType; defaultTitle: string }> = [
  { label: "Material", value: "material", defaultTitle: "Material" },
  { label: "Tool", value: "tool", defaultTitle: "Tool" },
  { label: "HR", value: "labor", defaultTitle: "Labor" },
  { label: "Overheads", value: "other", defaultTitle: "Overheads" },
  { label: "Subcontractor", value: "subcontractor", defaultTitle: "Subcontractor" },
  { label: "Other", value: "other", defaultTitle: "Other" },
];

export default function ProjectEstimate() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pid = projectId!;
  const { toast } = useToast();
  const currentUser = useCurrentUser();
  const { project, members } = useProject(pid);
  const tasks = useTasks(pid);
  const procurementItems = useProcurementV2(pid);
  const orders = useOrders(pid);
  const hrItems = useHRItems(pid);
  const hrPayments = useHRPayments(pid);

  const {
    project: estimateProject,
    stages,
    works,
    lines,
    dependencies,
    versions,
    scheduleBaseline,
  } = useEstimateV2Project(pid);

  const authRole = getAuthRole();
  const isOwner = authRole === "owner" && project?.owner_id === currentUser.id;
  const regime = estimateProject.regime;
  const canEditEstimate = isOwner && regime !== "client";

  const [activeTab, setActiveTab] = useState("estimate");
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [missingDatesWorkIds, setMissingDatesWorkIds] = useState<string[]>([]);
  const [incompleteTaskBlocks, setIncompleteTaskBlocks] = useState<Array<{ taskId: string | null; title: string }>>([]);
  const [collapsedStageIds, setCollapsedStageIds] = useState<Set<string>>(new Set());
  const [pendingLineTitleEditId, setPendingLineTitleEditId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingLineTitleEditId) return;
    const timeoutId = window.setTimeout(() => {
      setPendingLineTitleEditId(null);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [pendingLineTitleEditId]);

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

  const workById = useMemo(() => new Map(works.map((work) => [work.id, work])), [works]);

  const latestApproved = useMemo(() => (
    versions
      .filter((version) => version.submitted && version.status === "approved")
      .sort((a, b) => b.number - a.number)[0] ?? null
  ), [versions]);

  const latestProposed = useMemo(() => (
    versions
      .filter((version) => version.submitted && version.status === "proposed")
      .sort((a, b) => b.number - a.number)[0] ?? null
  ), [versions]);

  const pendingProposed = Boolean(
    latestProposed
    && (!latestApproved || latestProposed.number > latestApproved.number),
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

  const lineTotalsById = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeLineTotals>>();
    lines.forEach((line) => {
      const stage = stageById.get(line.stageId);
      if (!stage) return;
      map.set(line.id, computeLineTotals(line, stage, estimateProject, regime));
    });
    return map;
  }, [estimateProject, lines, regime, stageById]);

  const totals = useMemo(
    () => computeProjectTotals(estimateProject, stages, works, lines, regime),
    [estimateProject, stages, works, lines, regime],
  );

  const stageSubtotalById = useMemo(
    () => new Map(
      computeStageSubtotals(estimateProject, stages, lines, regime).map((item) => [item.stageId, item.subtotalCents]),
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

  const showInWorkPlanFactSummary = estimateProject.estimateStatus === "in_work" && regime !== "client";

  const todayDay = toDayIndex(new Date());
  const currentRange = useMemo(() => worksRangeDays(works), [works]);
  const baselineRange = useMemo(() => {
    if (!scheduleBaseline?.projectBaselineStart || !scheduleBaseline.projectBaselineEnd) return null;
    const startDay = toDayIndex(scheduleBaseline.projectBaselineStart);
    const endDay = toDayIndex(scheduleBaseline.projectBaselineEnd);
    if (startDay == null || endDay == null) return null;
    return { startDay, endDay };
  }, [scheduleBaseline]);

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
    isOwner,
    hasProposedVersion: Boolean(latestProposed),
  });
  const reviewExpandedByDefault = regime === "client" && !isOwner;
  const approvedVersionWithStamp = latestApproved?.approvalStamp ? latestApproved : null;
  const latestVersionNumber = useMemo(
    () => versions.reduce((max, version) => Math.max(max, version.number), 1),
    [versions],
  );
  const latestVersionApproved = Boolean(
    latestApproved
    && (!latestProposed || latestApproved.number >= latestProposed.number),
  );

  if (!project) {
    return <EmptyState icon={AlertTriangle} title="Not found" description="Project not found." />;
  }

  const handleEstimateStatusChange = (
    nextStatus: EstimateExecutionStatus,
    options?: { skipSetup?: boolean },
  ) => {
    if (!canEditEstimate) return;
    if (nextStatus === estimateProject.estimateStatus && !options?.skipSetup) return;
    const result = setProjectEstimateStatus(pid, nextStatus, options);
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

  const handleSkipSetup = () => {
    handleEstimateStatusChange("in_work", { skipSetup: true });
  };

  const handleGoToWorkLog = () => {
    setIncompleteTaskBlocks([]);
    navigate(`/project/${pid}/tasks`);
  };

  const handleTabChange = (nextTab: string) => {
    if (nextTab === "work_log") {
      if (estimateProject.estimateStatus !== "in_work") return;
      navigate(`/project/${pid}/tasks`);
      return;
    }
    setActiveTab(nextTab);
  };

  const handleSubmitToClient = () => {
    if (!canEditEstimate) return;
    const snapshot = createVersionSnapshot(pid, currentUser.id);
    const ok = submitVersion(pid, snapshot.versionId);
    if (!ok) {
      toast({ title: "Only project owner can submit versions", variant: "destructive" });
      return;
    }
    toast({ title: "New estimate version submitted" });
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

    if (regime === "client") {
      rows.push(["Stage", "Work", "Line", "Qty", "Unit", "Client unit", "Client total"]);
    }
    if (regime === "contractor") {
      rows.push(["Stage", "Work", "Line", "Type", "Qty", "Unit", "Cost unit", "Cost total", "Markup %", "Discount %", "Client unit", "Client total"]);
    }
    if (regime === "build_myself") {
      rows.push(["Stage", "Work", "Line", "Type", "Qty", "Unit", "Cost unit", "Cost total", "Discount %", "Client unit", "Client total"]);
    }

    sortedStages.forEach((stage) => {
      const stageWorks = worksByStage.get(stage.id) ?? [];
      stageWorks.forEach((work) => {
        const workLines = linesByWork.get(work.id) ?? [];
        workLines.forEach((line) => {
          const lineTotals = lineTotalsById.get(line.id);
          if (!lineTotals) return;

          if (regime === "client") {
            rows.push([
              stage.title,
              work.title,
              line.title,
              qtyFromMilli(line.qtyMilli),
              line.unit,
              money(lineTotals.clientUnitCents, estimateProject.currency),
              money(lineTotals.clientTotalCents, estimateProject.currency),
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
              money(lineTotals.clientUnitCents, estimateProject.currency),
              money(lineTotals.clientTotalCents, estimateProject.currency),
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
            money(lineTotals.clientUnitCents, estimateProject.currency),
            money(lineTotals.clientTotalCents, estimateProject.currency),
          ]);
        });
      });
    });

    rows.push([]);
    rows.push(["Subtotal", money(totals.subtotalCents, estimateProject.currency)]);
    if (totals.discountTotalCents > 0) {
      rows.push(["Discount", money(totals.discountTotalCents, estimateProject.currency)]);
    }
    rows.push(["Tax", `${(estimateProject.taxBps / 100).toFixed(2)}%`]);
    rows.push(["Tax amount", money(totals.taxAmountCents, estimateProject.currency)]);
    rows.push(["Total", money(totals.totalCents, estimateProject.currency)]);

    const csv = buildCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `estimate-v2-${pid}-${regime}.csv`;
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

  const handleCreateResourceLine = (
    stageId: string,
    workId: string,
    option: { value: ResourceLineType; defaultTitle: string },
  ) => {
    const created = createLine(pid, {
      stageId,
      workId,
      title: option.defaultTitle,
      type: option.value,
      qtyMilli: 1_000,
      costUnitCents: 0,
    });
    if (!created) return;
    setPendingLineTitleEditId(created.id);
  };

  return (
    <div className="space-y-sp-2 p-sp-2">
      <div className="rounded-card border border-border bg-card p-sp-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{project.title}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-caption text-muted-foreground">Estimate</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className={latestVersionApproved ? "bg-success/15 text-success" : "bg-warning/15 text-warning-foreground"}
                  >
                    v{latestVersionNumber}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  Share link with client for approval of the latest estimate version.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={estimateProject.estimateStatus}
                onValueChange={(value) => handleEstimateStatusChange(value as EstimateExecutionStatus)}
                disabled={!canEditEstimate}
              >
                <SelectTrigger className={`h-9 w-[180px] border-0 text-sm font-medium ${estimateStatusClassName(estimateProject.estimateStatus)}`}>
                  <SelectValue placeholder={estimateStatusLabel(estimateProject.estimateStatus)} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in_work">In work</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="finished">Finished</SelectItem>
                </SelectContent>
              </Select>
              {!canEditEstimate && <span className="text-caption text-muted-foreground">Owner only</span>}
            </div>
            <p className="text-caption text-muted-foreground">Stage → Work → ResourceLine</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>

            {ctaState.showSubmit && (
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleSubmitToClient}>
                Submit to client
              </Button>
            )}

            {ctaState.showApprove && (
              <Button
                size="sm"
                onClick={() => setApprovalModalOpen(true)}
                disabled={ctaState.approveDisabled}
                title={ctaState.approveDisabledReason ?? undefined}
              >
                Approve
              </Button>
            )}

            {ctaState.showApprove && ctaState.approveDisabledReason && (
              <span className="text-caption text-muted-foreground">{ctaState.approveDisabledReason}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-semibold text-foreground">Timing</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-caption">
              <div className="rounded-md border border-border/70 p-2">
                <p className="text-muted-foreground">Duration planned</p>
                <p className="text-sm font-medium text-foreground">
                  {timingMetrics.durationPlannedDays == null ? "—" : `${timingMetrics.durationPlannedDays} d`}
                </p>
              </div>
              <div className="rounded-md border border-border/70 p-2">
                <p className="text-muted-foreground">Duration estimated</p>
                <p className="text-sm font-medium text-foreground">
                  {timingMetrics.durationEstimatedDays == null ? "—" : `${timingMetrics.durationEstimatedDays} d`}
                </p>
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
            <p className="mt-2 text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold text-foreground">{money(totals.totalCents, estimateProject.currency)}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {regime === "client" ? (
                <>
                  <Badge variant="secondary">Tax: {(estimateProject.taxBps / 100).toFixed(2)}%</Badge>
                  <Badge variant="secondary">Tax amount: {money(totals.taxAmountCents, estimateProject.currency)}</Badge>
                  {totals.discountTotalCents > 0 && <Badge variant="secondary">Discount: {money(totals.discountTotalCents, estimateProject.currency)}</Badge>}
                </>
              ) : (
                <>
                  <Badge variant="secondary">Subtotal: {money(totals.subtotalCents, estimateProject.currency)}</Badge>
                  <Badge variant="secondary">Tax amount: {money(totals.taxAmountCents, estimateProject.currency)}</Badge>
                  {totals.discountTotalCents > 0 && <Badge variant="secondary">Discount: {money(totals.discountTotalCents, estimateProject.currency)}</Badge>}
                  {showInWorkPlanFactSummary && (
                    <>
                      <Badge variant="secondary">Budget: {money(combinedPlanFact.planned.plannedBudgetCents, estimateProject.currency)}</Badge>
                      <Badge variant="secondary">Spent: {money(combinedPlanFact.fact.spentCents, estimateProject.currency)}</Badge>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-caption text-muted-foreground">Tax %</span>
              <Input
                className="h-8 w-20"
                defaultValue={(estimateProject.taxBps / 100).toString()}
                readOnly={!canEditEstimate}
                onBlur={(e) => {
                  if (!canEditEstimate) return;
                  const nextTax = toBpsFromPercent(e.target.value);
                  updateEstimateV2Project(pid, { taxBps: nextTax });
                }}
              />

              <span className="text-caption text-muted-foreground">Discount %</span>
              <Input
                className="h-8 w-20"
                defaultValue={(estimateProject.discountBps / 100).toString()}
                readOnly={!canEditEstimate}
                onBlur={(e) => {
                  if (!canEditEstimate) return;
                  const nextDiscount = toBpsFromPercent(e.target.value);
                  updateEstimateV2Project(pid, { discountBps: nextDiscount });
                }}
              />
            </div>
          </div>
        </div>

        <VersionBanner
          hasPending={pendingProposed && Boolean(latestProposed)}
          isOpenByDefault={reviewExpandedByDefault}
          title="New version submitted"
          secondaryActions={(
            !isOwner && regime === "client" ? (
              <Button variant="outline" size="sm" onClick={handleAskQuestions}>Ask questions</Button>
            ) : undefined
          )}
        >
          <p className="mb-2 text-caption font-medium text-foreground">Changed items</p>
          <VersionDiffList changes={diff.changes} regime={regime} currency={estimateProject.currency} />
        </VersionBanner>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="estimate">Estimate</TabsTrigger>
            <TabsTrigger value="work_schedule">Work schedule</TabsTrigger>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <TabsTrigger value="work_log" disabled={estimateProject.estimateStatus !== "in_work"}>
                    Work log
                  </TabsTrigger>
                </span>
              </TooltipTrigger>
              {estimateProject.estimateStatus !== "in_work" && (
                <TooltipContent>Available after moving project to In work</TooltipContent>
              )}
            </Tooltip>
          </TabsList>

          <TabsContent value="estimate" className="mt-3 space-y-3">
            {approvedVersionWithStamp && approvedVersionWithStamp.approvalStamp && (
              <ApprovalStampCard
                stamp={approvedVersionWithStamp.approvalStamp}
                versionNumber={approvedVersionWithStamp.number}
              />
            )}

            {showInWorkPlanFactSummary ? (
              <div className="rounded-lg border border-border p-3 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="default">Budget: {money(combinedPlanFact.planned.plannedBudgetCents, estimateProject.currency)}</Badge>
                  <Badge variant="secondary">Total spent: {money(combinedPlanFact.fact.spentCents, estimateProject.currency)}</Badge>
                  <Badge variant="secondary">Spent above planned: {money(combinedPlanFact.fact.spentAbovePlannedCents, estimateProject.currency)}</Badge>
                  <Badge variant="secondary">To be paid: {money(combinedPlanFact.fact.toBePaidPlannedCents, estimateProject.currency)}</Badge>
                  <Badge variant="secondary">
                    Duration planned: {combinedPlanFact.durationPlannedDays == null ? "—" : `${combinedPlanFact.durationPlannedDays} d`}
                  </Badge>
                  <Badge variant="secondary">
                    Days to end: {combinedPlanFact.daysToEnd == null ? "—" : `${combinedPlanFact.daysToEnd}`}
                  </Badge>
                  <Badge variant="secondary">Behind schedule: {combinedPlanFact.behindScheduleDays} d</Badge>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Planned cost</TableHead>
                        <TableHead className="text-right">Fact spent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(["material", "tool", "labor", "subcontractor", "other"] as const).map((type) => (
                        <TableRow key={type}>
                          <TableCell className="capitalize">{type}</TableCell>
                          <TableCell className="text-right">{money(combinedPlanFact.planned.plannedCostByTypeCents[type], estimateProject.currency)}</TableCell>
                          <TableCell className="text-right">{money(combinedPlanFact.fact.spentByTypeCents[type], estimateProject.currency)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-border p-2 flex flex-wrap gap-2">
                {regime === "client" && (
                  <>
                    <Badge variant="secondary">Tax: {(estimateProject.taxBps / 100).toFixed(2)}%</Badge>
                    <Badge variant="secondary">Tax amount: {money(totals.taxAmountCents, estimateProject.currency)}</Badge>
                    <Badge variant="default">Total: {money(totals.totalCents, estimateProject.currency)}</Badge>
                  </>
                )}

                {regime === "contractor" && (
                  <>
                    <Badge variant="secondary">Material cost: {money(totals.breakdownByType.material, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Tool cost: {money(totals.breakdownByType.tool, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Labor cost: {money(totals.breakdownByType.labor, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Subcontractor cost: {money(totals.breakdownByType.subcontractor, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Other cost: {money(totals.breakdownByType.other, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Markup: {money(totals.markupTotalCents, estimateProject.currency)}</Badge>
                    {totals.discountTotalCents > 0 && (
                      <Badge variant="secondary">Discount: {money(totals.discountTotalCents, estimateProject.currency)}</Badge>
                    )}
                    <Badge variant="secondary">Subtotal: {money(totals.subtotalCents, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Tax: {money(totals.taxAmountCents, estimateProject.currency)}</Badge>
                    <Badge variant="default">Total: {money(totals.totalCents, estimateProject.currency)}</Badge>
                  </>
                )}

                {regime === "build_myself" && (
                  <>
                    <Badge variant="secondary">Material cost: {money(totals.breakdownByType.material, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Tool cost: {money(totals.breakdownByType.tool, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Labor cost: {money(totals.breakdownByType.labor, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Subcontractor cost: {money(totals.breakdownByType.subcontractor, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Other cost: {money(totals.breakdownByType.other, estimateProject.currency)}</Badge>
                    {totals.discountTotalCents > 0 && (
                      <Badge variant="secondary">Discount: {money(totals.discountTotalCents, estimateProject.currency)}</Badge>
                    )}
                    <Badge variant="secondary">Subtotal: {money(totals.subtotalCents, estimateProject.currency)}</Badge>
                    <Badge variant="secondary">Tax: {money(totals.taxAmountCents, estimateProject.currency)}</Badge>
                    <Badge variant="default">Total: {money(totals.totalCents, estimateProject.currency)}</Badge>
                  </>
                )}
              </div>
            )}

            {sortedStages.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="No stages" description="Add your first stage to start Estimate v2." />
            ) : (
              <div className="space-y-3">
                {sortedStages.map((stage) => {
                  const stageWorks = worksByStage.get(stage.id) ?? [];
                  const stageNumber = hierarchyNumbers.stageNumberById.get(stage.id) ?? stage.order;
                  const isCollapsed = collapsedStageIds.has(stage.id);

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
                            onCommit={(nextValue) => updateStage(pid, stage.id, { title: nextValue || stage.title })}
                            className="min-w-[220px] flex-1"
                            displayClassName="text-body-sm font-semibold"
                            inputClassName="text-body-sm font-semibold"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          {canEditEstimate && (
                            <div className="flex items-center gap-1">
                              <span className="text-caption text-muted-foreground">Stage discount %</span>
                              <InlineEditableNumber
                                value={stage.discountBps}
                                onCommit={(nextValue) => updateStage(pid, stage.id, { discountBps: nextValue })}
                                formatDisplay={(value) => fromBpsToPercent(value)}
                                formatInput={(value) => fromBpsToPercent(value)}
                                parseInput={(raw) => toBpsFromPercent(raw)}
                                className="w-16"
                              />
                            </div>
                          )}
                          {canEditEstimate && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteStage(pid, stage.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="mt-2 space-y-2 pl-6">
                          {stageWorks.map((work) => {
                            const workLines = linesByWork.get(work.id) ?? [];
                            const workNumber = hierarchyNumbers.workNumberById.get(work.id) ?? `${stageNumber}.1`;
                            const showAssignmentColumn = workLines.some((line) => isAssignableResourceType(line.type));
                            const tableColumnCount = 6
                              + (showAssignmentColumn ? 1 : 0)
                              + (regime !== "client" ? 2 : 0)
                              + (regime === "contractor" ? 1 : 0)
                              + (regime !== "client" ? 1 : 0)
                              + (canEditEstimate ? 1 : 0);

                            return (
                              <div key={work.id} className="group/work space-y-2 rounded-md border border-border/80 p-2">
                                <div className="flex flex-wrap items-start justify-between gap-2 pl-2">
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{workNumber}</span>
                                    <InlineEditableText
                                      value={work.title}
                                      readOnly={!canEditEstimate}
                                      onCommit={(nextValue) => updateWork(pid, work.id, { title: nextValue || work.title })}
                                      className="min-w-[220px] flex-1"
                                      displayClassName="text-sm font-medium"
                                      inputClassName="text-sm font-medium"
                                    />
                                  </div>
                                  {canEditEstimate && (
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteWork(pid, work.id)}>
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  )}
                                </div>

                                <div className="pl-4">
                                  <Table className="table-fixed">
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="h-9 w-[340px] py-1 pr-2">Resource</TableHead>
                                        <TableHead className="h-9 w-[150px] py-1 pr-2">Type</TableHead>
                                        {showAssignmentColumn && (
                                          <TableHead className="h-9 w-[170px] py-1 pr-2">
                                            <span className="inline-flex items-center gap-1">
                                              <User className="h-3.5 w-3.5" />
                                              <span>Assigned</span>
                                            </span>
                                          </TableHead>
                                        )}
                                        <TableHead className="h-9 w-[92px] py-1 pr-2 text-right tabular-nums">Qty</TableHead>
                                        <TableHead className="h-9 w-[92px] py-1 pr-2">Unit</TableHead>
                                        {regime !== "client" && <TableHead className="h-9 w-[120px] py-1 pr-2 text-right tabular-nums">Cost unit</TableHead>}
                                        {regime !== "client" && <TableHead className="h-9 w-[120px] py-1 pr-2 text-right tabular-nums">Cost total</TableHead>}
                                        {regime === "contractor" && <TableHead className="h-9 w-[92px] py-1 pr-2 text-right tabular-nums">Markup %</TableHead>}
                                        {regime !== "client" && <TableHead className="h-9 w-[92px] py-1 pr-2 text-right tabular-nums">Discount %</TableHead>}
                                        <TableHead className="h-9 w-[120px] py-1 pr-2 text-right tabular-nums">Client unit</TableHead>
                                        <TableHead className="h-9 w-[126px] py-1 pr-2 text-right tabular-nums">Client total</TableHead>
                                        {canEditEstimate && <TableHead className="h-9 w-10 py-1 pr-0" />}
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {workLines.map((line) => {
                                        const computed = lineTotalsById.get(line.id);
                                        if (!computed) return null;
                                        const otherLabel = line.type === "other" && line.title.toLowerCase().includes("overhead")
                                          ? "Overheads"
                                          : undefined;

                                        return (
                                          <TableRow key={line.id} className={changedLineIds.has(line.id) ? "bg-warning/10" : ""}>
                                            <TableCell className="w-[340px] py-1.5 pr-2 align-top">
                                              <InlineEditableText
                                                value={line.title}
                                                readOnly={!canEditEstimate}
                                                startInEditMode={pendingLineTitleEditId === line.id}
                                                onCommit={(nextValue) => updateLine(pid, line.id, { title: nextValue || line.title })}
                                                displayClassName="whitespace-normal break-words leading-5 max-h-10 overflow-hidden font-medium"
                                              />
                                            </TableCell>

                                            <TableCell className="w-[150px] py-1.5 pr-2 align-top">
                                              {canEditEstimate ? (
                                                <DropdownMenu>
                                                  <DropdownMenuTrigger asChild>
                                                    <button type="button" className="rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40">
                                                      <ResourceTypeBadge type={line.type} labelOverride={otherLabel} />
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
                                                <ResourceTypeBadge type={line.type} labelOverride={otherLabel} />
                                              )}
                                            </TableCell>

                                            {showAssignmentColumn && (
                                              <TableCell className="w-[170px] py-1.5 pr-2 align-top">
                                                {isAssignableResourceType(line.type) ? (
                                                  <AssigneeCell
                                                    assigneeId={line.assigneeId}
                                                    assigneeName={line.assigneeName}
                                                    assigneeEmail={line.assigneeEmail}
                                                    participants={participantOptions}
                                                    editable={canEditEstimate}
                                                    clientView={regime === "client"}
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

                                            <TableCell className="w-[92px] py-1.5 pr-2 align-top">
                                              <InlineEditableText
                                                value={line.unit}
                                                readOnly={!canEditEstimate}
                                                onCommit={(nextValue) => updateLine(pid, line.id, { unit: nextValue || line.unit })}
                                              />
                                            </TableCell>

                                            {regime !== "client" && (
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

                                            {regime !== "client" && (
                                              <TableCell className="w-[120px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                                {money(computed.costTotalCents, estimateProject.currency)}
                                              </TableCell>
                                            )}

                                            {regime === "contractor" && (
                                              <TableCell className="w-[92px] py-1.5 pr-2 align-top">
                                                <InlineEditableNumber
                                                  value={line.markupBps}
                                                  readOnly={!canEditEstimate}
                                                  onCommit={(nextValue) => updateLine(pid, line.id, { markupBps: nextValue })}
                                                  formatDisplay={(value) => fromBpsToPercent(value)}
                                                  formatInput={(value) => fromBpsToPercent(value)}
                                                  parseInput={(raw) => toBpsFromPercent(raw)}
                                                />
                                              </TableCell>
                                            )}

                                            {regime !== "client" && (
                                              <TableCell className="w-[92px] py-1.5 pr-2 align-top">
                                                {canEditEstimate ? (
                                                  <InlineEditableNumber
                                                    value={line.discountBpsOverride ?? 0}
                                                    onCommit={(nextValue) => updateLine(pid, line.id, { discountBpsOverride: nextValue })}
                                                    formatDisplay={(value) => fromBpsToPercent(value)}
                                                    formatInput={(value) => fromBpsToPercent(value)}
                                                    parseInput={(raw) => toBpsFromPercent(raw)}
                                                  />
                                                ) : (
                                                  <div className="min-h-7 px-1 py-0.5 text-right text-sm tabular-nums text-foreground">
                                                    {fromBpsToPercent(effectiveDiscountForDisplay(line, stage, estimateProject.discountBps))}
                                                  </div>
                                                )}
                                              </TableCell>
                                            )}

                                            <TableCell className="w-[120px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                              {money(computed.clientUnitCents, estimateProject.currency)}
                                            </TableCell>
                                            <TableCell className="w-[126px] py-1.5 pr-2 text-right text-sm tabular-nums align-top">
                                              {money(computed.clientTotalCents, estimateProject.currency)}
                                            </TableCell>

                                            {canEditEstimate && (
                                              <TableCell className="w-10 py-1.5 pr-0 align-top">
                                                <Button
                                                  size="icon"
                                                  variant="ghost"
                                                  className="h-7 w-7"
                                                  onClick={() => deleteLine(pid, line.id)}
                                                >
                                                  <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                              </TableCell>
                                            )}
                                          </TableRow>
                                        );
                                      })}

                                      {canEditEstimate && (
                                        <TableRow className="border-b-0 hover:bg-transparent">
                                          <TableCell colSpan={tableColumnCount} className="py-1">
                                            <div className="flex h-8 items-center rounded-md border border-dashed border-border/70 bg-background/40 px-2">
                                              <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                  <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="secondary"
                                                    className="h-6 gap-1 px-2 text-xs opacity-0 transition-opacity group-hover/work:opacity-100 focus-visible:opacity-100"
                                                  >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    Add resource
                                                  </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="start">
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
                                        </TableRow>
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
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
                                  className="h-6 gap-1 px-2 text-xs opacity-0 transition-opacity group-hover/stage:opacity-100 focus-visible:opacity-100"
                                  onClick={() => createWork(pid, { stageId: stage.id, title: `Work ${stageWorks.length + 1}` })}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Add work
                                </Button>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                            <span className="text-caption font-medium text-muted-foreground">Stage subtotal</span>
                            <span className="text-sm font-semibold text-foreground tabular-nums">
                              {money(stageSubtotalById.get(stage.id) ?? 0, estimateProject.currency)}
                            </span>
                          </div>
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
                  onClick={() => createStage(pid, { title: `Stage ${stages.length + 1}` })}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add stage
                </Button>
              </div>
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
          description="All linked tasks must be Done before project status can move to Finished."
          confirmLabel="Close"
          cancelLabel="Cancel"
          tertiaryLabel="Go to Work log"
          onTertiary={handleGoToWorkLog}
          onConfirm={() => setIncompleteTaskBlocks([])}
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
