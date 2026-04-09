import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { addEvent } from "@/data/store";
import { useEstimateV2Share } from "@/hooks/use-estimate-v2-data";
import { approveVersion, getLatestProposedVersion } from "@/data/estimate-v2-store";
import { computeLineTotals, computeProjectTotals } from "@/lib/estimate-v2/pricing";
import { ApprovalStampCard } from "@/components/estimate-v2/ApprovalStampCard";
import { ApprovalStampFormModal } from "@/components/estimate-v2/ApprovalStampFormModal";
import type { ApprovalStamp } from "@/types/estimate-v2";
import { isAuthenticated } from "@/lib/auth-state";

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

export default function ShareEstimate() {
  const { shareId = "" } = useParams<{ shareId: string }>();
  const { toast } = useToast();
  const navigate = useNavigate();
  const shared = useEstimateV2Share(shareId);

  const [approvalModalOpen, setApprovalModalOpen] = useState(false);

  const snapshot = shared?.version.snapshot;
  const projectId = shared?.projectId ?? "";
  const version = shared?.version ?? null;

  const sortedStages = useMemo(
    () => [...(snapshot?.stages ?? [])].sort((a, b) => a.order - b.order),
    [snapshot?.stages],
  );

  const worksByStage = useMemo(() => {
    const works = snapshot?.works ?? [];
    const map = new Map<string, typeof works>();
    works.forEach((work) => {
      const list = map.get(work.stageId) ?? [];
      list.push(work);
      map.set(work.stageId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.order - b.order));
    return map;
  }, [snapshot?.works]);

  const linesByWork = useMemo(() => {
    const lines = snapshot?.lines ?? [];
    const map = new Map<string, typeof lines>();
    lines.forEach((line) => {
      const list = map.get(line.workId) ?? [];
      list.push(line);
      map.set(line.workId, list);
    });
    return map;
  }, [snapshot?.lines]);

  const stageById = useMemo(
    () => new Map((snapshot?.stages ?? []).map((stage) => [stage.id, stage])),
    [snapshot?.stages],
  );

  const lineTotalsById = useMemo(() => {
    const lines = snapshot?.lines ?? [];
    const project = snapshot?.project;
    const map = new Map<string, ReturnType<typeof computeLineTotals>>();
    if (!project) return map;

    lines.forEach((line) => {
      const stage = stageById.get(line.stageId);
      if (!stage) return;
      map.set(line.id, computeLineTotals(line, stage, project, project.projectMode));
    });
    return map;
  }, [snapshot?.lines, snapshot?.project, stageById]);

  const totals = useMemo(() => {
    if (!snapshot) {
      return {
        subtotalCents: 0,
        taxableBaseCents: 0,
        subtotalBeforeDiscountCents: 0,
        taxAmountCents: 0,
        totalCents: 0,
        costTotalCents: 0,
        markupTotalCents: 0,
        discountTotalCents: 0,
        breakdownByType: {
          material: 0,
          tool: 0,
          labor: 0,
          subcontractor: 0,
          other: 0,
        },
      };
    }

    return computeProjectTotals(
      snapshot.project,
      snapshot.stages,
      snapshot.works,
      snapshot.lines,
      snapshot.project.projectMode,
    );
  }, [snapshot]);

  const latestProposed = projectId ? getLatestProposedVersion(projectId) : null;
  const newerProposed = latestProposed && version && latestProposed.number > version.number ? latestProposed : null;
  const approvalEligible = version?.status === "proposed"
    && version.submitted
    && !version.archived
    && !version.approvalStamp;
  const isGuest = !isAuthenticated();
  const approvalBlockedByPolicy = version?.shareApprovalPolicy === "disabled";
  const canApprove = Boolean(approvalEligible && !isGuest && !approvalBlockedByPolicy);
  const requiresRegistrationToApprove = Boolean(approvalEligible && isGuest && !approvalBlockedByPolicy);

  if (!shared || !snapshot || !version) {
    return (
      <div className="p-sp-3">
        <EmptyState icon={AlertTriangle} title="Shared estimate not found" description="The shared link is invalid or expired." />
      </div>
    );
  }

  const handleApprove = (stamp: ApprovalStamp) => {
    if (!canApprove) {
      toast({ title: "This version can no longer be approved", variant: "destructive" });
      return;
    }

    const ok = approveVersion(projectId, version.id, stamp, { actorId: "client" });

    if (!ok) {
      toast({ title: "Unable to approve this version", variant: "destructive" });
      return;
    }

    setApprovalModalOpen(false);
    toast({ title: "Approved" });
  };

  const handleRegisterToApprove = () => {
    navigate("/auth/signup");
  };

  const handleAskQuestion = () => {
    addEvent({
      id: `evt-share-estimate-question-${Date.now()}`,
      project_id: projectId,
      actor_id: "client",
      type: "comment_added",
      object_type: "estimate_version",
      object_id: version.id,
      timestamp: new Date().toISOString(),
      payload: { text: "Client asked a question from shared estimate page" },
    });

    toast({ title: "Question sent" });
  };

  return (
    <div className="mx-auto max-w-6xl p-sp-3 space-y-sp-2">
      <div className="rounded-card border border-border bg-card p-sp-2 space-y-2">
        <h1 className="text-lg font-semibold text-foreground">Estimate preview</h1>
        <p className="text-caption text-muted-foreground">
          Version #{version.number}
        </p>

        {newerProposed && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-caption text-foreground">New version available.</span>
            <Button size="sm" variant="outline" onClick={() => navigate(`/share/estimate/${newerProposed.shareId}`)}>
              Open latest
            </Button>
          </div>
        )}
        {requiresRegistrationToApprove && (
          <div className="rounded-md border border-info/50 bg-info/10 p-2 text-caption text-foreground">
            Register or sign in to approve this estimate version.
          </div>
        )}
        {approvalBlockedByPolicy && (
          <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-caption text-foreground">
            Approval is unavailable until project owner upgrades plan and adds client as participant.
          </div>
        )}
      </div>

      <div className="rounded-card border border-border bg-card p-sp-2 flex flex-wrap gap-2">
        {version.approvalStamp && (
          <ApprovalStampCard
            stamp={version.approvalStamp}
            versionNumber={version.number}
            className="w-full"
          />
        )}
        <span className="inline-flex items-center rounded-md border border-border px-2 py-1 text-caption">
          Tax: {(snapshot.project.taxBps / 100).toFixed(2)}% ({money(totals.taxAmountCents, snapshot.project.currency)})
        </span>
        <span className="inline-flex items-center rounded-md border border-border px-2 py-1 text-caption font-medium">
          Total: {money(totals.totalCents, snapshot.project.currency)}
        </span>
      </div>

      {sortedStages.map((stage) => {
        const stageWorks = worksByStage.get(stage.id) ?? [];
        return (
          <div key={stage.id} className="rounded-card border border-border bg-card p-sp-2 space-y-2">
            <h2 className="text-body-sm font-semibold text-foreground">{stage.title}</h2>
            {stageWorks.map((work) => {
              const workLines = linesByWork.get(work.id) ?? [];
              return (
                <div key={work.id} className="rounded-md border border-border/80 p-2 space-y-2">
                  <h3 className="text-caption font-medium text-foreground">{work.title}</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Line</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Client unit</TableHead>
                        <TableHead className="text-right">Client total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workLines.map((line) => {
                        const computed = lineTotalsById.get(line.id);
                        if (!computed) return null;
                        return (
                          <TableRow key={line.id}>
                            <TableCell>{line.title}</TableCell>
                            <TableCell className="text-right">{qtyFromMilli(line.qtyMilli)}</TableCell>
                            <TableCell>{line.unit}</TableCell>
                            <TableCell className="text-right">{money(computed.clientUnitCents, snapshot.project.currency)}</TableCell>
                            <TableCell className="text-right">{money(computed.clientTotalCents, snapshot.project.currency)}</TableCell>
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
      })}

      <div className="rounded-card border border-border bg-card p-sp-2 space-y-2">
        <h2 className="text-body-sm font-semibold text-foreground">Approval</h2>
        <div className="flex flex-wrap gap-2">
          {canApprove && <Button onClick={() => setApprovalModalOpen(true)}>Approve</Button>}
          {requiresRegistrationToApprove && (
            <Button onClick={handleRegisterToApprove}>Register to approve</Button>
          )}
          <Button variant="outline" onClick={handleAskQuestion}>Ask questions</Button>
        </div>
      </div>

      <ApprovalStampFormModal
        open={approvalModalOpen}
        onOpenChange={setApprovalModalOpen}
        title="Approve estimate version"
        onSubmit={handleApprove}
      />
    </div>
  );
}
