import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ShoppingCart, Package, Search, MoreHorizontal, Pencil, Archive,
  PackageCheck, Truck, ChevronDown, ChevronRight, Link2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { useProject } from "@/hooks/use-mock-data";
import { useProcurementV2 } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import {
  receiveProcurementItem, orderProcurementItem, archiveProcurementItem,
  updateProcurementItem,
} from "@/data/procurement-store";
import { getTask } from "@/data/store";
import { computeStatus, remainingQty, statusLabel, fmtCost } from "@/lib/procurement-utils";
import type { ProcurementItemV2 } from "@/types/entities";

type FilterStatus = "all" | "to_buy" | "ordered" | "in_stock";

export default function ProjectProcurement() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const pid = projectId!;
  const items = useProcurementV2(pid);
  const { stages } = useProject(pid);
  const perm = usePermission(pid);
  const canEdit = perm.can("procurement.edit");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());

  // Modals
  const [receiveItem, setReceiveItem] = useState<ProcurementItemV2 | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receivePrice, setReceivePrice] = useState("");

  const [orderItem, setOrderItem] = useState<ProcurementItemV2 | null>(null);
  const [orderQty, setOrderQty] = useState("");
  const [orderSupplier, setOrderSupplier] = useState("");

  const [editItem, setEditItem] = useState<ProcurementItemV2 | null>(null);
  const [editForm, setEditForm] = useState<Partial<ProcurementItemV2>>({});

  // Filter + search
  const filtered = items.filter((item) => {
    const status = computeStatus(item);
    if (filter !== "all" && status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = item.name.toLowerCase().includes(q) ||
        (item.spec?.toLowerCase().includes(q) ?? false);
      if (!match) return false;
    }
    return true;
  });

  // Group by stage
  const stageMap = new Map<string, ProcurementItemV2[]>();
  const unstaged: ProcurementItemV2[] = [];
  for (const item of filtered) {
    if (item.stageId) {
      const arr = stageMap.get(item.stageId) ?? [];
      arr.push(item);
      stageMap.set(item.stageId, arr);
    } else {
      unstaged.push(item);
    }
  }

  // Summary
  const toBuyItems = items.filter((i) => computeStatus(i) === "to_buy");
  const orderedItems = items.filter((i) => computeStatus(i) === "ordered");
  const inStockItems = items.filter((i) => computeStatus(i) === "in_stock");
  const totalPlanned = items.reduce((s, i) => s + (i.plannedUnitPrice ?? 0) * i.requiredQty, 0);
  const toBuyCost = toBuyItems.reduce((s, i) => s + (i.plannedUnitPrice ?? 0) * remainingQty(i), 0);

  const toggleStage = (stageId: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId); else next.add(stageId);
      return next;
    });
  };

  // Receive
  const handleReceiveOpen = (item: ProcurementItemV2) => {
    setReceiveItem(item);
    setReceiveQty(String(remainingQty(item)));
    setReceivePrice("");
  };
  const handleReceiveSubmit = () => {
    if (!receiveItem) return;
    const qty = parseFloat(receiveQty);
    if (isNaN(qty) || qty <= 0) { toast({ title: "Invalid quantity" }); return; }
    const price = receivePrice ? parseFloat(receivePrice) : undefined;
    receiveProcurementItem(receiveItem.id, qty, price);
    toast({ title: "Received", description: `${qty} ${receiveItem.unit} of ${receiveItem.name}` });
    setReceiveItem(null);
  };

  // Order
  const handleOrderOpen = (item: ProcurementItemV2) => {
    setOrderItem(item);
    setOrderQty(String(remainingQty(item)));
    setOrderSupplier(item.supplier ?? "");
  };
  const handleOrderSubmit = () => {
    if (!orderItem) return;
    const qty = parseFloat(orderQty);
    if (isNaN(qty) || qty <= 0) { toast({ title: "Invalid quantity" }); return; }
    orderProcurementItem(orderItem.id, qty, orderSupplier || undefined);
    toast({ title: "Ordered", description: `${qty} ${orderItem.unit} of ${orderItem.name}` });
    setOrderItem(null);
  };

  // Edit
  const handleEditOpen = (item: ProcurementItemV2) => {
    setEditItem(item);
    setEditForm({ ...item });
  };
  const handleEditSave = () => {
    if (!editItem) return;
    const payload: Partial<ProcurementItemV2> = { ...editForm };
    delete payload.id;
    delete payload.createdAt;
    delete payload.updatedAt;
    updateProcurementItem(editItem.id, payload);
    toast({ title: "Item updated" });
    setEditItem(null);
  };

  const navigateToTask = (taskId: string) => {
    navigate(`/project/${pid}/tasks`, { state: { openTaskId: taskId } });
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No procurement items"
        description="Items will appear here from your estimate materials or task checklists."
      />
    );
  }

  const filters: { key: FilterStatus; label: string; count: number }[] = [
    { key: "all", label: "All", count: items.length },
    { key: "to_buy", label: "To buy", count: toBuyItems.length },
    { key: "ordered", label: "Ordered", count: orderedItems.length },
    { key: "in_stock", label: "In stock", count: inStockItems.length },
  ];

  function renderItem(item: ProcurementItemV2) {
    const status = computeStatus(item);
    const remaining = remainingQty(item);
    const plannedTotal = item.plannedUnitPrice ? item.plannedUnitPrice * item.requiredQty : null;

    return (
      <div
        key={item.id}
        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors rounded-lg group cursor-pointer"
        onClick={() => handleEditOpen(item)}
      >
        {/* Left: Name + spec + subline */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">{item.name}</span>
            {item.spec && (
              <span className="text-xs text-muted-foreground truncate">{item.spec}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Required {item.requiredQty} {item.unit} · Received {item.receivedQty} · Remaining {remaining}
          </p>
        </div>

        {/* Right: Status + cost + actions */}
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={statusLabel(status)} variant="procurement" />
          <span className="text-xs font-medium text-foreground w-20 text-right">
            {plannedTotal != null ? fmtCost(plannedTotal) : <span className="text-muted-foreground">No price</span>}
          </span>

          {canEdit && (
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
              <Button
                size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => handleReceiveOpen(item)}
                disabled={remaining <= 0}
              >
                <PackageCheck className="h-3.5 w-3.5 mr-1" /> Receive
              </Button>
              <Button
                size="sm" variant="ghost" className="h-7 px-2 text-xs"
                onClick={() => handleOrderOpen(item)}
                disabled={remaining <= 0}
              >
                <Truck className="h-3.5 w-3.5 mr-1" /> Order
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleEditOpen(item)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { archiveProcurementItem(item.id); toast({ title: "Item archived" }); }}>
                    <Archive className="h-3.5 w-3.5 mr-2" /> Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderStageGroup(stageId: string, stageItems: ProcurementItemV2[]) {
    const stage = stages.find((s) => s.id === stageId);
    const collapsed = collapsedStages.has(stageId);
    const groupTotal = stageItems.reduce((s, i) => s + (i.plannedUnitPrice ?? 0) * i.requiredQty, 0);
    return (
      <div key={stageId}>
        <button
          className="w-full flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
          onClick={() => toggleStage(stageId)}
        >
          {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">{stage?.title ?? "Unknown stage"}</span>
          <span className="text-xs text-muted-foreground ml-auto">
            {stageItems.length} items · {fmtCost(groupTotal)}
          </span>
        </button>
        {!collapsed && (
          <div className="mt-0.5">
            {stageItems.map(renderItem)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-sp-2">
      {/* Header */}
      <div className="glass-elevated rounded-card p-sp-2">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <h2 className="text-h3 text-foreground">Procurement</h2>
            <div className="flex flex-wrap gap-2 mt-1">
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                Total: {fmtCost(totalPlanned)}
              </span>
              <span className="text-xs bg-warning/15 px-2 py-0.5 rounded-full text-warning-foreground">
                To buy: {fmtCost(toBuyCost)} ({toBuyItems.length})
              </span>
              <span className="text-xs bg-info/15 px-2 py-0.5 rounded-full text-info">
                Ordered: {orderedItems.length}
              </span>
              <span className="text-xs bg-success/15 px-2 py-0.5 rounded-full text-success">
                In stock: {inStockItems.length}
              </span>
            </div>
          </div>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or spec…"
              className="pl-8 h-8 text-xs"
            />
          </div>
          <div className="flex gap-1">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  filter === f.key
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Item list */}
      <div className="glass rounded-card p-1 space-y-1">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No items match your filters.</p>
        ) : (
          <>
            {Array.from(stageMap.entries())
              .sort(([a], [b]) => {
                const sa = stages.findIndex((s) => s.id === a);
                const sb = stages.findIndex((s) => s.id === b);
                return sa - sb;
              })
              .map(([stageId, stageItems]) => renderStageGroup(stageId, stageItems))}
            {unstaged.length > 0 && renderStageGroup("__unstaged__", unstaged)}
          </>
        )}
      </div>

      {/* Receive Modal */}
      <AlertDialog open={!!receiveItem} onOpenChange={(open) => !open && setReceiveItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Receive: {receiveItem?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Remaining: {receiveItem ? remainingQty(receiveItem) : 0} {receiveItem?.unit}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Quantity received</label>
              <Input value={receiveQty} onChange={(e) => setReceiveQty(e.target.value)} type="number" min="0" className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Actual unit price (optional)</label>
              <Input value={receivePrice} onChange={(e) => setReceivePrice(e.target.value)} type="number" min="0" className="h-9" placeholder="₽" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReceiveSubmit}>Receive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Order Modal */}
      <AlertDialog open={!!orderItem} onOpenChange={(open) => !open && setOrderItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Order: {orderItem?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Remaining: {orderItem ? remainingQty(orderItem) : 0} {orderItem?.unit}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground">Quantity to order</label>
              <Input value={orderQty} onChange={(e) => setOrderQty(e.target.value)} type="number" min="0" className="h-9" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Supplier (optional)</label>
              <Input value={orderSupplier} onChange={(e) => setOrderSupplier(e.target.value)} className="h-9" placeholder="Supplier name" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleOrderSubmit}>Place order</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit / Detail Dialog */}
      <Dialog open={!!editItem} onOpenChange={(open) => !open && setEditItem(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Procurement Item Details</DialogTitle>
          </DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <Input value={editForm.name ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="h-9" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Spec</label>
                  <Input value={editForm.spec ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, spec: e.target.value || null }))} className="h-9" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Unit</label>
                  <Select value={editForm.unit ?? "pcs"} onValueChange={(v) => setEditForm((p) => ({ ...p, unit: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["pcs", "m", "m2", "m3", "kg", "l", "set", "roll", "box"].map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editItem.receivedQty > 0 && editForm.unit !== editItem.unit && (
                    <p className="text-[10px] text-warning mt-0.5">⚠ Changing unit after receiving may affect data meaning</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Required</label>
                  <Input type="number" min="0" value={editForm.requiredQty ?? 0} onChange={(e) => setEditForm((p) => ({ ...p, requiredQty: Math.max(0, Number(e.target.value)) }))} className="h-9" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Ordered</label>
                  <Input type="number" min="0" value={editForm.orderedQty ?? 0} onChange={(e) => setEditForm((p) => ({ ...p, orderedQty: Math.max(0, Number(e.target.value)) }))} className="h-9" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Received</label>
                  <Input type="number" min="0" value={editForm.receivedQty ?? 0} onChange={(e) => setEditForm((p) => ({ ...p, receivedQty: Math.max(0, Number(e.target.value)) }))} className="h-9" />
                </div>
              </div>
              {(editForm.receivedQty ?? 0) > (editForm.requiredQty ?? 0) && (
                <p className="text-xs text-warning bg-warning/10 rounded px-2 py-1">⚠ Overbought: received exceeds required</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Planned unit price</label>
                  <Input type="number" min="0" value={editForm.plannedUnitPrice ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, plannedUnitPrice: e.target.value ? Number(e.target.value) : null }))} className="h-9" placeholder="₽" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Actual unit price</label>
                  <Input type="number" min="0" value={editForm.actualUnitPrice ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, actualUnitPrice: e.target.value ? Number(e.target.value) : null }))} className="h-9" placeholder="₽" />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Supplier</label>
                <Input value={editForm.supplier ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, supplier: e.target.value || null }))} className="h-9" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Link URL</label>
                <Input value={editForm.linkUrl ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, linkUrl: e.target.value || null }))} className="h-9" placeholder="https://" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes</label>
                <Textarea value={editForm.notes ?? ""} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value || null }))} rows={2} className="text-sm" />
              </div>

              {/* Linked tasks */}
              {editItem.linkedTaskIds.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Linked tasks</label>
                  <div className="space-y-1">
                    {editItem.linkedTaskIds.map((tid) => {
                      const task = getTask(tid);
                      return (
                        <button
                          key={tid}
                          onClick={() => { setEditItem(null); navigateToTask(tid); }}
                          className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                        >
                          <Link2 className="h-3 w-3" />
                          {task?.title ?? "Task unavailable"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditItem(null)}>Cancel</Button>
                <Button size="sm" onClick={handleEditSave}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
