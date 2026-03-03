import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Download, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  createDependency,
  createLine,
  createStage,
  createVersionSnapshot,
  createWork,
  deleteDependency,
  deleteLine,
  deleteStage,
  deleteWork,
  setRegime,
  submitVersion,
  updateEstimateV2Project,
  updateLine,
  updateStage,
  updateWork,
} from "@/data/estimate-v2-store";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";
import { addEvent } from "@/data/store";
import { computeLineTotals, computeProjectTotals } from "@/lib/estimate-v2/pricing";
import type {
  EstimateV2DiffResult,
  EstimateV2ResourceLine,
  EstimateV2Stage,
  EstimateV2Work,
  Regime,
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

function changeLabel(diff: EstimateV2DiffResult): string[] {
  const lines: string[] = [];
  diff.stageChanges.forEach((change) => lines.push(`Stage ${change.type}: ${change.id}`));
  diff.workChanges.forEach((change) => lines.push(`Work ${change.type}: ${change.id}`));
  diff.lineChanges.forEach((change) => lines.push(`Line ${change.type}: ${change.id}`));
  return lines;
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
  const [reviewChangesOpen, setReviewChangesOpen] = useState(false);
  const [depFromWorkId, setDepFromWorkId] = useState<string>("");
  const [depToWorkId, setDepToWorkId] = useState<string>("");
  const [depLagDays, setDepLagDays] = useState("0");

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

  if (!project) {
    return <EmptyState icon={AlertTriangle} title="Not found" description="Project not found." />;
  }

  const handleSubmitToClient = () => {
    const snapshot = createVersionSnapshot(pid, currentUser.id);
    const ok = submitVersion(pid, snapshot.versionId);
    if (!ok) {
      toast({ title: "Only project owner can submit versions", variant: "destructive" });
      return;
    }
    toast({ title: "New estimate version submitted" });
  };

  const handleProjectApprove = () => {
    if (!latestProposed) return;
    const [firstName = "Client", ...rest] = currentUser.name.split(" ");
    const stamp = {
      name: firstName,
      surname: rest.join(" ") || "User",
      email: currentUser.email,
      timestamp: new Date().toISOString(),
    };

    const ok = approveVersion(pid, latestProposed.id, stamp, { actorId: currentUser.id });
    if (!ok) {
      toast({ title: "Unable to approve version", variant: "destructive" });
      return;
    }
    toast({ title: "Estimate version approved" });
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
          <div>
            <h2 className="text-lg font-semibold text-foreground">Estimate</h2>
            <p className="text-caption text-muted-foreground">
              Stage → Work → ResourceLine
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isOwner ? (
              <Select
                value={regime}
                onValueChange={(value) => {
                  const ok = setRegime(pid, value as Regime);
                  if (!ok) {
                    toast({ title: "Only project owner can switch regime", variant: "destructive" });
                  }
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="build_myself">Build myself</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Badge variant="secondary">Regime: {regime.replace("_", " ")}</Badge>
            )}

            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>

            {isOwner && (
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleSubmitToClient}>
                Submit to client
              </Button>
            )}
          </div>
        </div>

        {pendingProposed && latestProposed && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-body-sm text-foreground font-medium">
                New version submitted, review changes.
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setReviewChangesOpen((prev) => !prev)}>
                  Review changes
                </Button>
                {isOwner && (
                  <Button size="sm" onClick={handleSubmitToClient}>
                    Submit to client
                  </Button>
                )}
                {!isOwner && regime === "client" && (
                  <>
                    <Button size="sm" onClick={handleProjectApprove}>Approve</Button>
                    <Button variant="outline" size="sm" onClick={handleAskQuestions}>Ask questions</Button>
                  </>
                )}
              </div>
            </div>

            {reviewChangesOpen && (
              <div className="rounded-md border border-border bg-background p-2">
                <p className="text-caption font-medium mb-1">Changed items</p>
                {changeLabel(diff).length === 0 ? (
                  <p className="text-caption text-muted-foreground">No detected changes.</p>
                ) : (
                  <div className="space-y-1">
                    {changeLabel(diff).map((line) => (
                      <p key={line} className="text-caption text-muted-foreground">• {line}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="estimate">Estimate</TabsTrigger>
            <TabsTrigger value="work_schedule">Work schedule</TabsTrigger>
            <TabsTrigger value="work_log">Work log</TabsTrigger>
          </TabsList>

          <TabsContent value="estimate" className="mt-3 space-y-3">
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
            <div className="rounded-card border border-border p-3 space-y-3">
              <h3 className="text-body-sm font-semibold text-foreground">Dependencies (optional)</h3>
              <p className="text-caption text-muted-foreground">Phase 1 supports FS dependencies only.</p>

              <div className="grid gap-2 sm:grid-cols-4">
                <Select value={depFromWorkId} onValueChange={setDepFromWorkId}>
                  <SelectTrigger><SelectValue placeholder="From work" /></SelectTrigger>
                  <SelectContent>
                    {works.map((work) => <SelectItem key={work.id} value={work.id}>{work.title}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Select value={depToWorkId} onValueChange={setDepToWorkId}>
                  <SelectTrigger><SelectValue placeholder="To work" /></SelectTrigger>
                  <SelectContent>
                    {works.map((work) => <SelectItem key={work.id} value={work.id}>{work.title}</SelectItem>)}
                  </SelectContent>
                </Select>

                <Input
                  value={depLagDays}
                  onChange={(e) => setDepLagDays(e.target.value)}
                  placeholder="Lag days"
                  type="number"
                />

                <Button
                  onClick={() => {
                    if (!depFromWorkId || !depToWorkId || depFromWorkId === depToWorkId) return;
                    createDependency(pid, {
                      fromWorkId: depFromWorkId,
                      toWorkId: depToWorkId,
                      lagDays: Number(depLagDays) || 0,
                    });
                    setDepFromWorkId("");
                    setDepToWorkId("");
                    setDepLagDays("0");
                  }}
                >
                  Add FS dependency
                </Button>
              </div>

              {dependencies.length === 0 ? (
                <p className="text-caption text-muted-foreground">No dependencies yet.</p>
              ) : (
                <div className="space-y-1">
                  {dependencies.map((dep) => {
                    const fromWork = works.find((work) => work.id === dep.fromWorkId);
                    const toWork = works.find((work) => work.id === dep.toWorkId);
                    return (
                      <div key={dep.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5">
                        <span className="text-caption text-foreground">
                          {fromWork?.title ?? dep.fromWorkId} → {toWork?.title ?? dep.toWorkId} (FS, lag {dep.lagDays}d)
                        </span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteDependency(pid, dep.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
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
      </div>
    </div>
  );
}
