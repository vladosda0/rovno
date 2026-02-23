import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ShoppingCart, Search, MoreHorizontal, Pencil, Archive,
  PackageCheck, Truck, ChevronDown, ChevronRight, Link2,
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
import { useProject, useProcurementV2 } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import {
  receiveProcurementItem, orderProcurementItem, archiveProcurementItem,
  updateProcurementItem,
} from "@/data/procurement-store";
import { getTask } from "@/data/store";
import { computeStatus, remainingQty, statusLabel, fmtCost } from "@/lib/procurement-utils";
import type { ProcurementAttachment, ProcurementItemV2 } from "@/types/entities";

type FilterStatus = "all" | "to_buy" | "ordered" | "in_stock";

type ProcurementListState = {
  search: string;
  filter: FilterStatus;
  collapsedStageIds: string[];
  scrollY: number;
};

const LIST_FILTERS: FilterStatus[] = ["all", "to_buy", "ordered", "in_stock"];

function listStateKey(projectId: string): string {
  return `procurement:list-state:${projectId}`;
}

function readListState(projectId: string): ProcurementListState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(listStateKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProcurementListState>;
    const filter = LIST_FILTERS.includes(parsed.filter as FilterStatus)
      ? (parsed.filter as FilterStatus)
      : "all";
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      filter,
      collapsedStageIds: Array.isArray(parsed.collapsedStageIds)
        ? parsed.collapsedStageIds.filter((v): v is string => typeof v === "string")
        : [],
      scrollY: typeof parsed.scrollY === "number" ? parsed.scrollY : 0,
    };
  } catch {
    return null;
  }
}

function writeListState(projectId: string, state: ProcurementListState) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(listStateKey(projectId), JSON.stringify(state));
}

function newAttachmentId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function attachmentDisplayName(att: ProcurementAttachment): string {
  if (att.name?.trim()) return att.name;
  try {
    const parsed = new URL(att.url);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return att.url;
  }
}

export default function ProjectProcurement() {
  const { id: projectId, itemId } = useParams<{ id: string; itemId?: string }>();
  const navigate = useNavigate();
  const pid = projectId!;
  const savedListState = useMemo(() => readListState(pid), [pid]);

  const items = useProcurementV2(pid);
  const { stages } = useProject(pid);
  const perm = usePermission(pid);
  const canEdit = perm.can("procurement.edit");

  const [search, setSearch] = useState(savedListState?.search ?? "");
  const [filter, setFilter] = useState<FilterStatus>(savedListState?.filter ?? "all");
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(
    new Set(savedListState?.collapsedStageIds ?? []),
  );

  // Modals
  const [receiveItem, setReceiveItem] = useState<ProcurementItemV2 | null>(null);
  const [receiveQty, setReceiveQty] = useState("");
  const [receivePrice, setReceivePrice] = useState("");

  const [orderItem, setOrderItem] = useState<ProcurementItemV2 | null>(null);
  const [orderQty, setOrderQty] = useState("");
  const [orderSupplier, setOrderSupplier] = useState("");

  const detailItem = itemId ? (items.find((i) => i.id === itemId) ?? null) : null;
  const [editForm, setEditForm] = useState<Partial<ProcurementItemV2>>({});
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<Partial<ProcurementItemV2>>({});
  const lastPersistedSignatureRef = useRef<string>("");
  const revokedObjectUrlsRef = useRef<Set<string>>(new Set());
  const pendingRevokesRef = useRef<Set<string>>(new Set());
  const initializedDetailIdRef = useRef<string | null>(null);

  const persistListState = useCallback((overrides?: Partial<ProcurementListState>) => {
    writeListState(pid, {
      search,
      filter,
      collapsedStageIds: Array.from(collapsedStages),
      scrollY: window.scrollY,
      ...overrides,
    });
  }, [pid, search, filter, collapsedStages]);

  useEffect(() => {
    persistListState();
  }, [persistListState]);

  useEffect(() => {
    const onScroll = () => {
      persistListState({ scrollY: window.scrollY });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [persistListState]);

  // Best-effort scroll restoration for list context.
  useEffect(() => {
    if (!savedListState) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedListState.scrollY, left: 0, behavior: "auto" });
    });
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: savedListState.scrollY, left: 0, behavior: "auto" });
    }, 140);
    return () => window.clearTimeout(timer);
  }, [savedListState]);

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

  const openDetail = (item: ProcurementItemV2) => {
    persistListState({ scrollY: window.scrollY });
    navigate(`/project/${pid}/procurement/${item.id}`);
  };

  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
  }, []);

  const revokeObjectUrlOnce = useCallback((url: string) => {
    if (revokedObjectUrlsRef.current.has(url)) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // no-op: revoke is best effort
    }
    revokedObjectUrlsRef.current.add(url);
    pendingRevokesRef.current.delete(url);
  }, []);

  const flushPendingRevokes = useCallback(() => {
    for (const url of pendingRevokesRef.current) {
      revokeObjectUrlOnce(url);
    }
  }, [revokeObjectUrlOnce]);

  const computeDraftSignature = useCallback((draft: Partial<ProcurementItemV2>): string => {
    const sortedAttachments = [...(draft.attachments ?? [])]
      .map((a) => ({
        id: a.id,
        url: a.url,
        type: a.type,
        name: a.name ?? "",
        isLocal: !!a.isLocal,
        createdAt: a.createdAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify({
      name: draft.name ?? "",
      spec: draft.spec ?? null,
      unit: draft.unit ?? "",
      requiredQty: draft.requiredQty ?? null,
      orderedQty: draft.orderedQty ?? null,
      receivedQty: draft.receivedQty ?? null,
      plannedUnitPrice: draft.plannedUnitPrice ?? null,
      actualUnitPrice: draft.actualUnitPrice ?? null,
      supplier: draft.supplier ?? null,
      linkUrl: draft.linkUrl ?? null,
      notes: draft.notes ?? null,
      attachments: sortedAttachments,
    });
  }, []);

  const persistDraftNowIfChanged = useCallback((draft?: Partial<ProcurementItemV2>) => {
    if (!detailItem) return;
    const nextDraft = draft ?? draftRef.current;
    const nextSignature = computeDraftSignature(nextDraft);
    if (nextSignature === lastPersistedSignatureRef.current) return;
    const payload: Partial<ProcurementItemV2> = { ...nextDraft };
    delete payload.id;
    delete payload.createdAt;
    delete payload.updatedAt;
    updateProcurementItem(detailItem.id, payload);
    lastPersistedSignatureRef.current = nextSignature;
  }, [detailItem, computeDraftSignature]);

  const scheduleDraftPersist = useCallback((draft: Partial<ProcurementItemV2>) => {
    clearAutosaveTimer();
    autosaveTimerRef.current = setTimeout(() => {
      persistDraftNowIfChanged(draft);
    }, 500);
  }, [clearAutosaveTimer, persistDraftNowIfChanged]);

  const patchEditForm = useCallback((
    updater: (prev: Partial<ProcurementItemV2>) => Partial<ProcurementItemV2>,
    mode: "debounce" | "immediate" = "debounce",
  ) => {
    setEditForm((prev) => {
      const next = updater(prev);
      draftRef.current = next;
      if (detailItem) {
        if (mode === "immediate") {
          clearAutosaveTimer();
          persistDraftNowIfChanged(next);
        } else {
          scheduleDraftPersist(next);
        }
      }
      return next;
    });
  }, [detailItem, clearAutosaveTimer, persistDraftNowIfChanged, scheduleDraftPersist]);

  const closeDetail = useCallback(() => {
    clearAutosaveTimer();
    persistDraftNowIfChanged(draftRef.current);
    flushPendingRevokes();
    persistListState({ scrollY: window.scrollY });
    navigate(`/project/${pid}/procurement`);
  }, [clearAutosaveTimer, persistDraftNowIfChanged, flushPendingRevokes, persistListState, navigate, pid]);

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

  const navigateToTask = (taskId: string) => {
    persistListState({ scrollY: window.scrollY });
    navigate(`/project/${pid}/tasks`, { state: { openTaskId: taskId } });
  };

  const addUrlAttachment = () => {
    const url = attachmentUrl.trim();
    if (!url) return;
    const nextAttachment: ProcurementAttachment = {
      id: newAttachmentId("att-link"),
      url,
      type: "link",
      name: url,
      isLocal: false,
      createdAt: new Date().toISOString(),
    };
    patchEditForm((prev) => ({
      ...prev,
      attachments: [...(prev.attachments ?? []), nextAttachment],
    }), "immediate");
    setAttachmentUrl("");
  };

  const addLocalAttachments = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const now = new Date().toISOString();
    const localFiles: ProcurementAttachment[] = Array.from(files).map((file) => ({
      id: newAttachmentId("att-local"),
      url: URL.createObjectURL(file),
      type: file.type || "file",
      name: file.name,
      isLocal: true,
      createdAt: now,
    }));
    patchEditForm((prev) => ({
      ...prev,
      attachments: [...(prev.attachments ?? []), ...localFiles],
    }), "immediate");
  };

  const removeAttachment = (attachmentId: string) => {
    patchEditForm((prev) => {
      const current = prev.attachments ?? [];
      const toRemove = current.find((a) => a.id === attachmentId);
      if (toRemove?.isLocal && toRemove.url.startsWith("blob:")) {
        pendingRevokesRef.current.add(toRemove.url);
        revokeObjectUrlOnce(toRemove.url);
      }
      return {
        ...prev,
        attachments: current.filter((a) => a.id !== attachmentId),
      };
    }, "immediate");
  };

  useEffect(() => {
    if (!detailItem) {
      initializedDetailIdRef.current = null;
      return;
    }
    if (initializedDetailIdRef.current === detailItem.id) return;
    initializedDetailIdRef.current = detailItem.id;
    setEditForm({ ...detailItem });
    draftRef.current = { ...detailItem };
    lastPersistedSignatureRef.current = computeDraftSignature(detailItem);
    setAttachmentUrl("");
    clearAutosaveTimer();
  }, [detailItem, computeDraftSignature, clearAutosaveTimer]);

  useEffect(() => () => {
    clearAutosaveTimer();
    flushPendingRevokes();
  }, [clearAutosaveTimer, flushPendingRevokes]);

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
        onClick={() => openDetail(item)}
      >
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
                  <DropdownMenuItem onClick={() => openDetail(item)}>
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

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or spec..."
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
              <Input value={receivePrice} onChange={(e) => setReceivePrice(e.target.value)} type="number" min="0" className="h-9" placeholder="RUB" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReceiveSubmit}>Receive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      <Dialog open={!!itemId} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="w-[96vw] h-[92vh] sm:h-auto sm:w-[78vw] max-w-6xl max-h-[88vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="border-b border-border px-4 py-3">
            <DialogTitle>Procurement Item Details</DialogTitle>
          </DialogHeader>

          {!detailItem ? (
            <div className="p-4">
              <p className="text-sm text-muted-foreground">Item not found.</p>
            </div>
          ) : (
            <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="space-y-3 w-full">
                <div>
                  <label className="text-xs text-muted-foreground">Name</label>
                  <Input
                    value={editForm.name ?? ""}
                    onChange={(e) => patchEditForm((p) => ({ ...p, name: e.target.value }))}
                    onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Spec</label>
                    <Input
                      value={editForm.spec ?? ""}
                      onChange={(e) => patchEditForm((p) => ({ ...p, spec: e.target.value || null }))}
                      onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Unit</label>
                    <Select value={editForm.unit ?? "pcs"} onValueChange={(v) => patchEditForm((p) => ({ ...p, unit: v }), "immediate")}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["pcs", "m", "m2", "m3", "kg", "l", "set", "roll", "box"].map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {detailItem.receivedQty > 0 && editForm.unit !== detailItem.unit && (
                      <p className="text-[10px] text-warning mt-0.5">Changing unit may change meaning of existing purchases.</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Required</label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.requiredQty ?? 0}
                      onChange={(e) => patchEditForm((p) => ({ ...p, requiredQty: Math.max(0, Number(e.target.value)) }))}
                      onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Ordered</label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.orderedQty ?? 0}
                      onChange={(e) => patchEditForm((p) => ({ ...p, orderedQty: Math.max(0, Number(e.target.value)) }))}
                      onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Received</label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.receivedQty ?? 0}
                      onChange={(e) => patchEditForm((p) => ({ ...p, receivedQty: Math.max(0, Number(e.target.value)) }))}
                      onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                      className="h-9"
                    />
                  </div>
                </div>
                {(editForm.receivedQty ?? 0) > (editForm.requiredQty ?? 0) && (
                  <p className="text-xs text-warning bg-warning/10 rounded px-2 py-1">Overbought: received exceeds required</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Planned unit price</label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.plannedUnitPrice ?? ""}
                      onChange={(e) => patchEditForm((p) => ({ ...p, plannedUnitPrice: e.target.value ? Number(e.target.value) : null }))}
                      onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                      className="h-9"
                      placeholder="RUB"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Actual unit price</label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.actualUnitPrice ?? ""}
                      onChange={(e) => patchEditForm((p) => ({ ...p, actualUnitPrice: e.target.value ? Number(e.target.value) : null }))}
                      onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                      className="h-9"
                      placeholder="RUB"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Supplier</label>
                  <Input
                    value={editForm.supplier ?? ""}
                    onChange={(e) => patchEditForm((p) => ({ ...p, supplier: e.target.value || null }))}
                    onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <Textarea
                    value={editForm.notes ?? ""}
                    onChange={(e) => patchEditForm((p) => ({ ...p, notes: e.target.value || null }))}
                    onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                    rows={2}
                    className="text-sm"
                  />
                </div>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground">Attachments</p>
                  <div>
                    <Input
                      value={attachmentUrl}
                      onChange={(e) => setAttachmentUrl(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        addUrlAttachment();
                      }}
                      placeholder="Paste a link to receipt/invoice (PDF, Drive, etc.)"
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Add file</label>
                    <Input
                      type="file"
                      multiple
                      className="h-9"
                      onChange={(e) => {
                        addLocalAttachments(e.target.files);
                        e.currentTarget.value = "";
                      }}
                    />
                  </div>

                  {(editForm.attachments ?? []).length > 0 ? (
                    <div className="space-y-2">
                      {(editForm.attachments ?? []).map((att) => (
                        <div key={att.id} className="rounded-md bg-muted/40 p-2 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-foreground">{attachmentDisplayName(att)}</p>
                              {att.isLocal && (
                                <span className="inline-flex mt-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                  Local
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <a href={att.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                                Open
                              </a>
                              <button
                                onClick={() => removeAttachment(att.id)}
                                className="text-muted-foreground hover:text-destructive"
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No attachments yet.</p>
                  )}
                </div>

                {detailItem.linkedTaskIds.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Linked tasks</label>
                    <div className="space-y-1">
                      {detailItem.linkedTaskIds.map((tid) => {
                        const task = getTask(tid);
                        return (
                          <button
                            key={tid}
                            onClick={() => navigateToTask(tid)}
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

              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
