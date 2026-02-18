import { useState } from "react";
import { useParams } from "react-router-dom";
import { Calculator, Plus, Archive, Trash2, Link2, Check, X, Lock, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PreviewCard } from "@/components/ai/PreviewCard";
import { ActionBar } from "@/components/ai/ActionBar";
import { EmptyState } from "@/components/EmptyState";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useEstimate, useContractorProposals, useProject } from "@/hooks/use-mock-data";
import { useTasks } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import {
  addEstimateVersion, updateEstimateVersionStatus, deleteEstimateVersion,
  updateEstimateItemPaid, addContractorProposal, updateContractorProposalStatus,
  linkEstimateToTasks, addEvent, getCurrentUser,
} from "@/data/store";
import type { EstimateVersion, EstimateItem, ContractorProposal } from "@/types/entities";
import type { ProposalChange } from "@/types/ai";

/* ---------- helpers ---------- */
function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function versionStatusLabel(s: string) {
  if (s === "draft") return "Draft";
  if (s === "approved") return "Approved";
  return "Archived";
}

export default function ProjectEstimate() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const estimate = useEstimate(pid);
  const proposals = useContractorProposals(pid);
  const { project, stages } = useProject(pid);
  const tasks = useTasks(pid);
  const perm = usePermission(pid);
  const user = getCurrentUser();
  const isOwner = perm.role === "owner";
  const isContractor = perm.role === "contractor";

  const versions = estimate?.versions ?? [];
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const activeVersion = versions.find((v) => v.id === selectedVersionId) ?? versions[0] ?? null;

  /* --- modals --- */
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [proposalItem, setProposalItem] = useState<EstimateItem | null>(null);
  const [proposalCost, setProposalCost] = useState("");
  const [proposalMaterial, setProposalMaterial] = useState("");
  const [proposalComment, setProposalComment] = useState("");
  const [reviewProposal, setReviewProposal] = useState<ContractorProposal | null>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  /* --- AI new version preview --- */
  const [showNewVersionPreview, setShowNewVersionPreview] = useState(false);

  if (!estimate || versions.length === 0) {
    return (
      <EmptyState
        icon={Calculator}
        title="No estimate yet"
        description="Create an estimate via AI or manually to start tracking costs."
        actionLabel={isOwner ? "Create Estimate" : undefined}
        onAction={isOwner ? () => handleCreateFirstVersion() : undefined}
      />
    );
  }

  /* ---------- actions ---------- */
  function handleCreateFirstVersion() {
    const vId = `ev-${Date.now()}`;
    addEstimateVersion(pid, {
      id: vId,
      project_id: pid,
      number: 1,
      status: "draft",
      items: [],
    });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "estimate_created",
      object_type: "estimate_version",
      object_id: vId,
      timestamp: new Date().toISOString(),
      payload: { version: 1 },
    });
    toast({ title: "Estimate created", description: "Draft v1 is ready." });
    setSelectedVersionId(vId);
  }

  function handleApprove() {
    if (!activeVersion) return;
    updateEstimateVersionStatus(activeVersion.id, "approved");
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "estimate_approved",
      object_type: "estimate_version",
      object_id: activeVersion.id,
      timestamp: new Date().toISOString(),
      payload: { version: activeVersion.number },
    });
    toast({ title: "Estimate approved", description: `v${activeVersion.number} is now active.` });
  }

  function handleArchive() {
    if (!activeVersion) return;
    updateEstimateVersionStatus(activeVersion.id, "archived");
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "estimate_archived",
      object_type: "estimate_version",
      object_id: activeVersion.id,
      timestamp: new Date().toISOString(),
      payload: { version: activeVersion.number },
    });
    setArchiveModalOpen(false);
    toast({ title: "Version archived" });
  }

  function handleDelete() {
    if (!activeVersion) return;
    if (activeVersion.status === "approved") {
      toast({ title: "Cannot delete", description: "Approved versions cannot be deleted. Archive it first.", variant: "destructive" });
      setDeleteModalOpen(false);
      return;
    }
    deleteEstimateVersion(activeVersion.id);
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "estimate_deleted",
      object_type: "estimate_version",
      object_id: activeVersion.id,
      timestamp: new Date().toISOString(),
      payload: { version: activeVersion.number },
    });
    setSelectedVersionId(null);
    setDeleteModalOpen(false);
    toast({ title: "Version deleted" });
  }

  function handlePaidUpdate(item: EstimateItem, value: string) {
    if (!activeVersion) return;
    const paid = parseInt(value.replace(/[^\d]/g, "")) || 0;
    updateEstimateItemPaid(activeVersion.id, item.id, paid);
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "estimate_paid_updated",
      object_type: "estimate_item",
      object_id: item.id,
      timestamp: new Date().toISOString(),
      payload: { title: item.title, paid_cost: paid },
    });
    if (paid >= item.planned_cost) {
      toast({ title: "Paid in full", description: item.title });
    }
  }

  function handlePaidInFull(item: EstimateItem) {
    if (!activeVersion) return;
    updateEstimateItemPaid(activeVersion.id, item.id, item.planned_cost);
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "estimate_paid_updated",
      object_type: "estimate_item",
      object_id: item.id,
      timestamp: new Date().toISOString(),
      payload: { title: item.title, paid_cost: item.planned_cost },
    });
    toast({ title: "Marked paid", description: item.title });
  }

  /* --- contractor proposal --- */
  function openProposalModal(item: EstimateItem) {
    setProposalItem(item);
    setProposalCost(String(item.planned_cost));
    setProposalMaterial("");
    setProposalComment("");
    setProposalModalOpen(true);
  }

  function submitContractorProposal() {
    if (!proposalItem || !activeVersion) return;
    const propId = `cprop-${Date.now()}`;
    const cost = parseInt(proposalCost.replace(/[^\d]/g, "")) || proposalItem.planned_cost;
    addContractorProposal({
      id: propId,
      project_id: pid,
      estimate_item_id: proposalItem.id,
      version_id: activeVersion.id,
      author_id: user.id,
      suggested_cost: cost,
      suggested_material: proposalMaterial || undefined,
      comment: proposalComment,
      status: "pending",
      created_at: new Date().toISOString(),
    });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "contractor_proposal_submitted",
      object_type: "contractor_proposal",
      object_id: propId,
      timestamp: new Date().toISOString(),
      payload: { item: proposalItem.title, suggested_cost: cost },
    });
    setProposalModalOpen(false);
    toast({ title: "Proposal submitted", description: "Owner will review your suggestion." });
  }

  function handleAcceptProposal(prop: ContractorProposal) {
    updateContractorProposalStatus(prop.id, "accepted");
    // Apply the suggested cost
    if (activeVersion && prop.suggested_cost !== undefined) {
      updateEstimateItemPaid(activeVersion.id, prop.estimate_item_id, 0); // reset paid
      const items = activeVersion.items.map((i) =>
        i.id === prop.estimate_item_id ? { ...i, planned_cost: prop.suggested_cost! } : i
      );
      // Create new version with updated items
      const newVId = `ev-${Date.now()}`;
      addEstimateVersion(pid, {
        id: newVId,
        project_id: pid,
        number: versions.length + 1,
        status: "draft",
        items,
      });
      addEvent({
        id: `evt-${Date.now()}`,
        project_id: pid,
        actor_id: user.id,
        type: "contractor_proposal_accepted",
        object_type: "contractor_proposal",
        object_id: prop.id,
        timestamp: new Date().toISOString(),
        payload: { item_id: prop.estimate_item_id, new_cost: prop.suggested_cost },
      });
      setSelectedVersionId(newVId);
    }
    setReviewProposal(null);
    toast({ title: "Proposal accepted", description: "New version created with updated costs." });
  }

  function handleRejectProposal(prop: ContractorProposal) {
    updateContractorProposalStatus(prop.id, "rejected");
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "contractor_proposal_rejected",
      object_type: "contractor_proposal",
      object_id: prop.id,
      timestamp: new Date().toISOString(),
      payload: { item_id: prop.estimate_item_id },
    });
    setReviewProposal(null);
    toast({ title: "Proposal rejected" });
  }

  /* --- new version preview --- */
  function handleNewVersionPreview() {
    setShowNewVersionPreview(true);
  }

  function handleCreateNewVersion() {
    if (!activeVersion) return;
    const newVId = `ev-${Date.now()}`;
    addEstimateVersion(pid, {
      id: newVId,
      project_id: pid,
      number: versions.length + 1,
      status: "draft",
      items: activeVersion.items.map((i) => ({ ...i, id: `ei-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, version_id: newVId })),
    });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "estimate_created",
      object_type: "estimate_version",
      object_id: newVId,
      timestamp: new Date().toISOString(),
      payload: { version: versions.length + 1, based_on: activeVersion.number },
    });
    setSelectedVersionId(newVId);
    setShowNewVersionPreview(false);
    toast({ title: "New version created", description: `v${versions.length + 1} based on v${activeVersion.number}` });
  }

  /* --- link to tasks --- */
  function handleLinkToTasks() {
    if (!activeVersion) return;
    // Auto-link by stage
    const links: { itemId: string; taskIds: string[] }[] = [];
    for (const item of activeVersion.items) {
      if (!item.stage_id) continue;
      const stageTasks = tasks.filter((t) => t.stage_id === item.stage_id);
      if (stageTasks.length > 0) {
        links.push({ itemId: item.id, taskIds: stageTasks.map((t) => t.id) });
      }
    }
    if (links.length === 0) {
      toast({ title: "No links found", description: "No tasks match estimate stages.", variant: "destructive" });
      setLinkModalOpen(false);
      return;
    }
    linkEstimateToTasks(activeVersion.id, links);
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "estimate_approved",
      object_type: "estimate_version",
      object_id: activeVersion.id,
      timestamp: new Date().toISOString(),
      payload: { links_count: links.length },
    });
    setLinkModalOpen(false);
    toast({ title: "Linked", description: `${links.length} item(s) linked to tasks.` });
  }

  /* ---------- computed ---------- */
  const totalPlanned = activeVersion?.items.reduce((s, i) => s + i.planned_cost, 0) ?? 0;
  const totalPaid = activeVersion?.items.reduce((s, i) => s + i.paid_cost, 0) ?? 0;
  const paidPct = totalPlanned > 0 ? Math.round((totalPaid / totalPlanned) * 100) : 0;

  const pendingProposals = proposals.filter(
    (p) => p.status === "pending" && p.version_id === activeVersion?.id
  );

  // New version preview changes
  const newVersionChanges: ProposalChange[] = activeVersion
    ? [
        { entity_type: "estimate_item", action: "create", label: `Copy ${activeVersion.items.length} items from v${activeVersion.number}`, after: `v${versions.length + 1}` },
        { entity_type: "meta", action: "create", label: "Status", after: "Draft" },
      ]
    : [];

  // Link preview changes
  const linkPreviewChanges: ProposalChange[] = activeVersion
    ? activeVersion.items
        .filter((i) => i.stage_id)
        .map((i) => {
          const stage = stages.find((s) => s.id === i.stage_id);
          const count = tasks.filter((t) => t.stage_id === i.stage_id).length;
          return {
            entity_type: "task",
            action: "update" as const,
            label: i.title,
            after: `${count} task(s) in ${stage?.title ?? "stage"}`,
          };
        })
    : [];

  return (
    <div className="flex gap-sp-2 min-h-[60vh]">
      {/* --- Version sidebar --- */}
      <div className="glass rounded-card p-sp-2 w-56 shrink-0 space-y-2">
        <h3 className="text-body-sm font-semibold text-foreground">Versions</h3>
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => setSelectedVersionId(v.id)}
            className={`w-full text-left rounded-lg px-3 py-2 transition-colors text-body-sm ${
              v.id === activeVersion?.id
                ? "bg-accent/10 text-accent font-medium"
                : "hover:bg-muted/50 text-foreground"
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span>v{v.number}</span>
              <StatusBadge status={versionStatusLabel(v.status)} variant="estimate" />
            </div>
          </button>
        ))}
        {isOwner && (
          <Button variant="outline" size="sm" className="w-full mt-2" onClick={handleNewVersionPreview}>
            <Plus className="h-3.5 w-3.5 mr-1" /> New version
          </Button>
        )}
      </div>

      {/* --- Main content --- */}
      <div className="flex-1 min-w-0 space-y-sp-2">
        {/* Header */}
        {activeVersion && (
          <div className="glass-elevated rounded-card p-sp-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-h3 text-foreground">
                  Estimate v{activeVersion.number}
                </h2>
                <p className="text-caption text-muted-foreground">
                  {activeVersion.items.length} items · {fmt(totalPlanned)} planned · {fmt(totalPaid)} paid ({paidPct}%)
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {isOwner && activeVersion.status === "draft" && (
                  <Button size="sm" onClick={handleApprove} className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <Check className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                )}
                {isOwner && (
                  <Button size="sm" variant="outline" onClick={() => setLinkModalOpen(true)}>
                    <Link2 className="h-3.5 w-3.5 mr-1" /> Link to tasks
                  </Button>
                )}
                {isOwner && activeVersion.status !== "archived" && (
                  <Button size="sm" variant="outline" onClick={() => setArchiveModalOpen(true)}>
                    <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                  </Button>
                )}
                {isOwner && activeVersion.status !== "approved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteModalOpen(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Budget warning */}
            {paidPct > 90 && paidPct < 100 && (
              <div className="mt-2 px-3 py-1.5 rounded-lg bg-warning/10 text-warning text-caption font-medium">
                ⚠ Budget {paidPct}% spent — approaching limit
              </div>
            )}
            {paidPct >= 100 && (
              <div className="mt-2 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-caption font-medium">
                ⚠ Budget exceeded — {fmt(totalPaid - totalPlanned)} over
              </div>
            )}
          </div>
        )}

        {/* Pending contractor proposals (owner view) */}
        {isOwner && pendingProposals.length > 0 && (
          <div className="glass rounded-card p-sp-2 space-y-2">
            <h3 className="text-body-sm font-semibold text-foreground">
              Contractor proposals ({pendingProposals.length})
            </h3>
            {pendingProposals.map((prop) => {
              const item = activeVersion?.items.find((i) => i.id === prop.estimate_item_id);
              return (
                <div key={prop.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/30">
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-foreground truncate">{item?.title ?? "Item"}</p>
                    <p className="text-caption text-muted-foreground truncate">{prop.comment}</p>
                    {prop.suggested_cost !== undefined && (
                      <p className="text-caption text-foreground">
                        <span className="line-through text-muted-foreground">{fmt(item?.planned_cost ?? 0)}</span>
                        {" → "}{fmt(prop.suggested_cost)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" className="h-7 bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => handleAcceptProposal(prop)}>
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => handleRejectProposal(prop)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* New version preview */}
        {showNewVersionPreview && (
          <div className="space-y-2">
            <PreviewCard
              summary={`Create v${versions.length + 1} from v${activeVersion?.number ?? 1}`}
              changes={newVersionChanges}
            />
            <ActionBar
              onConfirm={handleCreateNewVersion}
              onCancel={() => setShowNewVersionPreview(false)}
            />
          </div>
        )}

        {/* Table */}
        {activeVersion && activeVersion.items.length > 0 ? (
          <div className="glass rounded-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Unit</TableHead>
                  <TableHead className="text-right">Planned</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeVersion.items.map((item, idx) => {
                  const stage = stages.find((s) => s.id === item.stage_id);
                  const linkedTasks = tasks.filter((t) => t.linked_estimate_item_ids.includes(item.id));
                  const isPaidFull = item.paid_cost >= item.planned_cost;
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-caption text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <div className="text-body-sm font-medium text-foreground">{item.title}</div>
                        {linkedTasks.length > 0 && (
                          <span className="text-caption text-accent">
                            <Link2 className="inline h-3 w-3 mr-0.5" />
                            {linkedTasks.length} task{linkedTasks.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-caption text-muted-foreground">{stage?.title ?? "—"}</TableCell>
                      <TableCell>
                        <span className={`text-caption font-medium ${item.type === "work" ? "text-info" : "text-warning"}`}>
                          {item.type === "work" ? "Work" : "Material"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-body-sm">{item.qty}</TableCell>
                      <TableCell className="text-caption text-muted-foreground">{item.unit}</TableCell>
                      <TableCell className="text-right text-body-sm font-medium">{fmt(item.planned_cost)}</TableCell>
                      <TableCell className="text-right">
                        {isOwner ? (
                          <Input
                            className="h-7 w-24 text-right text-body-sm ml-auto"
                            defaultValue={item.paid_cost}
                            onBlur={(e) => handlePaidUpdate(item, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                          />
                        ) : (
                          <span className="text-body-sm">{fmt(item.paid_cost)}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {isOwner && !isPaidFull && (
                            <Button size="sm" variant="outline" className="h-7 text-caption" onClick={() => handlePaidInFull(item)}>
                              Paid
                            </Button>
                          )}
                          {isPaidFull && (
                            <StatusBadge status="Approved" variant="estimate" className="text-[10px]" />
                          )}
                          {isContractor && (
                            <Button size="sm" variant="outline" className="h-7 text-caption" onClick={() => openProposalModal(item)}>
                              <MessageSquare className="h-3 w-3 mr-1" /> Suggest
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Totals row */}
                <TableRow className="font-semibold border-t-2">
                  <TableCell colSpan={6} className="text-body-sm text-foreground">Total</TableCell>
                  <TableCell className="text-right text-body-sm">{fmt(totalPlanned)}</TableCell>
                  <TableCell className="text-right text-body-sm">{fmt(totalPaid)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        ) : activeVersion ? (
          <div className="glass rounded-card p-sp-3 text-center">
            <p className="text-body-sm text-muted-foreground">No items yet. Use AI to generate estimate items.</p>
          </div>
        ) : null}

        {/* Link to tasks preview */}
        {linkModalOpen && (
          <div className="space-y-2">
            <PreviewCard
              summary={`Link estimate items to tasks by stage`}
              changes={linkPreviewChanges}
            />
            <ActionBar
              onConfirm={handleLinkToTasks}
              onCancel={() => setLinkModalOpen(false)}
            />
          </div>
        )}
      </div>

      {/* --- Modals --- */}
      <ConfirmModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        title="Delete version?"
        description={`This will permanently remove v${activeVersion?.number}. This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteModalOpen(false)}
      />

      <ConfirmModal
        open={archiveModalOpen}
        onOpenChange={setArchiveModalOpen}
        title="Archive version?"
        description={`v${activeVersion?.number} will be moved to archive and become read-only.`}
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setArchiveModalOpen(false)}
      />

      {/* Contractor proposal modal */}
      <AlertDialog open={proposalModalOpen} onOpenChange={setProposalModalOpen}>
        <AlertDialogContent className="glass-modal rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>Suggest a change</AlertDialogTitle>
            <AlertDialogDescription>
              Propose an update to "{proposalItem?.title}"
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Suggested cost (₽)</label>
              <Input value={proposalCost} onChange={(e) => setProposalCost(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Alternative material (optional)</label>
              <Input value={proposalMaterial} onChange={(e) => setProposalMaterial(e.target.value)} placeholder="e.g. Use Brand X instead" />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Comment</label>
              <Textarea value={proposalComment} onChange={(e) => setProposalComment(e.target.value)} placeholder="Explain your suggestion..." className="min-h-[60px]" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitContractorProposal} className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={!proposalComment.trim()}>
              Submit proposal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
