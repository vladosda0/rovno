import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ConfirmModal";
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
import { useCurrentUser, useProject } from "@/hooks/use-mock-data";
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
import { addEvent } from "@/data/store";
import { computeLineTotals, computeProjectTotals } from "@/lib/estimate-v2/pricing";
import { resolveProjectEstimateCtaState } from "@/lib/estimate-v2/project-estimate-cta";
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

function buildCsv(rows: string[][]): string {
  return rows
    .map((row) => row.map((cell) => {
      const normalized = cell.replace(/"/g, '""');
      if (/[",\n]/.test(normalized)) return `"${normalized}"`;
      return normalized;
    }).join(","))
    .join("\n");
}

export default function ProjectEstimate() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pid = projectId!;
  const { toast } = useToast();
  const currentUser = useCurrentUser();
  const { project } = useProject(pid);

  const {
    project: estimateProject,
    stages,
    works,
    lines,
    dependencies,
    versions,
  } = useEstimateV2Project(pid);

  const authRole = getAuthRole();
  const isOwner = authRole === "owner" && project?.owner_id === currentUser.id;
  const regime = estimateProject.regime;

  const [activeTab, setActiveTab] = useState("estimate");
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [missingDatesWorkIds, setMissingDatesWorkIds] = useState<string[]>([]);
  const [incompleteTaskBlocks, setIncompleteTaskBlocks] = useState<Array<{ taskId: string | null; title: string }>>([]);

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

  const ctaState = resolveProjectEstimateCtaState({
    regime,
    isOwner,
    hasProposedVersion: Boolean(latestProposed),
  });
  const reviewExpandedByDefault = regime === "client" && !isOwner;
  const approvedVersionWithStamp = latestApproved?.approvalStamp ? latestApproved : null;

  if (!project) {
    return <EmptyState icon={AlertTriangle} title="Not found" description="Project not found." />;
  }

  const handleEstimateStatusChange = (
    nextStatus: EstimateExecutionStatus,
    options?: { skipSetup?: boolean },
  ) => {
    if (!isOwner) return;
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

  const handleSubmitToClient = () => {
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
              fromBpsToPercent(line.discountBpsOverride ?? stage.discountBps ?? 0),
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
            fromBpsToPercent(line.discountBpsOverride ?? stage.discountBps ?? 0),
            money(lineTotals.clientUnitCents, estimateProject.currency),
            money(lineTotals.clientTotalCents, estimateProject.currency),
          ]);
        });
      });
    });

    rows.push([]);
    rows.push(["Subtotal", money(totals.subtotalCents, estimateProject.currency)]);
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

  return (
    <div className="space-y-sp-2 p-sp-2">
      <div className="rounded-card border border-border bg-card p-sp-2 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-foreground">{project.title}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={estimateStatusClassName(estimateProject.estimateStatus)}>
                {estimateStatusLabel(estimateProject.estimateStatus)}
              </Badge>
              <Select
                value={estimateProject.estimateStatus}
                onValueChange={(value) => handleEstimateStatusChange(value as EstimateExecutionStatus)}
                disabled={!isOwner}
              >
                <SelectTrigger className="h-8 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="in_work">In work</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="finished">Finished</SelectItem>
                </SelectContent>
              </Select>
              {!isOwner && <span className="text-caption text-muted-foreground">Owner only</span>}
            </div>
            <p className="text-caption text-muted-foreground">Stage → Work → ResourceLine</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Regime: {regime.replace("_", " ")}</Badge>

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

            {ctaState.showClientPreviewBadge && (
              <Badge variant="secondary">Client preview</Badge>
            )}

            {ctaState.showApprove && ctaState.approveDisabledReason && (
              <span className="text-caption text-muted-foreground">{ctaState.approveDisabledReason}</span>
            )}
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="estimate">Estimate</TabsTrigger>
            <TabsTrigger value="work_schedule">Work schedule</TabsTrigger>
            <TabsTrigger value="work_log">Work log</TabsTrigger>
          </TabsList>

          <TabsContent value="estimate" className="mt-3 space-y-3">
            {approvedVersionWithStamp && approvedVersionWithStamp.approvalStamp && (
              <ApprovalStampCard
                stamp={approvedVersionWithStamp.approvalStamp}
                versionNumber={approvedVersionWithStamp.number}
              />
            )}

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

            {isOwner && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => createStage(pid, { title: `Stage ${stages.length + 1}` })}>
                  <Plus className="mr-1 h-4 w-4" /> Add stage
                </Button>
                <div className="flex items-center gap-1">
                  <span className="text-caption text-muted-foreground">Tax %</span>
                  <Input
                    className="h-8 w-20"
                    defaultValue={(estimateProject.taxBps / 100).toString()}
                    onBlur={(e) => {
                      const nextTax = toBpsFromPercent(e.target.value);
                      updateEstimateV2Project(pid, { taxBps: nextTax });
                    }}
                  />
                </div>
              </div>
            )}

            {sortedStages.length === 0 ? (
              <EmptyState icon={AlertTriangle} title="No stages" description="Add your first stage to start Estimate v2." />
            ) : (
              sortedStages.map((stage) => {
                const stageWorks = worksByStage.get(stage.id) ?? [];

                return (
                  <div key={stage.id} className="rounded-card border border-border p-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {isOwner ? (
                          <Input
                            className="h-8 w-[220px]"
                            defaultValue={stage.title}
                            onBlur={(e) => updateStage(pid, stage.id, { title: e.target.value || stage.title })}
                          />
                        ) : (
                          <h3 className="text-body-sm font-semibold">{stage.title}</h3>
                        )}

                        {isOwner && (
                          <div className="flex items-center gap-1">
                            <span className="text-caption text-muted-foreground">Stage discount %</span>
                            <Input
                              className="h-8 w-20"
                              defaultValue={fromBpsToPercent(stage.discountBps)}
                              onBlur={(e) => updateStage(pid, stage.id, { discountBps: toBpsFromPercent(e.target.value) })}
                            />
                          </div>
                        )}
                      </div>

                      {isOwner && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" onClick={() => createWork(pid, { stageId: stage.id, title: `Work ${(stageWorks.length || 0) + 1}` })}>
                            <Plus className="mr-1 h-4 w-4" /> Add work
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteStage(pid, stage.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {stageWorks.map((work) => {
                      const workLines = linesByWork.get(work.id) ?? [];
                      return (
                        <div key={work.id} className="rounded-md border border-border/80 p-2 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            {isOwner ? (
                              <Input
                                className="h-8 w-[220px]"
                                defaultValue={work.title}
                                onBlur={(e) => updateWork(pid, work.id, { title: e.target.value || work.title })}
                              />
                            ) : (
                              <h4 className="text-caption font-medium text-foreground">{work.title}</h4>
                            )}

                            {isOwner && (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => createLine(pid, { stageId: stage.id, workId: work.id, title: "New line", type: "material", qtyMilli: 1000, costUnitCents: 0 })}
                                >
                                  <Plus className="mr-1 h-4 w-4" /> Add line
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteWork(pid, work.id)}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </div>

                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Line</TableHead>
                                {regime !== "client" && <TableHead>Type</TableHead>}
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead>Unit</TableHead>
                                {regime !== "client" && <TableHead className="text-right">Cost unit</TableHead>}
                                {regime !== "client" && <TableHead className="text-right">Cost total</TableHead>}
                                {regime === "contractor" && <TableHead className="text-right">Markup %</TableHead>}
                                {regime !== "client" && <TableHead className="text-right">Discount %</TableHead>}
                                <TableHead className="text-right">Client unit</TableHead>
                                <TableHead className="text-right">Client total</TableHead>
                                {isOwner && <TableHead className="w-10" />}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {workLines.map((line) => {
                                const computed = lineTotalsById.get(line.id);
                                if (!computed) return null;

                                return (
                                  <TableRow key={line.id} className={changedLineIds.has(line.id) ? "bg-warning/10" : ""}>
                                    <TableCell>
                                      {isOwner ? (
                                        <Input
                                          className="h-8"
                                          defaultValue={line.title}
                                          onBlur={(e) => updateLine(pid, line.id, { title: e.target.value || line.title })}
                                        />
                                      ) : (
                                        <span className="text-body-sm font-medium">{line.title}</span>
                                      )}
                                    </TableCell>

                                    {regime !== "client" && (
                                      <TableCell>
                                        {isOwner ? (
                                          <Select
                                            value={line.type}
                                            onValueChange={(value) => updateLine(pid, line.id, { type: value as ResourceLineType })}
                                          >
                                            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="material">Material</SelectItem>
                                              <SelectItem value="tool">Tool</SelectItem>
                                              <SelectItem value="labor">Labor</SelectItem>
                                              <SelectItem value="subcontractor">Subcontractor</SelectItem>
                                              <SelectItem value="other">Other</SelectItem>
                                            </SelectContent>
                                          </Select>
                                        ) : (
                                          labelForType(line.type)
                                        )}
                                      </TableCell>
                                    )}

                                    <TableCell className="text-right">
                                      {isOwner ? (
                                        <Input
                                          className="h-8 text-right"
                                          defaultValue={qtyFromMilli(line.qtyMilli)}
                                          onBlur={(e) => updateLine(pid, line.id, { qtyMilli: toQtyMilli(e.target.value) })}
                                        />
                                      ) : qtyFromMilli(line.qtyMilli)}
                                    </TableCell>

                                    <TableCell>
                                      {isOwner ? (
                                        <Input
                                          className="h-8"
                                          defaultValue={line.unit}
                                          onBlur={(e) => updateLine(pid, line.id, { unit: e.target.value || line.unit })}
                                        />
                                      ) : line.unit}
                                    </TableCell>

                                    {regime !== "client" && (
                                      <TableCell className="text-right">
                                        {isOwner ? (
                                          <Input
                                            className="h-8 text-right"
                                            defaultValue={(line.costUnitCents / 100).toString()}
                                            onBlur={(e) => updateLine(pid, line.id, { costUnitCents: toCentsFromMajor(e.target.value) })}
                                          />
                                        ) : money(line.costUnitCents, estimateProject.currency)}
                                      </TableCell>
                                    )}

                                    {regime !== "client" && (
                                      <TableCell className="text-right">{money(computed.costTotalCents, estimateProject.currency)}</TableCell>
                                    )}

                                    {regime === "contractor" && (
                                      <TableCell className="text-right">
                                        {isOwner ? (
                                          <Input
                                            className="h-8 text-right"
                                            defaultValue={fromBpsToPercent(line.markupBps)}
                                            onBlur={(e) => updateLine(pid, line.id, { markupBps: toBpsFromPercent(e.target.value) })}
                                          />
                                        ) : fromBpsToPercent(line.markupBps)}
                                      </TableCell>
                                    )}

                                    {regime !== "client" && (
                                      <TableCell className="text-right">
                                        {isOwner ? (
                                          <Input
                                            className="h-8 text-right"
                                            defaultValue={fromBpsToPercent(line.discountBpsOverride ?? 0)}
                                            onBlur={(e) => updateLine(pid, line.id, { discountBpsOverride: toBpsFromPercent(e.target.value) })}
                                          />
                                        ) : fromBpsToPercent(line.discountBpsOverride ?? stage.discountBps)}
                                      </TableCell>
                                    )}

                                    <TableCell className="text-right">{money(computed.clientUnitCents, estimateProject.currency)}</TableCell>
                                    <TableCell className="text-right">{money(computed.clientTotalCents, estimateProject.currency)}</TableCell>

                                    {isOwner && (
                                      <TableCell>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          className="h-8 w-8"
                                          onClick={() => deleteLine(pid, line.id)}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </TableCell>
                                    )}
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="work_schedule" className="mt-3 space-y-3">
            <EstimateGantt
              projectId={pid}
              stages={stages}
              works={works}
              dependencies={dependencies}
              isOwner={isOwner}
            />
          </TabsContent>

          <TabsContent value="work_log" className="mt-3">
            <div className="rounded-card border border-border p-3">
              <p className="text-caption text-muted-foreground mb-2">Work log is planned for Phase 2.</p>
              <Button variant="outline" onClick={() => toast({ title: "Open Work log (Phase 2)" })}>
                Open Work log (Phase 2)
              </Button>
            </div>
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
