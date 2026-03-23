import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { trackEvent } from "@/lib/analytics";
import {
  AlertTriangle,
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  Search,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Calendar } from "@/components/ui/calendar";
import { EmptyState } from "@/components/EmptyState";
import { ProjectWorkflowEmptyState } from "@/components/ProjectWorkflowEmptyState";
import { StatusBadge } from "@/components/StatusBadge";
import { useProject, useProcurementV2 } from "@/hooks/use-mock-data";
import { useOrders } from "@/hooks/use-order-data";
import { useInventoryStock, useLocations } from "@/hooks/use-inventory-data";
import { usePermission } from "@/lib/permissions";
import {
  archiveProcurementItem,
  updateProcurementItem,
} from "@/data/procurement-store";
import { getOrdersSource } from "@/data/orders-source";
import { consumeStockFromInventory, updateOrder } from "@/data/order-store";
import { addEvent, addTask, getCurrentUser, getTask, getUserById } from "@/data/store";
import {
  collectItemLocationEventHistory,
  computeProcurementHeaderKpis,
  computeLastReceivedAt,
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
import { LocationPicker } from "@/components/procurement/LocationPicker";
import { ResourceTypeBadge } from "@/components/estimate-v2/ResourceTypeBadge";
import { useEstimateV2Project } from "@/hooks/use-estimate-v2-data";
import { inventoryQueryKeys } from "@/hooks/use-inventory-data";
import { orderQueryKeys } from "@/hooks/use-order-data";
import { procurementQueryKeys } from "@/hooks/use-procurement-source";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { computeProjectTotals } from "@/lib/estimate-v2/pricing";
import type {
  Event,
  OrderWithLines,
  ProcurementAttachment,
  ProcurementItemV2,
  ProcurementItemType,
  Task,
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

type OrderedReceivableTarget = {
  selectionKey: string;
  orderId: string;
  lineId: string;
  procurementItemId: string;
  itemType: ProcurementItemType;
  itemName: string;
  itemSpec: string | null;
  orderedQty: number;
  alreadyReceivedQty: number;
  remainingQty: number;
  unit: string;
  unitPrice: number;
  locationId: string | null;
};

type InStockTableRow = {
  key: string;
  procurementItemId: string;
  item: ProcurementItemV2;
  locationId: string;
  locationName: string;
  qty: number;
  orderIds: string[];
  lastReceivedAt: string | null;
};

export default function ProjectProcurement() {
  const { id: projectId, itemId, orderId } = useParams<{ id: string; itemId?: string; orderId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const pid = projectId!;
  const workspaceMode = useWorkspaceMode();
  const supabaseMode = workspaceMode.kind === "supabase" ? workspaceMode : null;
  const isSupabaseMode = workspaceMode.kind === "supabase";

  const savedListState = useMemo(() => readListState(pid), [pid]);

  const baseItems = useProcurementV2(pid);
  const orders = useOrders(pid);
  const locations = useLocations(pid);
  const stockRows = useInventoryStock(pid);
  const { project, members, stages } = useProject(pid);
  const estimateState = useEstimateV2Project(pid);
  const perm = usePermission(pid);
  const canEdit = perm.can("procurement.edit");
  const canUseFromStock = canEdit && !isSupabaseMode;

  const items = useMemo(() => {
    const workById = new Map(estimateState.works.map((work) => [work.id, work]));
    const lineById = new Map(estimateState.lines.map((line) => [line.id, line]));
    const nowIso = new Date().toISOString();

    const stageStartByStageId = new Map<string, string>();
    estimateState.works.forEach((work) => {
      if (!work.plannedStart) return;
      if (!work.stageId) return;

      const ts = new Date(work.plannedStart).getTime();
      if (!Number.isFinite(ts)) return;

      const existing = stageStartByStageId.get(work.stageId);
      if (!existing) {
        stageStartByStageId.set(work.stageId, work.plannedStart);
        return;
      }

      const existingTs = new Date(existing).getTime();
      if (Number.isFinite(existingTs) && ts < existingTs) {
        stageStartByStageId.set(work.stageId, work.plannedStart);
      }
    });

    const fallbackStageId = estimateState.stages[0]?.id ?? null;
    const derivedItems = baseItems.map((item) => {
      const lineId = item.sourceEstimateV2LineId ?? null;
      if (!lineId) return item;
      const line = lineById.get(lineId);
      if (!line) return item;

      const work = workById.get(line.workId) ?? null;
      const resolvedStageId = line.stageId || work?.stageId || fallbackStageId;
      if (!resolvedStageId) return item;

      const requiredByDate = work?.plannedStart ?? stageStartByStageId.get(resolvedStageId) ?? null;
      const derivedType: ProcurementItemType = line.type === "tool" ? "tool" : "material";
      const requiredQty = Math.max(0, line.qtyMilli / 1_000);
      const plannedUnitPrice = Math.max(0, line.costUnitCents / 100);

      return {
        ...item,
        stageId: resolvedStageId,
        type: derivedType,
        name: line.title,
        requiredByDate,
        requiredQty,
        plannedUnitPrice,
      };
    });

    const linkedLineIds = new Set(
      derivedItems
        .map((item) => item.sourceEstimateV2LineId ?? null)
        .filter((lineId): lineId is string => !!lineId),
    );

    const missingDerivedItems = estimateState.lines
      .filter((line) => (line.type === "material" || line.type === "tool"))
      .filter((line) => !linkedLineIds.has(line.id))
      .map((line) => {
        const work = workById.get(line.workId) ?? null;
        const resolvedStageId = line.stageId || work?.stageId || fallbackStageId;
        const requiredByDate = work?.plannedStart ?? (resolvedStageId ? stageStartByStageId.get(resolvedStageId) ?? null : null);
        const derivedType: ProcurementItemType = line.type === "tool" ? "tool" : "material";
        const requiredQty = Math.max(0, line.qtyMilli / 1_000);
        const plannedUnitPrice = Math.max(0, line.costUnitCents / 100);

        return {
          id: `estimate-line-${line.id}`,
          projectId: line.projectId,
          stageId: resolvedStageId ?? null,
          categoryId: null,
          type: derivedType,
          name: line.title,
          spec: null,
          unit: line.unit,
          requiredByDate,
          requiredQty,
          orderedQty: 0,
          receivedQty: 0,
          plannedUnitPrice,
          actualUnitPrice: null,
          supplier: null,
          supplierPreferred: null,
          locationPreferredId: null,
          lockedFromEstimate: true,
          sourceEstimateItemId: null,
          sourceEstimateV2LineId: line.id,
          orphaned: false,
          orphanedAt: null,
          orphanedReason: null,
          linkUrl: null,
          notes: null,
          attachments: [],
          createdFrom: "estimate",
          linkedTaskIds: [],
          archived: false,
          createdAt: nowIso,
          updatedAt: nowIso,
        } satisfies ProcurementItemV2;
      });

    return [...derivedItems, ...missingDerivedItems];
  }, [baseItems, estimateState.lines, estimateState.works, estimateState.stages]);

  const [search, setSearch] = useState(savedListState?.search ?? "");
  const [activeTab, setActiveTab] = useState<ProcurementTab>(savedListState?.activeTab ?? "requested");
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set(savedListState?.collapsedStageIds ?? []));
  const [collapsedOrderIds, setCollapsedOrderIds] = useState<Set<string>>(new Set());
  const [selectedRequestedIds, setSelectedRequestedIds] = useState<Set<string>>(new Set());
  const [selectedOrderedLineKeys, setSelectedOrderedLineKeys] = useState<Set<string>>(new Set());
  const [selectedInStockRowKeys, setSelectedInStockRowKeys] = useState<Set<string>>(new Set());
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveModalTargets, setReceiveModalTargets] = useState<OrderedReceivableTarget[]>([]);
  const [receiveModalQtyByKey, setReceiveModalQtyByKey] = useState<Record<string, number>>({});
  const [receiveModalLocationByKey, setReceiveModalLocationByKey] = useState<Record<string, string>>({});
  const [receiveItemsConfirmInFlight, setReceiveItemsConfirmInFlight] = useState(false);
  const receiveItemsConfirmInFlightRef = useRef(false);
  const [useFromStockOpen, setUseFromStockOpen] = useState(false);
  const [useFromStockTargets, setUseFromStockTargets] = useState<InStockTableRow[]>([]);
  const [useFromStockQtyByKey, setUseFromStockQtyByKey] = useState<Record<string, string>>({});
  const [useFromStockParticipantId, setUseFromStockParticipantId] = useState("none");
  const [useFromStockManualName, setUseFromStockManualName] = useState("");
  const [useFromStockNote, setUseFromStockNote] = useState("");
  const [inStockDetailTarget, setInStockDetailTarget] = useState<InStockTableRow | null>(null);
  const [inStockDetailOpen, setInStockDetailOpen] = useState(false);

  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [createOrderItemIds, setCreateOrderItemIds] = useState<string[]>([]);

  const detailItem = itemId ? (items.find((item) => item.id === itemId) ?? null) : null;
  const [editForm, setEditForm] = useState<Partial<ProcurementItemV2>>({});
  const [attachmentUrl, setAttachmentUrl] = useState("");

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
      map.set(item.id, computeRemainingRequestedQty(item, orders));
    });
    return map;
  }, [items, orders]);

  const headerKpis = useMemo(
    () => computeProcurementHeaderKpis(pid, items, orders),
    [pid, items, orders],
  );

  const usedBudgetMetric = headerKpis.used;
  const budgetProgressPct = useMemo(() => {
    if (usedBudgetMetric === null || normalizedBudget <= 0) return 0;
    return Math.min((usedBudgetMetric / normalizedBudget) * 100, 100);
  }, [usedBudgetMetric, normalizedBudget]);

  const remainingBudgetMetric = useMemo(() => {
    if (usedBudgetMetric === null) return null;
    return normalizedBudget - usedBudgetMetric;
  }, [normalizedBudget, usedBudgetMetric]);

  const chipTotals = useMemo(
    () => computeTabChipTotals(pid, items, orders, stockRows),
    [pid, items, orders, stockRows],
  );

  const headerDataStateHint = useMemo(() => {
    if (!headerKpis.hasLinkedItems) return "No estimate-linked items.";
    if (headerKpis.missingPlannedPriceCount > 0) {
      const suffix = headerKpis.missingPlannedPriceCount === 1 ? "item" : "items";
      return `Missing planned price for ${headerKpis.missingPlannedPriceCount} ${suffix}.`;
    }
    if (headerKpis.missingOrderPriceCount > 0) {
      const suffix = headerKpis.missingOrderPriceCount === 1 ? "line" : "lines";
      return `Missing ordered price for ${headerKpis.missingOrderPriceCount} ${suffix}.`;
    }
    return null;
  }, [headerKpis]);

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );

  const defaultLocationId = useMemo(
    () => locations.find((location) => location.isDefault)?.id ?? locations[0]?.id ?? null,
    [locations],
  );

  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  );

  const participantNameById = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((member) => {
      const user = getUserById(member.user_id);
      if (!user) return;
      map.set(user.id, user.name);
    });
    return map;
  }, [members]);

  const participantOptions = useMemo(() => (
    members
      .map((member) => {
        const user = getUserById(member.user_id);
        if (!user) return null;
        return { id: user.id, name: user.name };
      })
      .filter((entry): entry is { id: string; name: string } => !!entry)
  ), [members]);

  const ownerAssigneeId = useMemo(
    () => project?.owner_id ?? members.find((member) => member.role === "owner")?.user_id ?? getCurrentUser().id,
    [project?.owner_id, members],
  );

  const isItemSearchMatch = useCallback((item: ProcurementItemV2) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return item.name.toLowerCase().includes(q) || (item.spec?.toLowerCase().includes(q) ?? false);
  }, [search]);

  const requestedItems = useMemo(() => {
    const estimateLinkedItems = items.filter(isEstimateLinkedProcurementItem);
    const remainingPositiveItems = estimateLinkedItems.filter((item) => (remainingByItemId.get(item.id) ?? 0) > 0);
    return remainingPositiveItems.filter(isItemSearchMatch);
  }, [items, remainingByItemId, isItemSearchMatch]);

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
    if (activeTab !== "ordered" && selectedOrderedLineKeys.size > 0) {
      setSelectedOrderedLineKeys(new Set());
    }
  }, [activeTab, selectedOrderedLineKeys.size]);

  useEffect(() => {
    if (activeTab !== "in_stock" && selectedInStockRowKeys.size > 0) {
      setSelectedInStockRowKeys(new Set());
    }
  }, [activeTab, selectedInStockRowKeys.size]);

  useEffect(() => {
    setSelectedRequestedIds((prev) => {
      if (prev.size === 0) return prev;
      const visibleIds = new Set(requestedItems.map((item) => item.id));
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [requestedItems]);

  const placedSupplierOrders = useMemo(() => (
    orders
      .filter((order) => order.kind === "supplier" && order.status === "placed")
      .filter((order) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        const supplierMatch = (order.supplierName ?? "").toLowerCase().includes(q);
        const lineMatch = order.lines.some((line) => {
          const item = itemById.get(line.procurementItemId);
          return (
            item?.name.toLowerCase().includes(q)
            || (item?.spec?.toLowerCase().includes(q) ?? false)
          );
        });
        return supplierMatch || lineMatch;
      })
  ), [orders, search, itemById]);

  const supplierOrderNumberById = useMemo(() => {
    const sortedSupplierOrders = orders
      .filter((order) => order.kind === "supplier")
      .slice()
      .sort((a, b) => {
        const dateDelta = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (dateDelta !== 0) return dateDelta;
        return a.id.localeCompare(b.id);
      });
    const map = new Map<string, number>();
    sortedSupplierOrders.forEach((order, index) => {
      map.set(order.id, index + 1);
    });
    return map;
  }, [orders]);

  const orderedReceivableTargets = useMemo(() => {
    const targets: OrderedReceivableTarget[] = [];

    placedSupplierOrders.forEach((order) => {
      const orderLocationId = order.deliverToLocationId ?? defaultLocationId;

      order.lines.forEach((line) => {
        const item = itemById.get(line.procurementItemId);
        if (!item) return;
        const remainingQty = Math.max(0, line.qty - line.receivedQty);
        if (remainingQty <= 0) return;

        const unitPrice = line.actualUnitPrice
          ?? item.actualUnitPrice
          ?? line.plannedUnitPrice
          ?? item.plannedUnitPrice
          ?? 0;

        targets.push({
          selectionKey: `${order.id}:${line.id}`,
          orderId: order.id,
          lineId: line.id,
          procurementItemId: item.id,
          itemType: item.type,
          itemName: item.name,
          itemSpec: item.spec,
          orderedQty: line.qty,
          alreadyReceivedQty: line.receivedQty,
          remainingQty,
          unit: line.unit,
          unitPrice,
          locationId: orderLocationId,
        });
      });
    });

    return targets;
  }, [placedSupplierOrders, itemById, defaultLocationId]);

  const orderedReceivableTargetByKey = useMemo(() => (
    new Map(orderedReceivableTargets.map((target) => [target.selectionKey, target]))
  ), [orderedReceivableTargets]);

  useEffect(() => {
    setSelectedOrderedLineKeys((prev) => {
      if (prev.size === 0) return prev;
      const visibleKeys = new Set(orderedReceivableTargets.map((target) => target.selectionKey));
      const next = new Set(Array.from(prev).filter((selectionKey) => visibleKeys.has(selectionKey)));
      return next.size === prev.size ? prev : next;
    });
  }, [orderedReceivableTargets]);

  const inStockRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = computeInStockByLocation(pid, items, orders, locations)
      .flatMap((group) => (
        group.items.map((entry) => {
          const item = itemById.get(entry.procurementItemId);
          if (!item) return null;
          return {
            key: `${group.locationId}-${entry.procurementItemId}`,
            procurementItemId: entry.procurementItemId,
            item,
            locationId: group.locationId,
            locationName: group.locationName,
            qty: entry.qty,
            orderIds: entry.orderIds,
            lastReceivedAt: computeLastReceivedAt(entry.procurementItemId, group.locationId, orders),
          } satisfies InStockTableRow;
        }).filter((row): row is InStockTableRow => !!row)
      ))
      .sort((a, b) => {
        const nameDelta = a.item.name.localeCompare(b.item.name);
        if (nameDelta !== 0) return nameDelta;
        return a.locationName.localeCompare(b.locationName);
      });

    if (!q) return rows;
    return rows.filter((row) => (
      row.item.name.toLowerCase().includes(q)
      || (row.item.spec?.toLowerCase().includes(q) ?? false)
      || row.locationName.toLowerCase().includes(q)
    ));
  }, [pid, items, orders, locations, search, itemById]);

  const inStockRowByKey = useMemo(
    () => new Map(inStockRows.map((row) => [row.key, row])),
    [inStockRows],
  );

  useEffect(() => {
    setSelectedInStockRowKeys((prev) => {
      if (prev.size === 0) return prev;
      const visibleKeys = new Set(inStockRows.map((row) => row.key));
      const next = new Set(Array.from(prev).filter((key) => visibleKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [inStockRows]);

  const inStockDetailHistory = useMemo(() => {
    if (!inStockDetailTarget) {
      return { receiptEvents: [], usageEvents: [] };
    }
    return collectItemLocationEventHistory(
      inStockDetailTarget.procurementItemId,
      inStockDetailTarget.locationId,
      orders,
    );
  }, [inStockDetailTarget, orders]);

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

  const toggleSelectedOrderedLine = (selectionKey: string, checked: boolean) => {
    setSelectedOrderedLineKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(selectionKey);
      else next.delete(selectionKey);
      return next;
    });
  };

  const toggleSelectedInStockRow = (rowKey: string, checked: boolean) => {
    setSelectedInStockRowKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rowKey);
      else next.delete(rowKey);
      return next;
    });
  };

  const openReceiveItemsModal = useCallback((targets: OrderedReceivableTarget[]) => {
    if (targets.length === 0) return;
    const nextQtyByKey: Record<string, number> = {};
    const nextLocationByKey: Record<string, string> = {};
    targets.forEach((target) => {
      nextQtyByKey[target.selectionKey] = target.remainingQty;
      const locationId = target.locationId ?? defaultLocationId ?? "";
      nextLocationByKey[target.selectionKey] = locationId;
    });
    setReceiveModalTargets(targets);
    setReceiveModalQtyByKey(nextQtyByKey);
    setReceiveModalLocationByKey(nextLocationByKey);
    setReceiveModalOpen(true);
  }, [defaultLocationId]);

  const openReceiveModalForSelection = () => {
    const targets = Array.from(selectedOrderedLineKeys)
      .map((selectionKey) => orderedReceivableTargetByKey.get(selectionKey))
      .filter((target): target is OrderedReceivableTarget => !!target);
    openReceiveItemsModal(targets);
  };

  const submitReceiveItems = async () => {
    if (receiveItemsConfirmInFlightRef.current) return;
    receiveItemsConfirmInFlightRef.current = true;
    setReceiveItemsConfirmInFlight(true);
    try {
      const payloadByOrderAndLocation = new Map<string, { orderId: string; locationId: string; lines: Array<{ lineId: string; qty: number }> }>();
      let hasMissingLocation = false;

      receiveModalTargets.forEach((target) => {
        const rawQty = Number(receiveModalQtyByKey[target.selectionKey] ?? 0);
        const clampedQty = Math.min(target.remainingQty, Math.max(0, Number.isFinite(rawQty) ? rawQty : 0));
        if (clampedQty <= 0) return;
        const locationId = receiveModalLocationByKey[target.selectionKey] ?? target.locationId ?? defaultLocationId ?? "";
        if (!locationId) {
          hasMissingLocation = true;
          return;
        }

        const payloadKey = `${target.orderId}:${locationId}`;
        const existing = payloadByOrderAndLocation.get(payloadKey);
        if (!existing) {
          payloadByOrderAndLocation.set(payloadKey, {
            orderId: target.orderId,
            locationId,
            lines: [{ lineId: target.lineId, qty: clampedQty }],
          });
          return;
        }

        existing.lines.push({ lineId: target.lineId, qty: clampedQty });
      });

      if (hasMissingLocation) {
        toast({ title: "Location is required", description: "Select receive location for each item", variant: "destructive" });
        return;
      }

      if (payloadByOrderAndLocation.size === 0) {
        toast({ title: "No quantities entered", description: "Set at least one quantity greater than zero", variant: "destructive" });
        return;
      }

      try {
        const source = await getOrdersSource(supabaseMode ?? undefined);
        let totalQty = 0;
        for (const payload of payloadByOrderAndLocation.values()) {
          await source.receiveSupplierOrder(payload.orderId, {
            locationId: payload.locationId,
            lines: payload.lines,
          });
          totalQty += payload.lines.reduce((sum, line) => sum + line.qty, 0);
        }

        trackEvent("procurement_item_updated", {
          project_id: pid,
          surface: "procurement",
          total_qty: totalQty,
        });

        if (supabaseMode) {
          const orderDetailInvalidations = Array.from(payloadByOrderAndLocation.values()).map((payload) => (
            queryClient.invalidateQueries({
              queryKey: orderQueryKeys.orderById(supabaseMode.profileId, payload.orderId),
            })
          ));
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: orderQueryKeys.projectOrders(supabaseMode.profileId, pid),
            }),
            queryClient.invalidateQueries({
              queryKey: orderQueryKeys.placedSupplierOrders(supabaseMode.profileId, pid),
            }),
            queryClient.invalidateQueries({
              queryKey: orderQueryKeys.placedSupplierOrdersAllProjects(supabaseMode.profileId),
            }),
            queryClient.invalidateQueries({
              queryKey: procurementQueryKeys.projectItems(supabaseMode.profileId, pid),
            }),
            queryClient.invalidateQueries({
              queryKey: inventoryQueryKeys.projectLocations(supabaseMode.profileId, pid),
            }),
            queryClient.invalidateQueries({
              queryKey: inventoryQueryKeys.projectStock(supabaseMode.profileId, pid),
            }),
            ...orderDetailInvalidations,
          ]);
        }

        toast({ title: payloadByOrderAndLocation.size > 1 ? "Items received" : "Item received" });
        setReceiveModalOpen(false);
        setReceiveModalTargets([]);
        setReceiveModalQtyByKey({});
        setReceiveModalLocationByKey({});
        setSelectedOrderedLineKeys(new Set());
      } catch (error) {
        toast({
          title: "Receive failed",
          description: error instanceof Error ? error.message : "Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      receiveItemsConfirmInFlightRef.current = false;
      setReceiveItemsConfirmInFlight(false);
    }
  };

  const openUseFromStockModal = (targets: InStockTableRow[]) => {
    if (isSupabaseMode) {
      toast({
        title: "Use from stock is disabled",
        description: "This launch slice does not persist stock usage in Supabase mode.",
        variant: "destructive",
      });
      return;
    }
    if (targets.length === 0) return;
    const qtyByKey = targets.reduce<Record<string, string>>((acc, target) => {
      acc[target.key] = "";
      return acc;
    }, {});
    setUseFromStockTargets(targets);
    setUseFromStockQtyByKey(qtyByKey);
    setUseFromStockParticipantId("none");
    setUseFromStockManualName("");
    setUseFromStockNote("");
    setUseFromStockOpen(true);
  };

  const openUseModalForSelection = () => {
    const targets = Array.from(selectedInStockRowKeys)
      .map((key) => inStockRowByKey.get(key))
      .filter((target): target is InStockTableRow => !!target);
    openUseFromStockModal(targets);
  };

  const submitUseFromStock = () => {
    if (isSupabaseMode) {
      toast({
        title: "Use from stock is disabled",
        description: "This launch slice does not persist stock usage in Supabase mode.",
        variant: "destructive",
      });
      return;
    }
    if (useFromStockTargets.length === 0) return;

    const manualName = useFromStockManualName.trim() || null;
    const participantId = manualName ? null : (useFromStockParticipantId === "none" ? null : useFromStockParticipantId);
    const note = useFromStockNote.trim() || null;
    const rowsToConsume: Array<{ target: InStockTableRow; qty: number }> = [];

    for (const target of useFromStockTargets) {
      const raw = (useFromStockQtyByKey[target.key] ?? "").trim();
      if (!raw) continue;
      const qty = Number(raw);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast({
          title: "Quantity is required",
          description: `Enter quantity greater than zero for ${target.item.name}`,
          variant: "destructive",
        });
        return;
      }
      if (qty > target.qty) {
        toast({
          title: "Insufficient stock",
          description: `Quantity exceeds available stock for ${target.item.name}`,
          variant: "destructive",
        });
        return;
      }
      rowsToConsume.push({ target, qty });
    }

    if (rowsToConsume.length === 0) {
      toast({ title: "No quantities entered", description: "Set at least one quantity greater than zero", variant: "destructive" });
      return;
    }

    const usedByLabel = manualName || (participantId ? participantNameById.get(participantId) : "") || "—";
    const currentUser = getCurrentUser();
    for (const entry of rowsToConsume) {
      const { target, qty } = entry;
      const result = consumeStockFromInventory({
        projectId: pid,
        procurementItemId: target.procurementItemId,
        locationId: target.locationId,
        qty,
        usedByParticipantId: participantId,
        usedByName: manualName,
        note,
      });
      if (!result.ok) {
        toast({ title: "Use failed", description: result.error, variant: "destructive" });
        return;
      }

      const summary = `Used ${qty} ${target.item.unit} of ${target.item.name} at ${target.locationName}`;
      addEvent({
        id: `evt-stock-used-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        project_id: pid,
        actor_id: currentUser.id,
        type: "procurement_updated",
        object_type: "procurement_item",
        object_id: target.procurementItemId,
        timestamp: new Date().toISOString(),
        payload: {
          source: "ai",
          sidebarKind: "stock_used",
          sidebarTier: 1,
          title: "Stock used",
          summary,
          details: {
            usedBy: usedByLabel,
            note,
            remainingQty: result.remainingQty,
          },
        },
      } satisfies Event);
    }

    trackEvent("procurement_item_used_from_stock", {
      project_id: pid,
      surface: "procurement",
      items_used: rowsToConsume.map(({ target, qty }) => ({
        procurement_item_id: target.procurementItemId,
        qty,
        location_id: target.locationId,
        participant_id: participantId,
      })),
    });

    toast({
      title: rowsToConsume.length > 1 ? "Stock updated" : "Stock item updated",
      description: rowsToConsume.length > 1
        ? `Used stock for ${rowsToConsume.length} items`
        : `Used ${rowsToConsume[0]?.qty ?? 0} ${rowsToConsume[0]?.target.item.unit ?? ""}`,
    });
    setUseFromStockOpen(false);
    setUseFromStockTargets([]);
    setUseFromStockQtyByKey({});
    setUseFromStockParticipantId("none");
    setUseFromStockManualName("");
    setUseFromStockNote("");
    setSelectedInStockRowKeys(new Set());
  };

  const handleRequestMore = (row: InStockTableRow) => {
    const now = new Date().toISOString();
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      project_id: pid,
      stage_id: project?.current_stage_id || stages[0]?.id || "",
      title: `Procure more: ${row.item.name}`,
      description: [
        `Item: ${row.item.name}`,
        `Spec: ${row.item.spec ?? "—"}`,
        `Type: ${row.item.type}`,
        `Location: ${row.locationName}`,
        `Qty available: ${row.qty} ${row.item.unit}`,
        "Suggested qty: 0",
        `Reference: /project/${pid}/procurement/${row.procurementItemId}`,
      ].join("\n"),
      status: "not_started",
      assignee_id: ownerAssigneeId,
      checklist: [],
      comments: [],
      attachments: [],
      photos: [],
      linked_estimate_item_ids: [],
      created_at: now,
    };
    addTask(task);
    toast({ title: "Task created", description: task.title });
  };

  const openInStockDetail = (row: InStockTableRow) => {
    setInStockDetailTarget(row);
    setInStockDetailOpen(true);
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

  const formatMetric = (value: number | null) => (value === null ? "—" : fmtCost(value));
  const selectionCount = activeTab === "requested"
    ? selectedRequestedIds.size
    : activeTab === "ordered"
      ? selectedOrderedLineKeys.size
      : selectedInStockRowKeys.size;
  const showStickySelectionBar = selectionCount > 0;

  const selectionPrimaryLabel = activeTab === "requested"
    ? `Create order (${selectionCount})`
    : activeTab === "ordered"
      ? `Items received (${selectionCount})`
      : `Use (${selectionCount})`;

  const runSelectionPrimaryAction = () => {
    if (activeTab === "requested") {
      openCreateOrder(Array.from(selectedRequestedIds));
      return;
    }
    if (activeTab === "ordered") {
      openReceiveModalForSelection();
      return;
    }
    if (isSupabaseMode) {
      toast({
        title: "Use from stock is disabled",
        description: "This launch slice only persists supplier order receive flows in Supabase mode.",
        variant: "destructive",
      });
      return;
    }
    openUseModalForSelection();
  };

  const clearSelectionForActiveTab = () => {
    if (activeTab === "requested") {
      setSelectedRequestedIds(new Set());
      return;
    }
    if (activeTab === "ordered") {
      setSelectedOrderedLineKeys(new Set());
      return;
    }
    setSelectedInStockRowKeys(new Set());
  };

  if (estimateState.project.estimateStatus === "planning") {
    return (
      <ProjectWorkflowEmptyState
        variant="procurement"
        title="Procurement will open very soon"
        description="Great progress so far. Procurement items will appear here once your Estimate is moved to In work."
        actionLabel="Open Estimate"
        onAction={() => navigate(`/project/${pid}/estimate`)}
      />
    );
  }

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
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Action</th>
      </tr>
    </thead>
  );

  const renderOrderedTableHeader = () => (
    <thead className="bg-muted/30 border-b border-border">
      <tr>
        <th className="w-10 text-left px-2 py-2 text-xs font-medium text-muted-foreground" />
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Name / Spec</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">When needed</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Delivery scheduled</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Amount</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Unit</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Unit price</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Total</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Action</th>
      </tr>
    </thead>
  );

  const renderInStockTableHeader = () => (
    <thead className="bg-muted/30 border-b border-border">
      <tr>
        <th className="w-10 text-left px-2 py-2 text-xs font-medium text-muted-foreground" />
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Name / Spec</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Location</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Qty available</th>
        <th className="text-left px-2 py-2 text-xs font-medium text-muted-foreground">Date last received</th>
        <th className="text-right px-2 py-2 text-xs font-medium text-muted-foreground">Actions</th>
      </tr>
    </thead>
  );

  return (
    <div className={cn("space-y-sp-2", showStickySelectionBar && "pb-24")}>
      <div className="glass-elevated rounded-card p-sp-3 space-y-sp-3">
        <h2 className="text-h3 text-foreground">Procurement</h2>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
          {[
            { key: "planned", label: "Planned", value: formatMetric(headerKpis.planned), hint: "Estimate-linked qty" },
            { key: "committed", label: "Committed", value: formatMetric(headerKpis.committed), hint: "Open ordered value" },
            { key: "received", label: "Received", value: formatMetric(headerKpis.received), hint: "Received value" },
            { key: "variance", label: "Variance", value: formatMetric(headerKpis.variance), hint: "Planned - used" },
          ].map((kpi) => (
            <div key={kpi.key} className="rounded-lg border border-border bg-background/60 p-3 min-h-[96px] flex flex-col justify-between">
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="text-lg font-semibold text-foreground tabular-nums">{kpi.value}</p>
              <p className="text-[11px] text-muted-foreground">{kpi.hint}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,280px)_1fr] gap-3">
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <label className="text-xs text-muted-foreground">Budget</label>
            <Input
              type="text"
              readOnly
              value={fmtCost(normalizedBudget)}
              className="h-9 mt-1"
            />
          </div>

          <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Used</p>
                <p className="text-base font-semibold text-foreground tabular-nums">
                  {formatMetric(usedBudgetMetric)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className={cn(
                  "text-base font-semibold tabular-nums",
                  remainingBudgetMetric !== null && remainingBudgetMetric < 0 ? "text-destructive" : "text-foreground",
                )}
                >
                  {formatMetric(remainingBudgetMetric)}
                </p>
              </div>
            </div>
            <Progress value={budgetProgressPct} className="h-2 bg-muted/60 [&>div]:rounded-full" />
            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>Used = Committed + Received</span>
              <span>{Math.round(budgetProgressPct)}%</span>
            </div>
            {headerDataStateHint && (
              <p className="text-[11px] text-muted-foreground">{headerDataStateHint}</p>
            )}
          </div>
        </div>
      </div>

      <div className="glass rounded-card p-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
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
                  {TAB_META[tab].label} ({stat.count})
                </button>
              );
            })}
          </div>

          <div className="relative w-full md:w-[320px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, spec, supplier..."
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>
      </div>

      {showStickySelectionBar && (
        <div className="fixed inset-x-0 bottom-3 z-40 px-sp-2 pointer-events-none">
          <div className="mx-auto max-w-[1200px] pointer-events-auto glass-elevated rounded-card border border-border px-3 py-2 flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">{selectionCount} selected</p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={runSelectionPrimaryAction}
                disabled={!canEdit || (isSupabaseMode && activeTab === "in_stock")}
              >
                {selectionPrimaryLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={clearSelectionForActiveTab}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

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
                                      <div className="flex justify-end">
                                        <Button
                                          type="button"
                                          size="sm"
                                          className="h-7"
                                          onClick={() => openCreateOrder([item.id])}
                                          disabled={!canEdit}
                                        >
                                          Order
                                        </Button>
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
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-7"
                                      onClick={() => openCreateOrder([item.id])}
                                      disabled={!canEdit}
                                    >
                                      Order
                                    </Button>
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
              const orderNumber = supplierOrderNumberById.get(order.id) ?? 0;
              const total = order.lines.reduce((sum, line) => {
                const item = itemById.get(line.procurementItemId);
                const unitPrice = line.actualUnitPrice ?? line.plannedUnitPrice ?? item?.actualUnitPrice ?? item?.plannedUnitPrice ?? 0;
                const openQty = Math.max(line.qty - line.receivedQty, 0);
                return sum + unitPrice * openQty;
              }, 0);

              return (
                <div key={order.id} className="rounded-lg border border-border overflow-hidden">
                  <div className="w-full flex items-center gap-2 px-3 py-2 bg-muted/40">
                    <button
                      type="button"
                      className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted/70"
                      onClick={() => toggleOrder(order.id)}
                      aria-label={collapsed ? "Expand order" : "Collapse order"}
                    >
                      {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    <button
                      type="button"
                      className="text-sm font-semibold text-foreground hover:underline"
                      onClick={() => openOrderDetail(order.id)}
                    >
                      {`Supplier order #${orderNumber}`}
                    </button>
                    {order.supplierName && (
                      <span className="text-xs text-muted-foreground truncate">{order.supplierName}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{fmtCost(total)}</span>
                  </div>

                  {!collapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        {renderOrderedTableHeader()}
                        <tbody>
                          {order.lines.map((line) => {
                            const item = itemById.get(line.procurementItemId);
                            if (!item) return null;
                            const openQty = Math.max(line.qty - line.receivedQty, 0);
                            const unitPrice = line.actualUnitPrice ?? line.plannedUnitPrice ?? item.actualUnitPrice ?? item.plannedUnitPrice ?? 0;
                            const selectionKey = `${order.id}:${line.id}`;
                            const receivableTarget = orderedReceivableTargetByKey.get(selectionKey);
                            const selected = !!receivableTarget && selectedOrderedLineKeys.has(selectionKey);
                            const parsedDelivery = order.deliveryDeadline ? new Date(order.deliveryDeadline) : null;
                            const selectedDeliveryDate = parsedDelivery && !Number.isNaN(parsedDelivery.getTime()) ? parsedDelivery : undefined;

                            return (
                              <tr key={line.id} className="border-b border-border/70 last:border-0 hover:bg-muted/20">
                                <td className="px-2 py-2">
                                  <Checkbox
                                    checked={selected}
                                    onCheckedChange={(checked) => {
                                      if (!receivableTarget) return;
                                      toggleSelectedOrderedLine(receivableTarget.selectionKey, !!checked);
                                    }}
                                    disabled={!canEdit || !receivableTarget}
                                  />
                                </td>
                                <td className="px-2 py-2 min-w-[220px]">
                                  <button type="button" className="text-left hover:underline" onClick={() => openDetail(item)}>
                                    <div className="flex min-w-0 items-start gap-2">
                                      <ResourceTypeBadge type={item.type} className="shrink-0 border-transparent" />
                                      <div className="min-w-0">
                                        <p className="font-medium text-foreground truncate">{item.name}</p>
                                        {item.spec && <p className="text-xs text-muted-foreground truncate">{item.spec}</p>}
                                      </div>
                                    </div>
                                    {item.orphaned && (
                                      <span className="inline-flex rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] text-destructive">
                                        Orphaned
                                      </span>
                                    )}
                                  </button>
                                </td>
                                <td className={cn("px-2 py-2 text-xs", isOverdue(item.requiredByDate) && "text-destructive")}>
                                  {formatDate(item.requiredByDate)}
                                </td>
                                <td className="px-2 py-2">
                                  {isSupabaseMode ? (
                                    <span className="text-xs text-muted-foreground">
                                      {order.deliveryDeadline ? formatDate(order.deliveryDeadline) : "-"}
                                    </span>
                                  ) : (
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <button type="button" className="text-xs text-accent hover:underline">
                                          {order.deliveryDeadline ? formatDate(order.deliveryDeadline) : "-"}
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                          mode="single"
                                          selected={selectedDeliveryDate}
                                          onSelect={(nextDate) => {
                                            if (!nextDate) return;
                                            updateOrder(order.id, { deliveryDeadline: nextDate.toISOString() });
                                          }}
                                          initialFocus
                                        />
                                      </PopoverContent>
                                    </Popover>
                                  )}
                                </td>
                                <td className="px-2 py-2 text-right">
                                  <div className="flex items-center justify-end gap-1">
                                    <p className="tabular-nums text-foreground">{openQty}</p>
                                    {line.receivedQty > 0 && openQty > 0 && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button type="button" className="text-warning" aria-label="Partial receive details">
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-xs text-caption">
                                          <p>{`Received ${line.receivedQty} out of ${line.qty}.`}</p>
                                          <button
                                            type="button"
                                            className="mt-1 text-accent hover:underline"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setActiveTab("in_stock");
                                            }}
                                          >
                                            Learn more
                                          </button>
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                </td>
                                <td className="px-2 py-2">{line.unit}</td>
                                <td className="px-2 py-2 text-right">{fmtCost(unitPrice)}</td>
                                <td className="px-2 py-2 text-right">{fmtCost(unitPrice * openQty)}</td>
                                <td className="px-2 py-2">
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-7"
                                      onClick={() => receivableTarget && openReceiveItemsModal([receivableTarget])}
                                      disabled={!canEdit || !receivableTarget}
                                    >
                                      Receive
                                    </Button>
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
          {inStockRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No inventory placements yet.</p>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                {renderInStockTableHeader()}
                <tbody>
                  {inStockRows.map((row) => (
                    <tr key={row.key} className="border-b border-border/70 last:border-0 hover:bg-muted/20">
                      <td className="px-2 py-2">
                        <Checkbox
                          checked={selectedInStockRowKeys.has(row.key)}
                          onCheckedChange={(checked) => toggleSelectedInStockRow(row.key, !!checked)}
                          disabled={!canUseFromStock}
                        />
                      </td>
                      <td className="px-2 py-2 min-w-[240px]">
                        <button type="button" className="text-left hover:underline" onClick={() => openInStockDetail(row)}>
                          <p className="font-medium text-foreground truncate">{row.item.name}</p>
                          {row.item.spec && <p className="text-xs text-muted-foreground truncate">{row.item.spec}</p>}
                          <div className="mt-1">
                            <ResourceTypeBadge type={row.item.type} className="border-transparent" />
                          </div>
                        </button>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{row.locationName}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{row.qty} {row.item.unit}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{formatDate(row.lastReceivedAt)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            className="h-7"
                            onClick={() => openUseFromStockModal([row])}
                            disabled={!canUseFromStock}
                          >
                            Use
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7"
                            onClick={() => handleRequestMore(row)}
                            disabled={!canEdit}
                          >
                            Request more
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Dialog
        open={useFromStockOpen}
        onOpenChange={(nextOpen) => {
          setUseFromStockOpen(nextOpen);
          if (!nextOpen) {
            setUseFromStockTargets([]);
            setUseFromStockQtyByKey({});
            setUseFromStockParticipantId("none");
            setUseFromStockManualName("");
            setUseFromStockNote("");
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle>Use from stock</DialogTitle>
          </DialogHeader>

          {useFromStockTargets.length === 0 ? (
            <div className="px-5 py-4 text-sm text-muted-foreground">No stock item selected.</div>
          ) : (
            <div className="px-5 py-4 space-y-4">
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2">Item</th>
                      <th className="text-left px-3 py-2">Location</th>
                      <th className="text-right px-3 py-2">Available</th>
                      <th className="text-right px-3 py-2">Quantity to use now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {useFromStockTargets.map((target) => (
                      <tr key={target.key} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 min-w-[220px]">
                          <div className="flex items-start gap-2">
                            <ResourceTypeBadge type={target.item.type} className="shrink-0 border-transparent" />
                            <div className="min-w-0">
                              <p className="font-medium text-foreground truncate">{target.item.name}</p>
                              {target.item.spec && <p className="text-xs text-muted-foreground truncate">{target.item.spec}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{target.locationName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{target.qty} {target.item.unit}</td>
                        <td className="px-3 py-2 text-right">
                          <Input
                            type="number"
                            min="0"
                            max={target.qty}
                            value={useFromStockQtyByKey[target.key] ?? ""}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              setUseFromStockQtyByKey((prev) => ({
                                ...prev,
                                [target.key]: nextValue,
                              }));
                            }}
                            placeholder={String(target.qty)}
                            className="h-9 w-32 ml-auto"
                            aria-label={`Quantity to use now for ${target.item.name}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="use-from-stock-participant" className="text-xs text-muted-foreground">Used by (participant)</label>
                  <Select value={useFromStockParticipantId} onValueChange={setUseFromStockParticipantId}>
                    <SelectTrigger id="use-from-stock-participant" className="h-9 mt-1">
                      <SelectValue placeholder="Not specified" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not specified</SelectItem>
                      {participantOptions.map((participant) => (
                        <SelectItem key={participant.id} value={participant.id}>{participant.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label htmlFor="use-from-stock-manual-name" className="text-xs text-muted-foreground">Manual name</label>
                  <Input
                    id="use-from-stock-manual-name"
                    value={useFromStockManualName}
                    onChange={(event) => setUseFromStockManualName(event.target.value)}
                    className="h-9 mt-1"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="use-from-stock-note" className="text-xs text-muted-foreground">Note</label>
                <Textarea
                  id="use-from-stock-note"
                  value={useFromStockNote}
                  onChange={(event) => setUseFromStockNote(event.target.value)}
                  className="mt-1 min-h-[72px]"
                  placeholder="Optional note"
                />
              </div>
            </div>
          )}

          <DialogFooter className="px-5 py-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setUseFromStockOpen(false)}>Cancel</Button>
            <Button type="button" onClick={submitUseFromStock} disabled={!canUseFromStock || useFromStockTargets.length === 0}>Use</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={inStockDetailOpen}
        onOpenChange={(nextOpen) => {
          setInStockDetailOpen(nextOpen);
          if (!nextOpen) setInStockDetailTarget(null);
        }}
      >
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle>Stock details</DialogTitle>
          </DialogHeader>

          {!inStockDetailTarget ? (
            <div className="px-5 py-4 text-sm text-muted-foreground">No stock item selected.</div>
          ) : (
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              <div className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-start gap-2">
                  <ResourceTypeBadge type={inStockDetailTarget.item.type} className="border-transparent" />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{inStockDetailTarget.item.name}</p>
                    {inStockDetailTarget.item.spec && (
                      <p className="text-xs text-muted-foreground">{inStockDetailTarget.item.spec}</p>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Current location: {inStockDetailTarget.locationName}</p>
                <p className="text-xs text-muted-foreground">Qty available: {inStockDetailTarget.qty} {inStockDetailTarget.item.unit}</p>
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-muted/30 text-sm font-medium text-foreground">Receipt history</div>
                {inStockDetailHistory.receiptEvents.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No receipt events yet.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {inStockDetailHistory.receiptEvents.map((entry) => {
                      const receiverLabel = entry.event.receiverName
                        || (entry.event.receiverParticipantId ? participantNameById.get(entry.event.receiverParticipantId) : "")
                        || "—";
                      const sourceLocationLabel = entry.event.sourceLocationId
                        ? (locationById.get(entry.event.sourceLocationId)?.name ?? entry.event.sourceLocationId)
                        : "—";
                      const docs = entry.event.documents?.length
                        ? entry.event.documents
                        : (entry.order.invoiceAttachment ? [entry.order.invoiceAttachment] : []);

                      return (
                        <div key={entry.event.id} className="px-3 py-2 space-y-1">
                          <p className="text-xs text-muted-foreground">{new Date(entry.event.createdAt).toLocaleString()}</p>
                          <p className="text-sm text-foreground">
                            +{entry.event.deltaQty} {entry.line?.unit ?? inStockDetailTarget.item.unit}
                          </p>
                          <p className="text-xs text-muted-foreground">Receiver: {receiverLabel}</p>
                          <p className="text-xs text-muted-foreground">Source location: {sourceLocationLabel}</p>
                          {docs.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              {docs.map((doc) => (
                                <a
                                  key={doc.id}
                                  href={doc.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs text-accent hover:underline"
                                >
                                  {attachmentDisplayName(doc)}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 border-b border-border bg-muted/30 text-sm font-medium text-foreground">Usage history</div>
                {inStockDetailHistory.usageEvents.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">No usage events yet.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {inStockDetailHistory.usageEvents.map((entry) => {
                      const usedByLabel = entry.event.usedByName
                        || (entry.event.usedByParticipantId ? participantNameById.get(entry.event.usedByParticipantId) : "")
                        || "—";
                      return (
                        <div key={entry.event.id} className="px-3 py-2 space-y-1">
                          <p className="text-xs text-muted-foreground">{new Date(entry.event.createdAt).toLocaleString()}</p>
                          <p className="text-sm text-foreground">
                            {entry.event.deltaQty} {entry.line?.unit ?? inStockDetailTarget.item.unit}
                          </p>
                          <p className="text-xs text-muted-foreground">Used by: {usedByLabel}</p>
                          {entry.event.note && <p className="text-xs text-muted-foreground">Note: {entry.event.note}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="px-5 py-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setInStockDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={receiveModalOpen}
        onOpenChange={(nextOpen) => {
          setReceiveModalOpen(nextOpen);
          if (!nextOpen) {
            setReceiveModalTargets([]);
            setReceiveModalQtyByKey({});
            setReceiveModalLocationByKey({});
          }
        }}
      >
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle>Receive items</DialogTitle>
          </DialogHeader>

          {receiveModalTargets.length === 0 ? (
            <div className="px-5 py-4 text-sm text-muted-foreground">No items selected.</div>
          ) : (
            <div className="px-5 py-4 flex-1 overflow-y-auto space-y-3">
              {receiveModalTargets.length === 1 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="font-medium text-foreground">{receiveModalTargets[0].itemName}</p>
                  {receiveModalTargets[0].itemSpec && (
                    <p className="text-xs text-muted-foreground mt-1">{receiveModalTargets[0].itemSpec}</p>
                  )}
                </div>
              )}

              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="text-left px-3 py-2">Item</th>
                      <th className="text-right px-3 py-2">Ordered</th>
                      <th className="text-right px-3 py-2">Already received</th>
                      <th className="text-right px-3 py-2">Remaining</th>
                      <th className="text-left px-3 py-2">Location</th>
                      <th className="text-right px-3 py-2">Quantity received now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveModalTargets.map((target) => (
                      <tr key={target.selectionKey} className="border-b border-border/70 last:border-0">
                        <td className="px-3 py-2">
                          <div className="flex min-w-0 items-start gap-2">
                            <ResourceTypeBadge type={target.itemType} className="shrink-0 border-transparent" />
                            <div className="min-w-0">
                              <p className="font-medium text-foreground">{target.itemName}</p>
                              {target.itemSpec && <p className="text-xs text-muted-foreground">{target.itemSpec}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{target.orderedQty} {target.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{target.alreadyReceivedQty} {target.unit}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{target.remainingQty} {target.unit}</td>
                        <td className="px-3 py-2">
                          <LocationPicker
                            projectId={pid}
                            value={receiveModalLocationByKey[target.selectionKey] ?? ""}
                            onChange={(nextLocationId) => {
                              setReceiveModalLocationByKey((prev) => ({
                                ...prev,
                                [target.selectionKey]: nextLocationId,
                              }));
                            }}
                            className="h-8"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min="0"
                            max={target.remainingQty}
                            value={receiveModalQtyByKey[target.selectionKey] ?? target.remainingQty}
                            onChange={(event) => {
                              const rawQty = Number(event.target.value);
                              const clampedQty = Math.min(target.remainingQty, Math.max(0, Number.isFinite(rawQty) ? rawQty : 0));
                              setReceiveModalQtyByKey((prev) => ({ ...prev, [target.selectionKey]: clampedQty }));
                            }}
                            className="h-8 text-right"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DialogFooter className="px-5 py-4 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setReceiveModalOpen(false)}>Close</Button>
            <Button
              type="button"
              onClick={submitReceiveItems}
              disabled={!canEdit || receiveModalTargets.length === 0 || receiveItemsConfirmInFlight}
            >
              {receiveItemsConfirmInFlight ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {receiveItemsConfirmInFlight ? "Receiving..." : "Confirm received"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <DialogContent className="h-[95vh] w-[100vw] max-w-none rounded-none p-0 gap-0 overflow-hidden flex flex-col sm:h-auto sm:w-[75vw] sm:max-w-6xl sm:max-h-[90vh] sm:rounded-xl">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12 sm:px-6 sm:py-4">
            <DialogTitle>Procurement request</DialogTitle>
          </DialogHeader>

          {!detailItem ? (
            <div className="p-4">
              <p className="text-sm text-muted-foreground">Item not found.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
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
                        disabled={!canEdit || activeTab === "ordered"}
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
                            disabled={!canEdit || activeTab === "ordered" || !!detailItem.lockedFromEstimate}
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
                    disabled={!canEdit || activeTab === "ordered"}
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
                      disabled={!canEdit || activeTab === "ordered" || !!detailItem.lockedFromEstimate}
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
                      disabled={!canEdit || activeTab === "ordered"}
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
