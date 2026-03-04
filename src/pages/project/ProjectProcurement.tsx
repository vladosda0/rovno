import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  Link2,
  Search,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { EmptyState } from "@/components/EmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { useProject, useProcurementV2 } from "@/hooks/use-mock-data";
import { useOrders } from "@/hooks/use-order-data";
import { useInventoryStock, useLocations } from "@/hooks/use-inventory-data";
import { usePermission } from "@/lib/permissions";
import {
  archiveProcurementItem,
  updateProcurementItem,
} from "@/data/procurement-store";
import { getTask } from "@/data/store";
import {
  computeFulfilledQty,
  computeInStockByLocation,
  computeRemainingRequestedQty,
  computeTabChipTotals,
  isEstimateLinkedProcurementItem,
} from "@/lib/procurement-fulfillment";
import { fmtCost } from "@/lib/procurement-utils";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { OrderModal } from "@/components/procurement/OrderModal";
import { OrderDetailModal } from "@/components/procurement/OrderDetailModal";
import { ItemTypePicker } from "@/components/procurement/ItemTypePicker";
import { ResourceTypeBadge } from "@/components/estimate-v2/ResourceTypeBadge";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";
import { relinkProcurementItemToEstimateV2Line } from "@/lib/estimate-v2/procurement-sync";
import { computeProjectTotals } from "@/lib/estimate-v2/pricing";
import type {
  OrderWithLines,
  ProcurementAttachment,
  ProcurementItemV2,
  ProcurementItemType,
} from "@/types/entities";

type ProcurementTab = "requested" | "ordered" | "in_stock";

type ProcurementListState = {
  search: string;
  activeTab: ProcurementTab;
  collapsedStageIds: string[];
  scrollY: number;
};

const TABS: ProcurementTab[] = ["requested", "ordered", "in_stock"];

const TAB_META: Record<ProcurementTab, { label: string; className: string }> = {
  requested: { label: "Requested", className: "bg-warning/15 text-warning-foreground border-warning/30" },
  ordered: { label: "Ordered", className: "bg-info/15 text-info border-info/25" },
  in_stock: { label: "In stock", className: "bg-success/15 text-success border-success/25" },
};

function listStateKey(projectId: string): string {
  return `procurement-v3:list-state:${projectId}`;
}

function readListState(projectId: string): ProcurementListState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(listStateKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProcurementListState>;
    const activeTab = TABS.includes(parsed.activeTab as ProcurementTab)
      ? (parsed.activeTab as ProcurementTab)
      : "requested";

    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      activeTab,
      collapsedStageIds: Array.isArray(parsed.collapsedStageIds)
        ? parsed.collapsedStageIds.filter((value): value is string => typeof value === "string")
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

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString();
}

function isOverdue(value?: string | null): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return parsed.getTime() < now.getTime();
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

function newAttachmentId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function orderStatusLabel(status: "draft" | "placed" | "received" | "voided"): string {
  if (status === "draft") return "Draft";
  if (status === "placed") return "Ordered";
  if (status === "voided") return "Voided";
  return "In stock";
}

function rowQtyPrice(
  item: ProcurementItemV2,
  qty: number,
): { planned: number; actual: number; factual: number } {
  const planned = item.plannedUnitPrice ?? 0;
  const actual = item.actualUnitPrice ?? 0;
  return {
    planned,
    actual,
    factual: actual * qty,
  };
}

export default function ProjectProcurement() {
  const { id: projectId, itemId, orderId } = useParams<{ id: string; itemId?: string; orderId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const pid = projectId!;

  const savedListState = useMemo(() => readListState(pid), [pid]);

  const items = useProcurementV2(pid);
  const orders = useOrders(pid);
  const locations = useLocations(pid);
  const stockRows = useInventoryStock(pid);
  const { stages } = useProject(pid);
  const estimateState = useEstimateV2Project(pid);
  const perm = usePermission(pid);
  const canEdit = perm.can("procurement.edit");

  const [search, setSearch] = useState(savedListState?.search ?? "");
  const [activeTab, setActiveTab] = useState<ProcurementTab>(savedListState?.activeTab ?? "requested");
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set(savedListState?.collapsedStageIds ?? []));
  const [collapsedOrderIds, setCollapsedOrderIds] = useState<Set<string>>(new Set());
  const [collapsedLocationIds, setCollapsedLocationIds] = useState<Set<string>>(new Set());
  const [selectedRequestedIds, setSelectedRequestedIds] = useState<Set<string>>(new Set());

  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [createOrderItemIds, setCreateOrderItemIds] = useState<string[]>([]);

  const detailItem = itemId ? (items.find((item) => item.id === itemId) ?? null) : null;
  const [editForm, setEditForm] = useState<Partial<ProcurementItemV2>>({});
  const [attachmentUrl, setAttachmentUrl] = useState("");
  const [relinkLineId, setRelinkLineId] = useState<string>("");

  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<Partial<ProcurementItemV2>>({});
  const lastPersistedSignatureRef = useRef<string>("");
  const initializedDetailIdRef = useRef<string | null>(null);
  const revokedObjectUrlsRef = useRef<Set<string>>(new Set());
  const pendingRevokesRef = useRef<Set<string>>(new Set());
  const filePickerRef = useRef<HTMLInputElement | null>(null);

  const normalizedBudget = useMemo(() => {
    const totals = computeProjectTotals(
      estimateState.project,
      estimateState.stages,
      estimateState.works,
      estimateState.lines,
      estimateState.project.regime,
    );
    const procurementCostCents = totals.breakdownByType.material + totals.breakdownByType.tool;
    return procurementCostCents / 100;
  }, [estimateState.project, estimateState.stages, estimateState.works, estimateState.lines]);

  const persistListState = useCallback((overrides?: Partial<ProcurementListState>) => {
    writeListState(pid, {
      search,
      activeTab,
      collapsedStageIds: Array.from(collapsedStages),
      scrollY: window.scrollY,
      ...overrides,
    });
  }, [pid, search, activeTab, collapsedStages]);

  useEffect(() => {
    persistListState();
  }, [persistListState]);

  useEffect(() => {
    const onScroll = () => persistListState({ scrollY: window.scrollY });
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [persistListState]);

  useEffect(() => {
    if (!savedListState) return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: savedListState.scrollY, left: 0, behavior: "auto" });
    });
    const timer = window.setTimeout(() => {
      window.scrollTo({ top: savedListState.scrollY, left: 0, behavior: "auto" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [savedListState]);

  const remainingByItemId = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => {
      map.set(item.id, computeRemainingRequestedQty(item.id, orders));
    });
    return map;
  }, [items, orders]);

  const fulfilledByItemId = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((item) => {
      map.set(item.id, computeFulfilledQty(item.id, orders));
    });
    return map;
  }, [items, orders]);

  const plannedFulfilledTotal = useMemo(() => (
    items.reduce((sum, item) => sum + (item.plannedUnitPrice ?? 0) * (fulfilledByItemId.get(item.id) ?? 0), 0)
  ), [items, fulfilledByItemId]);

  const actualFulfilledTotal = useMemo(() => (
    items.reduce((sum, item) => sum + (item.actualUnitPrice ?? 0) * (fulfilledByItemId.get(item.id) ?? 0), 0)
  ), [items, fulfilledByItemId]);

  const economy = actualFulfilledTotal - plannedFulfilledTotal;

  const chipTotals = useMemo(
    () => computeTabChipTotals(pid, items, orders, stockRows),
    [pid, items, orders, stockRows],
  );

  const isItemSearchMatch = useCallback((item: ProcurementItemV2) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return item.name.toLowerCase().includes(q) || (item.spec?.toLowerCase().includes(q) ?? false);
  }, [search]);

  const requestedItems = useMemo(() => (
    items
      .filter(isEstimateLinkedProcurementItem)
      .filter((item) => (remainingByItemId.get(item.id) ?? 0) > 0)
      .filter(isItemSearchMatch)
  ), [items, remainingByItemId, isItemSearchMatch]);

  const requestedStageMap = useMemo(() => {
    const map = new Map<string, ProcurementItemV2[]>();
    const unstaged: ProcurementItemV2[] = [];

    requestedItems.forEach((item) => {
      if (!item.stageId) {
        unstaged.push(item);
        return;
      }
      const list = map.get(item.stageId) ?? [];
      list.push(item);
      map.set(item.stageId, list);
    });

    return { map, unstaged };
  }, [requestedItems]);

  useEffect(() => {
    if (activeTab !== "requested" && selectedRequestedIds.size > 0) {
      setSelectedRequestedIds(new Set());
    }
  }, [activeTab, selectedRequestedIds.size]);

  useEffect(() => {
    setSelectedRequestedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(requestedItems.map((item) => item.id));
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [requestedItems]);

  const procurementEstimateLines = useMemo(
    () => estimateState.lines.filter((line) => line.type === "material" || line.type === "tool"),
    [estimateState.lines],
  );

  const placedSupplierOrders = useMemo(() => (
    orders
      .filter((order) => order.kind === "supplier" && order.status === "placed")
      .filter((order) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        const supplierMatch = (order.supplierName ?? "").toLowerCase().includes(q);
        const lineMatch = order.lines.some((line) => {
          const item = items.find((entry) => entry.id === line.procurementItemId);
          return (
            item?.name.toLowerCase().includes(q)
            || (item?.spec?.toLowerCase().includes(q) ?? false)
          );
        });
        return supplierMatch || lineMatch;
      })
  ), [orders, search, items]);

  const inStockGroups = useMemo(() => {
    const groups = computeInStockByLocation(pid, items, orders, locations);
    if (!search.trim()) return groups;
    const q = search.trim().toLowerCase();

    return groups
      .map((group) => {
        const itemsFiltered = group.items.filter((entry) => {
          const item = items.find((candidate) => candidate.id === entry.procurementItemId);
          return (
            item?.name.toLowerCase().includes(q)
            || (item?.spec?.toLowerCase().includes(q) ?? false)
          );
        });

        if (group.locationName.toLowerCase().includes(q)) return group;
        if (itemsFiltered.length === 0) return null;

        return {
          ...group,
          items: itemsFiltered,
        };
      })
      .filter((group): group is NonNullable<typeof group> => !!group);
  }, [pid, items, orders, locations, search]);

  const relatedOrdersByItemId = useMemo(() => {
    const map = new Map<string, OrderWithLines[]>();
    items.forEach((item) => map.set(item.id, []));
    orders.forEach((order) => {
      order.lines.forEach((line) => {
        const list = map.get(line.procurementItemId) ?? [];
        list.push(order);
        map.set(line.procurementItemId, list);
      });
    });
    return map;
  }, [items, orders]);

  const toggleStage = (stageId: string) => {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  };

  const toggleOrder = (id: string) => {
    setCollapsedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleLocation = (id: string) => {
    setCollapsedLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openDetail = (item: ProcurementItemV2) => {
    persistListState({ scrollY: window.scrollY });
    navigate(`/project/${pid}/procurement/${item.id}`);
  };

  const openOrderDetail = (id: string) => {
    persistListState({ scrollY: window.scrollY });
    navigate(`/project/${pid}/procurement/order/${id}`);
  };

  const closeOrderDetail = () => {
    persistListState({ scrollY: window.scrollY });
    navigate(`/project/${pid}/procurement`);
  };

  const clearAutosaveTimer = useCallback(() => {
    if (!autosaveTimerRef.current) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
  }, []);

  const revokeObjectUrlOnce = useCallback((url: string) => {
    if (revokedObjectUrlsRef.current.has(url)) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // no-op
    }
    revokedObjectUrlsRef.current.add(url);
    pendingRevokesRef.current.delete(url);
  }, []);

  const flushPendingRevokes = useCallback(() => {
    pendingRevokesRef.current.forEach((url) => revokeObjectUrlOnce(url));
  }, [revokeObjectUrlOnce]);

  const computeDraftSignature = useCallback((draft: Partial<ProcurementItemV2>): string => {
    const sortedAttachments = [...(draft.attachments ?? [])]
      .map((attachment) => ({
        id: attachment.id,
        url: attachment.url,
        type: attachment.type,
        name: attachment.name ?? "",
        isLocal: !!attachment.isLocal,
        createdAt: attachment.createdAt,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return JSON.stringify({
      type: draft.type ?? "material",
      name: draft.name ?? "",
      spec: draft.spec ?? null,
      unit: draft.unit ?? "",
      requiredByDate: draft.requiredByDate ?? null,
      requiredQty: draft.requiredQty ?? null,
      plannedUnitPrice: draft.plannedUnitPrice ?? null,
      actualUnitPrice: draft.actualUnitPrice ?? null,
      supplierPreferred: draft.supplierPreferred ?? null,
      locationPreferredId: draft.locationPreferredId ?? null,
      notes: draft.notes ?? null,
      attachments: sortedAttachments,
      lockedFromEstimate: !!draft.lockedFromEstimate,
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
      if (mode === "immediate") {
        clearAutosaveTimer();
        persistDraftNowIfChanged(next);
      } else {
        scheduleDraftPersist(next);
      }
      return next;
    });
  }, [clearAutosaveTimer, persistDraftNowIfChanged, scheduleDraftPersist]);

  const closeDetail = useCallback(() => {
    clearAutosaveTimer();
    persistDraftNowIfChanged(draftRef.current);
    flushPendingRevokes();
    persistListState({ scrollY: window.scrollY });
    navigate(`/project/${pid}/procurement`);
  }, [
    clearAutosaveTimer,
    flushPendingRevokes,
    navigate,
    persistDraftNowIfChanged,
    persistListState,
    pid,
  ]);

  useEffect(() => {
    if (!detailItem) {
      initializedDetailIdRef.current = null;
      setRelinkLineId("");
      return;
    }
    if (initializedDetailIdRef.current === detailItem.id) return;

    initializedDetailIdRef.current = detailItem.id;
    setEditForm({ ...detailItem });
    draftRef.current = { ...detailItem };
    lastPersistedSignatureRef.current = computeDraftSignature(detailItem);
    setAttachmentUrl("");
    setRelinkLineId(detailItem.sourceEstimateV2LineId ?? "");
    clearAutosaveTimer();
  }, [detailItem, computeDraftSignature, clearAutosaveTimer]);

  useEffect(() => () => {
    clearAutosaveTimer();
    persistDraftNowIfChanged(draftRef.current);
    flushPendingRevokes();
  }, [clearAutosaveTimer, persistDraftNowIfChanged, flushPendingRevokes]);

  const openCreateOrder = (itemIds: string[]) => {
    if (itemIds.length === 0) return;
    setCreateOrderItemIds(itemIds);
    setCreateOrderOpen(true);
  };

  const toggleSelected = (itemId: string, checked: boolean) => {
    setSelectedRequestedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
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

    const nextAttachments: ProcurementAttachment[] = Array.from(files).map((file) => ({
      id: newAttachmentId("att-local"),
      url: URL.createObjectURL(file),
      type: file.type || "file",
      name: file.name,
      isLocal: true,
      createdAt: now,
    }));

    patchEditForm((prev) => ({
      ...prev,
      attachments: [...(prev.attachments ?? []), ...nextAttachments],
    }), "immediate");
  };

  const removeAttachment = (attachmentId: string) => {
    patchEditForm((prev) => {
      const current = prev.attachments ?? [];
      const target = current.find((attachment) => attachment.id === attachmentId);
      if (target?.isLocal && target.url.startsWith("blob:")) {
        pendingRevokesRef.current.add(target.url);
        revokeObjectUrlOnce(target.url);
      }

      return {
        ...prev,
        attachments: current.filter((attachment) => attachment.id !== attachmentId),
      };
    }, "immediate");
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

  const renderRequestedTableHeader = () => (
    <thead className="bg-muted/30 border-b border-border">
      <tr>
        <th className="w-10 text-left px-2 py-2 text-xs font-medium text-muted-foreground" />
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Name / Spec</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">When needed</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Amount</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Unit</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Planned</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Action</th>
      </tr>
    </thead>
  );

  const renderFactTableHeader = () => (
    <thead className="bg-muted/30 border-b border-border">
      <tr>
        <th className="w-10 text-left px-2 py-2 text-xs font-medium text-muted-foreground" />
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Type</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Name / Spec</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">When needed</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Delivery scheduled</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Amount</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Unit</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Price</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Planned</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Factual</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Status</th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-sp-2">
      <div className="glass-elevated rounded-card p-sp-2 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-h3 text-foreground">Procurement</h2>
          {activeTab === "requested" && selectedRequestedIds.size > 0 && (
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => openCreateOrder(Array.from(selectedRequestedIds))}
            >
              Create order ({selectedRequestedIds.size})
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, spec, supplier..."
              className="pl-8 h-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {TABS.map((tab) => {
              const stat = tab === "requested"
                ? chipTotals.requested
                : tab === "ordered"
                  ? chipTotals.ordered
                  : chipTotals.inStock;

              return (
                <button
                  type="button"
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    activeTab === tab
                      ? TAB_META[tab].className
                      : "border-border bg-background hover:bg-muted/30",
                  )}
                >
                  {TAB_META[tab].label}: {fmtCost(stat.total)} ({stat.count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Budget</label>
            <Input
              type="text"
              readOnly
              value={fmtCost(normalizedBudget)}
              className="h-9"
            />
          </div>
          <div className="rounded-lg border border-border p-3 md:col-span-2 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Economy</p>
              <p className={cn("text-sm font-medium", economy <= 0 ? "text-success" : "text-destructive")}> 
                {fmtCost(economy)}
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>Planned: {fmtCost(plannedFulfilledTotal)}</p>
              <p>Actual: {fmtCost(actualFulfilledTotal)}</p>
              <p>Budget: {fmtCost(normalizedBudget)}</p>
            </div>
          </div>
        </div>
      </div>

      {activeTab === "requested" && (
        <div className="glass rounded-card p-2 space-y-2">
          {requestedItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No requested items.</p>
          ) : (
            <>
              {Array.from(requestedStageMap.map.entries())
                .sort(([a], [b]) => {
                  const ai = stages.findIndex((stage) => stage.id === a);
                  const bi = stages.findIndex((stage) => stage.id === b);
                  return ai - bi;
                })
                .map(([stageId, stageItems]) => {
                  const collapsed = collapsedStages.has(stageId);
                  const stage = stages.find((entry) => entry.id === stageId);
                  const stageTotal = stageItems.reduce((sum, item) => sum + (item.plannedUnitPrice ?? 0) * (remainingByItemId.get(item.id) ?? 0), 0);

                  return (
                    <div key={stageId} className="rounded-lg border border-border overflow-hidden">
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                        onClick={() => toggleStage(stageId)}
                      >
                        {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-sm font-semibold text-foreground">{stage?.title ?? "Unknown stage"}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{stageItems.length} · {fmtCost(stageTotal)}</span>
                      </button>

                      {!collapsed && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            {renderRequestedTableHeader()}
                            <tbody>
                              {stageItems.map((item) => {
                                const remaining = remainingByItemId.get(item.id) ?? 0;
                                const selected = selectedRequestedIds.has(item.id);

                                return (
                                  <tr key={item.id} className="border-b border-border/70 last:border-0 hover:bg-muted/20">
                                    <td className="px-2 py-2">
                                      <Checkbox
                                        checked={selected}
                                        onCheckedChange={(checked) => toggleSelected(item.id, !!checked)}
                                        disabled={!canEdit}
                                      />
                                    </td>
                                    <td className="px-2 py-2 min-w-[220px]">
                                      <button type="button" onClick={() => openDetail(item)} className="text-left hover:underline">
                                        <div className="flex min-w-0 items-center gap-2">
                                          <ResourceTypeBadge type={item.type} className="shrink-0 border-transparent" />
                                          <p className="font-medium text-foreground truncate">{item.name}</p>
                                        </div>
                                        {item.orphaned && (
                                          <span className="inline-flex rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] text-destructive">
                                            Orphaned
                                          </span>
                                        )}
                                        {item.spec && <p className="text-xs text-muted-foreground truncate">{item.spec}</p>}
                                      </button>
                                    </td>
                                    <td className={cn("px-2 py-2 text-xs", isOverdue(item.requiredByDate) && "text-destructive")}>
                                      {formatDate(item.requiredByDate)}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums text-foreground">{remaining}</td>
                                    <td className="px-2 py-2 text-foreground">{item.unit}</td>
                                    <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtCost(item.plannedUnitPrice ?? 0)}</td>
                                    <td className="px-2 py-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        className="h-7"
                                        onClick={() => openCreateOrder([item.id])}
                                        disabled={!canEdit}
                                      >
                                        Order
                                      </Button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}

              {requestedStageMap.unstaged.length > 0 && (
                <div className="rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                    onClick={() => toggleStage("__unstaged__")}
                  >
                    {collapsedStages.has("__unstaged__") ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-semibold text-foreground">Unstaged</span>
                    <span className="ml-auto text-xs text-muted-foreground">{requestedStageMap.unstaged.length}</span>
                  </button>

                  {!collapsedStages.has("__unstaged__") && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        {renderRequestedTableHeader()}
                        <tbody>
                          {requestedStageMap.unstaged.map((item) => {
                            const remaining = remainingByItemId.get(item.id) ?? 0;
                            const selected = selectedRequestedIds.has(item.id);

                            return (
                              <tr key={item.id} className="border-b border-border/70 last:border-0 hover:bg-muted/20">
                                <td className="px-2 py-2">
                                  <Checkbox
                                    checked={selected}
                                    onCheckedChange={(checked) => toggleSelected(item.id, !!checked)}
                                    disabled={!canEdit}
                                  />
                                </td>
                                <td className="px-2 py-2 min-w-[220px]">
                                  <button type="button" onClick={() => openDetail(item)} className="text-left hover:underline">
                                    <div className="flex min-w-0 items-center gap-2">
                                      <ResourceTypeBadge type={item.type} className="shrink-0 border-transparent" />
                                      <p className="font-medium text-foreground truncate">{item.name}</p>
                                    </div>
                                    {item.orphaned && (
                                      <span className="inline-flex rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] text-destructive">
                                        Orphaned
                                      </span>
                                    )}
                                    {item.spec && <p className="text-xs text-muted-foreground truncate">{item.spec}</p>}
                                  </button>
                                </td>
                                <td className={cn("px-2 py-2 text-xs", isOverdue(item.requiredByDate) && "text-destructive")}>{formatDate(item.requiredByDate)}</td>
                                <td className="px-2 py-2 text-right tabular-nums text-foreground">{remaining}</td>
                                <td className="px-2 py-2 text-foreground">{item.unit}</td>
                                <td className="px-2 py-2 text-right tabular-nums text-foreground">{fmtCost(item.plannedUnitPrice ?? 0)}</td>
                                <td className="px-2 py-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7"
                                    onClick={() => openCreateOrder([item.id])}
                                    disabled={!canEdit}
                                  >
                                    Order
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "ordered" && (
        <div className="glass rounded-card p-2 space-y-2">
          {placedSupplierOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No placed supplier orders.</p>
          ) : (
            placedSupplierOrders.map((order) => {
              const collapsed = collapsedOrderIds.has(order.id);
              const total = order.lines.reduce((sum, line) => {
                const item = items.find((entry) => entry.id === line.procurementItemId);
                const unitPrice = line.actualUnitPrice ?? line.plannedUnitPrice ?? item?.actualUnitPrice ?? item?.plannedUnitPrice ?? 0;
                const openQty = Math.max(line.qty - line.receivedQty, 0);
                return sum + unitPrice * openQty;
              }, 0);

              return (
                <div key={order.id} className="rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                    onClick={() => toggleOrder(order.id)}
                  >
                    {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-semibold text-foreground truncate">{order.supplierName || "Supplier order"}</span>
                    <span className="text-xs text-muted-foreground">{order.lines.length} lines</span>
                    <span className="ml-auto text-xs text-muted-foreground">{fmtCost(total)}</span>
                  </button>

                  {!collapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        {renderFactTableHeader()}
                        <tbody>
                          {order.lines.map((line) => {
                            const item = items.find((entry) => entry.id === line.procurementItemId);
                            if (!item) return null;
                            const openQty = Math.max(line.qty - line.receivedQty, 0);
                            const unitPrice = line.actualUnitPrice ?? line.plannedUnitPrice ?? item.actualUnitPrice ?? item.plannedUnitPrice ?? 0;
                            const plannedPrice = line.plannedUnitPrice ?? item.plannedUnitPrice ?? 0;

                            return (
                              <tr key={line.id} className="border-b border-border/70 last:border-0 hover:bg-muted/20">
                                <td className="px-2 py-2" />
                                <td className="px-2 py-2">
                                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground capitalize">{item.type}</span>
                                </td>
                                <td className="px-2 py-2 min-w-[220px]">
                                  <button type="button" className="text-left hover:underline" onClick={() => openDetail(item)}>
                                    <p className="font-medium text-foreground truncate">{item.name}</p>
                                    {item.orphaned && (
                                      <span className="inline-flex rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] text-destructive">
                                        Orphaned
                                      </span>
                                    )}
                                    {item.spec && <p className="text-xs text-muted-foreground truncate">{item.spec}</p>}
                                  </button>
                                </td>
                                <td className={cn("px-2 py-2 text-xs", isOverdue(item.requiredByDate) && "text-destructive")}>
                                  {formatDate(item.requiredByDate)}
                                </td>
                                <td className="px-2 py-2">
                                  <button type="button" className="text-xs text-accent hover:underline" onClick={() => openOrderDetail(order.id)}>
                                    {formatDate(order.deliveryDeadline)}
                                  </button>
                                </td>
                                <td className="px-2 py-2 text-right">{openQty}</td>
                                <td className="px-2 py-2">{line.unit}</td>
                                <td className="px-2 py-2 text-right">{fmtCost(unitPrice)}</td>
                                <td className="px-2 py-2 text-right">{fmtCost(plannedPrice)}</td>
                                <td className="px-2 py-2 text-right">{fmtCost(unitPrice * openQty)}</td>
                                <td className="px-2 py-2">
                                  <div className="flex flex-col items-start gap-1">
                                    <button type="button" className="text-xs text-accent hover:underline" onClick={() => openOrderDetail(order.id)}>
                                      Ordered
                                    </button>
                                    {item.orphaned && (
                                      <button type="button" className="text-xs text-accent hover:underline" onClick={() => openDetail(item)}>
                                        Relink
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === "in_stock" && (
        <div className="glass rounded-card p-2 space-y-2">
          {inStockGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No inventory placements yet.</p>
          ) : (
            inStockGroups.map((group) => {
              const collapsed = collapsedLocationIds.has(group.locationId);

              return (
                <div key={group.locationId} className="rounded-lg border border-border overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
                    onClick={() => toggleLocation(group.locationId)}
                  >
                    {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    <span className="text-sm font-semibold text-foreground">{group.locationName}</span>
                    {group.locationAddress && <span className="text-xs text-muted-foreground truncate">{group.locationAddress}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{fmtCost(group.totalValue)}</span>
                  </button>

                  {!collapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        {renderFactTableHeader()}
                        <tbody>
                          {group.items.map((entry) => {
                            const item = items.find((candidate) => candidate.id === entry.procurementItemId);
                            if (!item) return null;
                            const relatedOrder = entry.orderIds
                              .map((id) => orders.find((order) => order.id === id))
                              .filter((value): value is OrderWithLines => !!value)
                              .filter((order) => !!order.deliveryDeadline)
                              .sort((a, b) => new Date(a.deliveryDeadline ?? "").getTime() - new Date(b.deliveryDeadline ?? "").getTime())[0] ?? null;
                            const qtyPrice = rowQtyPrice(item, entry.qty);

                            return (
                              <tr key={`${group.locationId}-${entry.procurementItemId}`} className="border-b border-border/70 last:border-0 hover:bg-muted/20">
                                <td className="px-2 py-2" />
                                <td className="px-2 py-2">
                                  <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground capitalize">{item.type}</span>
                                </td>
                                <td className="px-2 py-2 min-w-[220px]">
                                  <button type="button" className="text-left hover:underline" onClick={() => openDetail(item)}>
                                    <p className="font-medium text-foreground truncate">{item.name}</p>
                                    {item.orphaned && (
                                      <span className="inline-flex rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] text-destructive">
                                        Orphaned
                                      </span>
                                    )}
                                    {item.spec && <p className="text-xs text-muted-foreground truncate">{item.spec}</p>}
                                  </button>
                                </td>
                                <td className={cn("px-2 py-2 text-xs", isOverdue(item.requiredByDate) && "text-destructive")}>{formatDate(item.requiredByDate)}</td>
                                <td className="px-2 py-2">
                                  {relatedOrder ? (
                                    <button type="button" className="text-xs text-accent hover:underline" onClick={() => openOrderDetail(relatedOrder.id)}>
                                      {formatDate(relatedOrder.deliveryDeadline)}
                                    </button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-right">{entry.qty}</td>
                                <td className="px-2 py-2">{item.unit}</td>
                                <td className="px-2 py-2 text-right">{fmtCost(qtyPrice.actual)}</td>
                                <td className="px-2 py-2 text-right">{fmtCost(qtyPrice.planned)}</td>
                                <td className="px-2 py-2 text-right">{fmtCost(qtyPrice.factual)}</td>
                                <td className="px-2 py-2">
                                  <div className="flex flex-col items-start gap-1">
                                    <button type="button" className="text-xs text-accent hover:underline" onClick={() => openDetail(item)}>
                                      In stock
                                    </button>
                                    {item.orphaned && (
                                      <button type="button" className="text-xs text-accent hover:underline" onClick={() => openDetail(item)}>
                                        Relink
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <OrderModal
        open={createOrderOpen}
        onOpenChange={setCreateOrderOpen}
        projectId={pid}
        initialItemIds={createOrderItemIds}
      />

      <OrderDetailModal
        open={!!orderId}
        onOpenChange={(nextOpen) => !nextOpen && closeOrderDetail()}
        projectId={pid}
        orderId={orderId ?? ""}
        onOpenRequest={(requestId) => {
          navigate(`/project/${pid}/procurement/${requestId}`);
        }}
      />

      <Dialog open={!!itemId && !orderId} onOpenChange={(nextOpen) => !nextOpen && closeDetail()}>
        <DialogContent className="h-[95vh] w-[100vw] max-w-none rounded-none p-0 gap-0 overflow-hidden sm:h-auto sm:w-[75vw] sm:max-w-6xl sm:max-h-[90vh] sm:rounded-xl">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12 sm:px-6 sm:py-4">
            <DialogTitle>Procurement request</DialogTitle>
          </DialogHeader>

          {!detailItem ? (
            <div className="p-4">
              <p className="text-sm text-muted-foreground">Item not found.</p>
            </div>
          ) : (
            <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <div className="mx-auto w-full max-w-4xl space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {detailItem.lockedFromEstimate && (
                    <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      Locked from estimate
                    </span>
                  )}
                  {detailItem.orphaned && (
                    <span className="inline-flex rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] text-destructive">
                      Orphaned
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Type</label>
                    <div className="mt-1">
                      <ItemTypePicker
                        value={(editForm.type ?? "material") as ProcurementItemType}
                        disabled={!canEdit}
                        onChange={(nextType) => patchEditForm((prev) => ({ ...prev, type: nextType }), "immediate")}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">When needed</label>
                    <div className="mt-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            disabled={!canEdit || !!detailItem.lockedFromEstimate}
                            className={cn("h-9 w-full justify-start text-left", isOverdue(editForm.requiredByDate) && "text-destructive")}
                          >
                            <CalendarIcon className="h-4 w-4 mr-2" />
                            {formatDate(editForm.requiredByDate)}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={editForm.requiredByDate ? new Date(editForm.requiredByDate) : undefined}
                            onSelect={(nextDate) => patchEditForm((prev) => ({ ...prev, requiredByDate: nextDate ? nextDate.toISOString() : null }), "immediate")}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      {detailItem.lockedFromEstimate && (
                        <p className="mt-1 text-[11px] text-muted-foreground">Synced from linked work start date</p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Name</label>
                  <Input
                    value={editForm.name ?? ""}
                    onChange={(event) => patchEditForm((prev) => ({ ...prev, name: event.target.value }))}
                    onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                    className="h-9"
                    disabled={!canEdit}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Specification</label>
                  <Input
                    value={editForm.spec ?? ""}
                    onChange={(event) => patchEditForm((prev) => ({ ...prev, spec: event.target.value || null }))}
                    onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                    className="h-9"
                    disabled={!canEdit}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Estimate line link</label>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Select value={relinkLineId || undefined} onValueChange={setRelinkLineId}>
                      <SelectTrigger className="h-9 w-[320px]">
                        <SelectValue placeholder="Select estimate line" />
                      </SelectTrigger>
                      <SelectContent>
                        {procurementEstimateLines.map((line) => (
                          <SelectItem key={line.id} value={line.id}>
                            {line.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9"
                      disabled={!canEdit || !relinkLineId}
                      onClick={() => {
                        if (!relinkLineId) return;
                        const ok = relinkProcurementItemToEstimateV2Line(
                          pid,
                          detailItem.id,
                          relinkLineId,
                          estimateState,
                        );
                        if (!ok) {
                          toast({ title: "Unable to relink", variant: "destructive" });
                          return;
                        }
                        patchEditForm((prev) => ({
                          ...prev,
                          sourceEstimateV2LineId: relinkLineId,
                          orphaned: false,
                          orphanedAt: null,
                          orphanedReason: null,
                          lockedFromEstimate: true,
                        }), "immediate");
                        toast({ title: "Item relinked" });
                      }}
                    >
                      Relink
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Requested amount</label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.requiredQty ?? 0}
                      onChange={(event) => {
                        const requiredQty = Math.max(0, Number(event.target.value));
                        patchEditForm((prev) => ({ ...prev, requiredQty }));
                      }}
                      onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                      className="h-9"
                      disabled={!canEdit || !!detailItem.lockedFromEstimate}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Unit</label>
                    <p className="mt-1 h-9 flex items-center text-sm text-foreground">{editForm.unit ?? "—"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Planned unit price</label>
                    <p className="mt-1 h-9 flex items-center justify-end tabular-nums text-sm text-foreground">
                      {fmtCost(editForm.plannedUnitPrice ?? 0)}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Actual unit price</label>
                    <Input
                      type="number"
                      min="0"
                      value={editForm.actualUnitPrice ?? ""}
                      onChange={(event) => {
                        const actualUnitPrice = event.target.value ? Number(event.target.value) : null;
                        patchEditForm((prev) => ({ ...prev, actualUnitPrice }));
                      }}
                      onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                      className="h-9"
                      placeholder="RUB"
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Supplier preferred</label>
                  <Input
                    value={editForm.supplierPreferred ?? ""}
                    onChange={(event) => patchEditForm((prev) => ({ ...prev, supplierPreferred: event.target.value || null }))}
                    onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                    className="h-9"
                    disabled={!canEdit}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <Textarea
                    value={editForm.notes ?? ""}
                    onChange={(event) => patchEditForm((prev) => ({ ...prev, notes: event.target.value || null }))}
                    onBlur={() => persistDraftNowIfChanged(draftRef.current)}
                    rows={2}
                    className="text-sm"
                    disabled={!canEdit}
                  />
                </div>

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground">Attachments</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      value={attachmentUrl}
                      onChange={(event) => setAttachmentUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        addUrlAttachment();
                      }}
                      placeholder="Paste a link to receipt/invoice (PDF, Drive, etc.)"
                      className="h-9 sm:flex-1"
                      disabled={!canEdit}
                    />
                    <Input
                      ref={filePickerRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        addLocalAttachments(event.target.files);
                        event.currentTarget.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full sm:w-auto"
                      onClick={() => filePickerRef.current?.click()}
                      disabled={!canEdit}
                    >
                      Add file
                    </Button>
                  </div>

                  {(editForm.attachments ?? []).length > 0 ? (
                    <div className="space-y-2">
                      {(editForm.attachments ?? []).map((attachment) => (
                        <div key={attachment.id} className="rounded-md bg-muted/40 p-2 text-xs">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-foreground">{attachmentDisplayName(attachment)}</p>
                              {attachment.isLocal && (
                                <span className="inline-flex mt-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                  Local
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <a href={attachment.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                                Open
                              </a>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => removeAttachment(attachment.id)}
                                disabled={!canEdit}
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

                <div className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">Fulfillment</p>
                    <Button type="button" size="sm" onClick={() => openCreateOrder([detailItem.id])} disabled={!canEdit}>
                      Create order
                    </Button>
                  </div>
                  {(relatedOrdersByItemId.get(detailItem.id) ?? []).length > 0 ? (
                    <div className="space-y-2">
                      {(relatedOrdersByItemId.get(detailItem.id) ?? []).map((order) => {
                        const line = order.lines.find((entry) => entry.procurementItemId === detailItem.id);
                        if (!line) return null;
                        const qtyInfo = order.kind === "supplier"
                          ? `${line.receivedQty}/${line.qty} ${line.unit}`
                          : `${line.qty} ${line.unit}`;
                        return (
                          <button
                            type="button"
                            key={`${order.id}-${line.id}`}
                            onClick={() => openOrderDetail(order.id)}
                            className="w-full rounded-md border border-border p-2 text-left hover:bg-muted/40 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">
                                  {order.kind === "supplier" ? (order.supplierName || "Supplier order") : "Stock allocation"}
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {order.kind === "supplier"
                                    ? `To: ${locations.find((location) => location.id === order.deliverToLocationId)?.name ?? "—"}`
                                    : `From: ${locations.find((location) => location.id === order.fromLocationId)?.name ?? "—"} · To: ${locations.find((location) => location.id === (order.toLocationId ?? order.deliverToLocationId))?.name ?? "—"}`}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <StatusBadge status={orderStatusLabel(order.status)} variant="procurement" className="text-[10px]" />
                                <p className="text-[11px] text-muted-foreground mt-1">{qtyInfo}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No related orders yet.</p>
                  )}
                </div>

                {detailItem.linkedTaskIds.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Linked tasks</label>
                    <div className="space-y-1">
                      {detailItem.linkedTaskIds.map((taskId) => {
                        const task = getTask(taskId);
                        return (
                          <button
                            key={taskId}
                            type="button"
                            onClick={() => {
                              persistListState({ scrollY: window.scrollY });
                              navigate(`/project/${pid}/tasks`, { state: { openTaskId: taskId } });
                            }}
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

          <DialogFooter className="border-t border-border px-4 py-3 sm:px-6">
            <Button type="button" variant="outline" onClick={closeDetail}>Close</Button>
            {detailItem && canEdit && (
              <Button
                type="button"
                onClick={() => {
                  clearAutosaveTimer();
                  persistDraftNowIfChanged(draftRef.current);
                  toast({ title: "Saved" });
                }}
              >
                Save
              </Button>
            )}
            {detailItem && canEdit && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  archiveProcurementItem(detailItem.id);
                  toast({ title: "Item archived" });
                  closeDetail();
                }}
              >
                Archive
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
