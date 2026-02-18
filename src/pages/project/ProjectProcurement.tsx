import { useState } from "react";
import { useParams } from "react-router-dom";
import { ShoppingCart, Plus, Check, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PreviewCard } from "@/components/ai/PreviewCard";
import { ActionBar } from "@/components/ai/ActionBar";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { useProcurement, useEstimate, useProject } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import {
  addProcurementItem, updateProcurementItem, deleteProcurementItem,
  addEvent, getCurrentUser,
} from "@/data/store";
import type { ProposalChange } from "@/types/ai";

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

export default function ProjectProcurement() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const items = useProcurement(pid);
  const estimate = useEstimate(pid);
  const { stages } = useProject(pid);
  const perm = usePermission(pid);
  const user = getCurrentUser();
  const isOwner = perm.role === "owner";

  const [showAiProposal, setShowAiProposal] = useState(false);
  const [selectedStageFilter, setSelectedStageFilter] = useState<string | null>(null);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  /* group items by stage */
  const stageMap = new Map<string, typeof items>();
  const unstagedItems: typeof items = [];
  for (const item of items) {
    if (item.stage_id) {
      const arr = stageMap.get(item.stage_id) ?? [];
      arr.push(item);
      stageMap.set(item.stage_id, arr);
    } else {
      unstagedItems.push(item);
    }
  }

  /* AI proposal from estimate */
  const latestVersion = estimate?.versions[estimate.versions.length - 1];
  const materialItems = latestVersion?.items.filter((i) => i.type === "material") ?? [];
  const existingLinkedIds = new Set(items.map((i) => i.estimate_item_id).filter(Boolean));
  const unlinkedMaterials = materialItems.filter((i) => !existingLinkedIds.has(i.id));

  const proposalChanges: ProposalChange[] = unlinkedMaterials.map((i) => {
    const stage = stages.find((s) => s.id === i.stage_id);
    return {
      entity_type: "procurement_item",
      action: "create",
      label: i.title,
      after: `${fmt(i.planned_cost)} · ${stage?.title ?? "No stage"}`,
    };
  });

  function handleCreateFromEstimate(stageOnly?: string) {
    const toCreate = stageOnly
      ? unlinkedMaterials.filter((i) => i.stage_id === stageOnly)
      : unlinkedMaterials;
    let count = 0;
    for (const mat of toCreate) {
      const itemId = `proc-ai-${Date.now()}-${count}`;
      addProcurementItem({
        id: itemId,
        project_id: pid,
        stage_id: mat.stage_id,
        estimate_item_id: mat.id,
        title: mat.title,
        unit: mat.unit,
        qty: mat.qty,
        in_stock: 0,
        cost: mat.planned_cost,
        status: "not_purchased",
      });
      count++;
    }
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "procurement_created",
      object_type: "procurement_item",
      object_id: `batch-${Date.now()}`,
      timestamp: new Date().toISOString(),
      payload: { count },
    });
    setShowAiProposal(false);
    toast({ title: "Purchases created", description: `${count} item(s) added from estimate.` });
  }

  function handleToggleStock(itemId: string, inStock: boolean) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    updateProcurementItem(itemId, { in_stock: inStock ? item.qty : 0 });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "procurement_updated",
      object_type: "procurement_item",
      object_id: itemId,
      timestamp: new Date().toISOString(),
      payload: { title: item.title, in_stock: inStock },
    });
  }

  function handleTogglePurchased(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const newStatus = item.status === "purchased" ? "not_purchased" : "purchased";
    updateProcurementItem(itemId, { status: newStatus as any });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "procurement_updated",
      object_type: "procurement_item",
      object_id: itemId,
      timestamp: new Date().toISOString(),
      payload: { title: item.title, status: newStatus },
    });
    toast({ title: newStatus === "purchased" ? "Marked purchased" : "Unmarked", description: item.title });
  }

  function handleDeleteItem() {
    if (!deleteItemId) return;
    const item = items.find((i) => i.id === deleteItemId);
    deleteProcurementItem(deleteItemId);
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "procurement_deleted",
      object_type: "procurement_item",
      object_id: deleteItemId,
      timestamp: new Date().toISOString(),
      payload: { title: item?.title },
    });
    setDeleteItemId(null);
    toast({ title: "Item deleted" });
  }

  if (items.length === 0 && unlinkedMaterials.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No procurement items"
        description="Add materials from your estimate or create items manually."
        actionLabel={isOwner ? "Add Item" : undefined}
        onAction={isOwner ? () => {} : undefined}
      />
    );
  }

  const totalCost = items.reduce((s, i) => s + i.cost, 0);
  const purchasedCost = items.filter((i) => i.status === "purchased").reduce((s, i) => s + i.cost, 0);

  function renderStageSection(stageId: string, stageItems: typeof items) {
    const stage = stages.find((s) => s.id === stageId);
    return (
      <div key={stageId} className="space-y-1">
        <div className="glass rounded-lg px-3 py-2 flex items-center justify-between">
          <span className="text-body-sm font-semibold text-foreground">{stage?.title ?? "Unknown"}</span>
          <span className="text-caption text-muted-foreground">{stageItems.length} items · {fmt(stageItems.reduce((s, i) => s + i.cost, 0))}</span>
        </div>
        {renderTable(stageItems)}
      </div>
    );
  }

  function renderTable(tableItems: typeof items) {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead className="text-center">In stock</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableItems.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="text-body-sm font-medium text-foreground">{item.title}</TableCell>
              <TableCell className="text-right text-body-sm">{item.qty}</TableCell>
              <TableCell className="text-caption text-muted-foreground">{item.unit}</TableCell>
              <TableCell className="text-right text-body-sm font-medium">{fmt(item.cost)}</TableCell>
              <TableCell className="text-center">
                <Switch
                  checked={item.in_stock >= item.qty}
                  onCheckedChange={(v) => handleToggleStock(item.id, v)}
                  disabled={!perm.can("procurement.edit")}
                />
              </TableCell>
              <TableCell>
                <button
                  onClick={() => perm.can("procurement.edit") && handleTogglePurchased(item.id)}
                  disabled={!perm.can("procurement.edit")}
                  className="cursor-pointer disabled:cursor-default"
                >
                  <StatusBadge
                    status={item.status === "purchased" ? "Purchased" : "Not purchased"}
                    variant="procurement"
                  />
                </button>
              </TableCell>
              <TableCell>
                {isOwner && (
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteItemId(item.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <div className="space-y-sp-2">
      {/* Header */}
      <div className="glass-elevated rounded-card p-sp-2 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-h3 text-foreground">Procurement</h2>
          <p className="text-caption text-muted-foreground">
            {items.length} items · {fmt(totalCost)} total · {fmt(purchasedCost)} purchased
          </p>
        </div>
        {isOwner && unlinkedMaterials.length > 0 && (
          <Button size="sm" onClick={() => setShowAiProposal(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Package className="h-4 w-4 mr-1.5" /> Create from estimate
          </Button>
        )}
      </div>

      {/* AI Proposal */}
      {showAiProposal && proposalChanges.length > 0 && (
        <div className="space-y-2">
          <PreviewCard
            summary={`Create ${unlinkedMaterials.length} purchase items from estimate`}
            changes={proposalChanges}
          />
          <ActionBar
            onConfirm={() => handleCreateFromEstimate()}
            onCancel={() => setShowAiProposal(false)}
            showNewVersion
            onNewVersion={() => {
              const firstStageId = unlinkedMaterials[0]?.stage_id;
              if (firstStageId) handleCreateFromEstimate(firstStageId);
            }}
          />
        </div>
      )}

      {/* Grouped tables */}
      <div className="glass rounded-card overflow-hidden">
        {Array.from(stageMap.entries()).map(([stageId, stageItems]) =>
          renderStageSection(stageId, stageItems)
        )}
        {unstagedItems.length > 0 && (
          <div className="space-y-1">
            <div className="glass rounded-lg px-3 py-2">
              <span className="text-body-sm font-semibold text-muted-foreground">No stage</span>
            </div>
            {renderTable(unstagedItems)}
          </div>
        )}
      </div>

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteItemId}
        onOpenChange={(open) => !open && setDeleteItemId(null)}
        title="Delete item?"
        description="This procurement item will be permanently removed."
        confirmLabel="Delete"
        onConfirm={handleDeleteItem}
        onCancel={() => setDeleteItemId(null)}
      />
    </div>
  );
}
