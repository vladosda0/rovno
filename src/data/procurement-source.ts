import type { SupabaseClient } from "@supabase/supabase-js";
import { getLatestHeroTransitionEvent } from "@/data/activity-source";
import { loadEstimateV2HeroTransitionCache } from "@/data/estimate-v2-transition-cache";
import { getProcurementItems } from "@/data/procurement-store";
import { buildReceivedQtyByOrderLineId } from "@/data/orders-source";
import type { WorkspaceMode } from "@/data/workspace-source";
import { resolveWorkspaceMode } from "@/data/workspace-source";
import type { FinanceRowLoadAccess } from "@/lib/permissions";
import type { ProcurementItemV2 } from "@/types/entities";
import type { EstimateExecutionStatus, EstimateV2ResourceLine, EstimateV2Work } from "@/types/estimate-v2";
import type { Database as ProcurementDatabase } from "../../backend-truth/generated/supabase-types";
import {
  parseProcurementOperationalSummaryPayload,
  type ProcurementOperationalRpcOrderedLine,
  type ProcurementOperationalRpcProcurementItem,
} from "@/data/procurement-operational-summary-payload";

export type {
  ProcurementOperationalRpcOrderedLine,
  ProcurementOperationalRpcProcurementItem,
} from "@/data/procurement-operational-summary-payload";

export { parseProcurementOperationalSummaryPayload } from "@/data/procurement-operational-summary-payload";

type ProcurementItemRow = ProcurementDatabase["public"]["Tables"]["procurement_items"]["Row"];
type ProcurementItemInsert = ProcurementDatabase["public"]["Tables"]["procurement_items"]["Insert"];
type OrderRow = ProcurementDatabase["public"]["Tables"]["orders"]["Row"];
type OrderLineRow = ProcurementDatabase["public"]["Tables"]["order_lines"]["Row"];
type InventoryMovementRow = ProcurementDatabase["public"]["Tables"]["inventory_movements"]["Row"];
type TypedSupabaseClient = SupabaseClient<ProcurementDatabase>;
type HeroTransitionIds = {
  lineIdByLocalLineId: Record<string, string>;
  procurementItemIdByLocalLineId: Record<string, string>;
};

interface ShapeProcurementItemsInput {
  itemRows: ProcurementItemRow[];
  orderRows: OrderRow[];
  orderLineRows: OrderLineRow[];
  movementRows: InventoryMovementRow[];
}

export interface ProcurementSource {
  mode: WorkspaceMode["kind"];
  getProjectProcurementItems: (
    projectId: string,
    financeLoadAccess?: FinanceRowLoadAccess,
  ) => Promise<ProcurementItemV2[]>;
}

export interface HeroProcurementItemUpsertInput {
  id: string;
  projectId: string;
  estimateResourceLineId?: string | null;
  taskId?: string | null;
  title: string;
  description?: string | null;
  category?: string | null;
  quantity: number;
  unit?: string | null;
  plannedUnitPriceCents?: number | null;
  plannedTotalPriceCents?: number | null;
  status?: ProcurementItemRow["status"];
  createdBy: string;
}

export interface HeroProcurementLineageRow {
  id: string;
  estimateResourceLineId: string;
  taskId: string | null;
  title: string;
  description: string | null;
  category: string | null;
  quantity: number;
  unit: string | null;
  plannedUnitPriceCents: number | null;
  plannedTotalPriceCents: number | null;
  status: ProcurementItemRow["status"];
  createdBy: string;
}

interface ExistingHeroProcurementRow {
  id: string;
  estimateResourceLineId: string | null;
  taskId: string | null;
  title: string;
  description: string | null;
  category: string | null;
  quantity: number;
  unit: string | null;
  plannedUnitPriceCents: number | null;
  plannedTotalPriceCents: number | null;
  status: ProcurementItemRow["status"];
  createdBy: string;
}

export interface SyncProjectProcurementFromEstimateInput {
  projectId: string;
  estimateStatus: EstimateExecutionStatus;
  works: Array<Pick<EstimateV2Work, "id" | "taskId" | "plannedStart" | "stageId">>;
  lines: Array<Pick<
    EstimateV2ResourceLine,
    "id" | "stageId" | "workId" | "title" | "type" | "qtyMilli" | "unit" | "costUnitCents"
  >>;
  profileId: string;
}

const PROCUREMENT_RESOURCE_TYPES = new Set<EstimateV2ResourceLine["type"]>(["material", "tool"]);

function createBrowserProcurementSource(mode: "demo" | "local"): ProcurementSource {
  return {
    mode,
    async getProjectProcurementItems(projectId: string) {
      return getProcurementItems(projectId);
    },
  };
}

function baseOperationalProcurementItemV2(
  projectId: string,
  input: {
    id: string;
    name: string;
    spec: string | null;
    unit: string;
    requiredQty: number;
    orderedQty: number;
    categoryId: string | null;
    estimateResourceLineId: string | null;
    taskId: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    createdFrom: ProcurementItemV2["createdFrom"];
  },
): ProcurementItemV2 {
  return {
    id: input.id,
    projectId,
    stageId: null,
    categoryId: input.categoryId,
    type: "material",
    name: input.name,
    spec: input.spec,
    unit: input.unit,
    requiredByDate: null,
    requiredQty: input.requiredQty,
    orderedQty: input.orderedQty,
    receivedQty: 0,
    plannedUnitPrice: null,
    actualUnitPrice: null,
    supplier: null,
    supplierPreferred: null,
    locationPreferredId: null,
    lockedFromEstimate: Boolean(input.estimateResourceLineId),
    sourceEstimateItemId: null,
    sourceEstimateV2LineId: input.estimateResourceLineId,
    orphaned: false,
    orphanedAt: null,
    orphanedReason: null,
    linkUrl: null,
    notes: null,
    attachments: [],
    createdFrom: input.createdFrom,
    linkedTaskIds: input.taskId ? [input.taskId] : [],
    archived: input.status === "cancelled",
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function mapProcurementOperationalSummaryToItems(
  projectId: string,
  data: unknown,
): ProcurementItemV2[] {
  const parsed = parseProcurementOperationalSummaryPayload(data);
  if (!parsed) {
    return [];
  }

  const { orderedLines, procurementItems } = parsed;
  const linesByProcurementItemId = new Map<string, ProcurementOperationalRpcOrderedLine[]>();
  orderedLines.forEach((line) => {
    if (!line.procurement_item_id) {
      return;
    }
    const list = linesByProcurementItemId.get(line.procurement_item_id) ?? [];
    list.push(line);
    linesByProcurementItemId.set(line.procurement_item_id, list);
  });

  const itemsById = new Map<string, ProcurementItemV2>();

  procurementItems.forEach((pi) => {
    if (pi.status === "cancelled") {
      return;
    }
    const related = linesByProcurementItemId.get(pi.procurement_item_id) ?? [];
    const orderedQty = related.reduce((sum, line) => sum + line.quantity, 0);
    itemsById.set(
      pi.procurement_item_id,
      baseOperationalProcurementItemV2(projectId, {
        id: pi.procurement_item_id,
        name: pi.title,
        spec: pi.description,
        unit: pi.unit ?? "",
        requiredQty: pi.quantity,
        orderedQty,
        categoryId: pi.category,
        estimateResourceLineId: pi.estimate_resource_line_id,
        taskId: pi.task_id,
        status: pi.status,
        createdAt: pi.created_at,
        updatedAt: pi.updated_at,
        createdFrom: pi.estimate_resource_line_id
          ? "estimate"
          : pi.task_id
            ? "task_material"
            : "manual",
      }),
    );
  });

  orderedLines.forEach((line) => {
    if (line.procurement_item_id) {
      return;
    }
    const title = line.title?.trim() || line.procurement_item_title?.trim() || "Ordered item";
    itemsById.set(
      line.order_line_id,
      baseOperationalProcurementItemV2(projectId, {
        id: line.order_line_id,
        name: title,
        spec: null,
        unit: line.unit ?? "",
        requiredQty: line.quantity,
        orderedQty: line.quantity,
        categoryId: null,
        estimateResourceLineId: null,
        taskId: null,
        status: "",
        createdAt: line.created_at,
        updatedAt: line.created_at,
        createdFrom: "manual",
      }),
    );
  });

  return [...itemsById.values()].filter((item) => !item.archived);
}

function isAppliedOrderStatus(status: OrderRow["status"]): boolean {
  return status !== "draft" && status !== "cancelled";
}

function orderSortTime(value: string): number {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 0;
  }
  return timestamp;
}

export function shapeProcurementItemsWithOrderContext(
  input: ShapeProcurementItemsInput,
): ProcurementItemV2[] {
  const orderById = new Map(input.orderRows.map((row) => [row.id, row]));
  const receivedQtyByOrderLineId = buildReceivedQtyByOrderLineId(input.movementRows);
  const orderLinesByProcurementItemId = new Map<string, OrderLineRow[]>();

  input.orderLineRows.forEach((row) => {
    if (!row.procurement_item_id) {
      return;
    }

    const parentOrder = orderById.get(row.order_id);
    if (!parentOrder || !isAppliedOrderStatus(parentOrder.status)) {
      return;
    }

    const rows = orderLinesByProcurementItemId.get(row.procurement_item_id) ?? [];
    rows.push(row);
    orderLinesByProcurementItemId.set(row.procurement_item_id, rows);
  });

  return input.itemRows
    .filter((row) => row.status !== "cancelled")
    .map((row) => {
      const relatedLines = orderLinesByProcurementItemId.get(row.id) ?? [];
      const sortedRelatedLines = [...relatedLines].sort((left, right) => {
        const leftOrder = orderById.get(left.order_id);
        const rightOrder = orderById.get(right.order_id);
        const orderDiff = orderSortTime(rightOrder?.updated_at ?? "") - orderSortTime(leftOrder?.updated_at ?? "");
        if (orderDiff !== 0) {
          return orderDiff;
        }
        return orderSortTime(right.created_at) - orderSortTime(left.created_at);
      });
      const latestLineWithPrice = sortedRelatedLines.find((line) => line.unit_price_cents != null);
      const latestRelatedOrder = sortedRelatedLines.length > 0
        ? orderById.get(sortedRelatedLines[0].order_id)
        : undefined;

      return {
        id: row.id,
        projectId: row.project_id,
        stageId: null,
        categoryId: row.category ?? null,
        // Temporary compatibility bucket until backend procurement rows expose a reliable material/tool/other discriminator.
        type: "material",
        name: row.title,
        spec: row.description ?? null,
        unit: row.unit ?? "",
        requiredByDate: null,
        requiredQty: row.quantity,
        orderedQty: relatedLines.reduce((sum, line) => sum + line.quantity, 0),
        receivedQty: relatedLines.reduce((sum, line) => sum + (receivedQtyByOrderLineId.get(line.id) ?? 0), 0),
        plannedUnitPrice: row.planned_unit_price_cents != null
          ? row.planned_unit_price_cents / 100
          : null,
        actualUnitPrice: latestLineWithPrice?.unit_price_cents != null
          ? latestLineWithPrice.unit_price_cents / 100
          : null,
        supplier: latestRelatedOrder?.supplier_name ?? null,
        supplierPreferred: null,
        locationPreferredId: null,
        lockedFromEstimate: Boolean(row.estimate_resource_line_id),
        sourceEstimateItemId: null,
        sourceEstimateV2LineId: row.estimate_resource_line_id ?? null,
        orphaned: false,
        orphanedAt: null,
        orphanedReason: null,
        linkUrl: null,
        notes: null,
        attachments: [],
        createdFrom: row.estimate_resource_line_id
          ? "estimate"
          : row.task_id
            ? "task_material"
            : "manual",
        linkedTaskIds: row.task_id ? [row.task_id] : [],
        archived: false,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } satisfies ProcurementItemV2;
    });
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

function procurementQuantityFromLine(
  line: Pick<EstimateV2ResourceLine, "qtyMilli">,
): number {
  return Math.max(0, line.qtyMilli / 1_000);
}

function procurementPlannedUnitPriceCentsFromLine(
  line: Pick<EstimateV2ResourceLine, "costUnitCents">,
): number {
  return Math.max(0, Math.round(line.costUnitCents));
}

function buildProcurementItemIdByEstimateLineId(
  ids: HeroTransitionIds | null,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!ids) return map;

  Object.entries(ids.procurementItemIdByLocalLineId).forEach(([localLineId, procurementItemId]) => {
    map.set(localLineId, procurementItemId);
    const estimateLineId = ids.lineIdByLocalLineId[localLineId];
    if (estimateLineId) {
      map.set(estimateLineId, procurementItemId);
    }
  });

  return map;
}

async function resolveHeroTransitionIds(
  supabase: TypedSupabaseClient,
  projectId: string,
): Promise<HeroTransitionIds | null> {
  const cache = loadEstimateV2HeroTransitionCache(projectId);
  if (cache?.ids) {
    return {
      lineIdByLocalLineId: { ...cache.ids.lineIdByLocalLineId },
      procurementItemIdByLocalLineId: { ...cache.ids.procurementItemIdByLocalLineId },
    };
  }

  const latestEvent = await getLatestHeroTransitionEvent(supabase, projectId);
  if (!latestEvent) {
    return null;
  }

  return {
    lineIdByLocalLineId: { ...latestEvent.payload.ids.lineIdByLocalLineId },
    procurementItemIdByLocalLineId: { ...latestEvent.payload.ids.procurementItemIdByLocalLineId },
  };
}

function mapProcurementLineageRow(
  row: ProcurementItemRow,
): ExistingHeroProcurementRow {
  return {
    id: row.id,
    estimateResourceLineId: row.estimate_resource_line_id ?? null,
    taskId: row.task_id ?? null,
    title: row.title,
    description: row.description ?? null,
    category: row.category ?? null,
    quantity: row.quantity,
    unit: row.unit ?? null,
    plannedUnitPriceCents: row.planned_unit_price_cents ?? null,
    plannedTotalPriceCents: row.planned_total_price_cents ?? null,
    status: row.status,
    createdBy: row.created_by,
  };
}

export async function upsertHeroProcurementItems(
  supabase: TypedSupabaseClient,
  inputs: HeroProcurementItemUpsertInput[],
): Promise<void> {
  if (inputs.length === 0) return;

  const rows: ProcurementItemInsert[] = inputs.map((input) => ({
    id: input.id,
    project_id: input.projectId,
    estimate_resource_line_id: input.estimateResourceLineId ?? null,
    task_id: input.taskId ?? null,
    title: input.title,
    description: input.description ?? null,
    category: input.category ?? null,
    quantity: input.quantity,
    unit: input.unit ?? null,
    planned_unit_price_cents: input.plannedUnitPriceCents ?? null,
    planned_total_price_cents: input.plannedTotalPriceCents ?? null,
    status: input.status ?? "requested",
    created_by: input.createdBy,
  }));

  const { error } = await supabase
    .from("procurement_items")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    throw error;
  }
}

export async function loadHeroProcurementItemsByEstimateLineId(
  supabase: TypedSupabaseClient,
  input: {
    projectId: string;
    estimateResourceLineIds: string[];
  },
): Promise<Map<string, HeroProcurementLineageRow>> {
  const estimateResourceLineIds = Array.from(new Set(input.estimateResourceLineIds.filter(Boolean)));
  if (estimateResourceLineIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("procurement_items")
    .select("id, estimate_resource_line_id, task_id, title, description, category, quantity, unit, planned_unit_price_cents, planned_total_price_cents, status, created_by")
    .eq("project_id", input.projectId)
    .in("estimate_resource_line_id", estimateResourceLineIds);

  if (error) {
    throw error;
  }

  const result = new Map<string, HeroProcurementLineageRow>();
  (data ?? []).forEach((row) => {
    if (!row.estimate_resource_line_id) {
      return;
    }
    if (result.has(row.estimate_resource_line_id)) {
      throw new Error(`Ambiguous remote procurement mapping for estimate line "${row.estimate_resource_line_id}"`);
    }
    result.set(row.estimate_resource_line_id, {
      ...mapProcurementLineageRow(row),
      estimateResourceLineId: row.estimate_resource_line_id,
    });
  });

  return result;
}

async function loadHeroProcurementItemsByIds(
  supabase: TypedSupabaseClient,
  ids: string[],
): Promise<Map<string, ExistingHeroProcurementRow>> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("procurement_items")
    .select("id, estimate_resource_line_id, task_id, title, description, category, quantity, unit, planned_unit_price_cents, planned_total_price_cents, status, created_by")
    .in("id", uniqueIds);

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((row) => [row.id, mapProcurementLineageRow(row)]));
}

async function loadHeroProcurementItemsByProject(
  supabase: TypedSupabaseClient,
  projectId: string,
): Promise<HeroProcurementLineageRow[]> {
  const { data, error } = await supabase
    .from("procurement_items")
    .select("id, estimate_resource_line_id, task_id, title, description, category, quantity, unit, planned_unit_price_cents, planned_total_price_cents, status, created_by")
    .eq("project_id", projectId)
    .not("estimate_resource_line_id", "is", null);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .filter((row): row is ProcurementItemRow & { estimate_resource_line_id: string } => Boolean(row.estimate_resource_line_id))
    .map((row) => ({
      id: row.id,
      estimateResourceLineId: row.estimate_resource_line_id,
      taskId: row.task_id ?? null,
      title: row.title,
      description: row.description ?? null,
      category: row.category ?? null,
      quantity: row.quantity,
      unit: row.unit ?? null,
      plannedUnitPriceCents: row.planned_unit_price_cents ?? null,
      plannedTotalPriceCents: row.planned_total_price_cents ?? null,
      status: row.status,
      createdBy: row.created_by,
    }));
}

async function unlinkHeroProcurementItems(
  supabase: TypedSupabaseClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("procurement_items")
    .update({
      estimate_resource_line_id: null,
      task_id: null,
    })
    .in("id", ids);

  if (error) {
    throw error;
  }
}

export async function syncProjectProcurementFromEstimate(
  input: SyncProjectProcurementFromEstimateInput,
): Promise<void> {
  if (input.estimateStatus === "planning") {
    return;
  }

  const supabase = await loadSupabaseClient();
  const heroIds = await resolveHeroTransitionIds(supabase, input.projectId);
  const procurementItemIdByEstimateLineId = buildProcurementItemIdByEstimateLineId(heroIds);
  const syncableLines = input.lines.filter((line) => PROCUREMENT_RESOURCE_TYPES.has(line.type));
  const syncableLineIdSet = new Set(syncableLines.map((line) => line.id));
  const existingRows = await loadHeroProcurementItemsByProject(supabase, input.projectId);
  const existingByLineId = new Map(existingRows.map((row) => [row.estimateResourceLineId, row]));
  const legacyKnownRowsById = await loadHeroProcurementItemsByIds(
    supabase,
    syncableLines.flatMap((line) => {
      const knownItemId = procurementItemIdByEstimateLineId.get(line.id);
      return knownItemId && !existingByLineId.has(line.id) ? [knownItemId] : [];
    }),
  );

  const staleIds = existingRows
    .filter((row) => !syncableLineIdSet.has(row.estimateResourceLineId))
    .map((row) => row.id);
  await unlinkHeroProcurementItems(supabase, staleIds);

  if (syncableLines.length === 0) {
    return;
  }

  const workById = new Map(input.works.map((work) => [work.id, work]));
  const rowsToUpsert: HeroProcurementItemUpsertInput[] = syncableLines.map((line) => {
    const activeExisting = existingByLineId.get(line.id) ?? null;
    const knownLegacyItemId = procurementItemIdByEstimateLineId.get(line.id) ?? null;
    const legacyExisting = !activeExisting && knownLegacyItemId
      ? legacyKnownRowsById.get(knownLegacyItemId) ?? null
      : null;
    const existing = activeExisting ?? (
      legacyExisting && (
        legacyExisting.estimateResourceLineId == null
        || legacyExisting.estimateResourceLineId === line.id
      )
        ? legacyExisting
        : null
    );
    const work = workById.get(line.workId) ?? null;
    const plannedUnitPriceCents = procurementPlannedUnitPriceCentsFromLine(line);
    const quantity = procurementQuantityFromLine(line);

    return {
      id: existing?.id ?? line.id,
      projectId: input.projectId,
      estimateResourceLineId: line.id,
      taskId: work?.taskId ?? null,
      title: line.title,
      description: existing?.description ?? null,
      category: existing?.category ?? null,
      quantity,
      unit: line.unit ?? existing?.unit ?? null,
      plannedUnitPriceCents,
      plannedTotalPriceCents: Math.round(plannedUnitPriceCents * quantity),
      status: existing?.status ?? "requested",
      createdBy: existing?.createdBy ?? input.profileId,
    };
  });

  await upsertHeroProcurementItems(supabase, rowsToUpsert);
}

export async function deleteHeroProcurementItems(
  supabase: TypedSupabaseClient,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase
    .from("procurement_items")
    .delete()
    .in("id", ids);

  if (error) {
    throw error;
  }
}

function createSupabaseProcurementSource(
  supabase: TypedSupabaseClient,
): ProcurementSource {
  return {
    mode: "supabase",
    async getProjectProcurementItems(
      projectId: string,
      financeLoadAccess: FinanceRowLoadAccess = "full",
    ) {
      if (financeLoadAccess === "none") {
        return [];
      }

      if (financeLoadAccess === "operational_summary") {
        const { data, error } = await supabase.rpc("get_procurement_operational_summary", {
          p_project_id: projectId,
          p_limit: 500,
          p_offset: 0,
        });

        if (error) {
          throw error;
        }

        return mapProcurementOperationalSummaryToItems(projectId, data);
      }

      const { data: itemRows, error: itemsError } = await supabase
        .from("procurement_items")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });

      if (itemsError) {
        throw itemsError;
      }

      const rows = itemRows ?? [];
      if (rows.length === 0) {
        return [];
      }

      const itemIds = rows.map((row) => row.id);
      const { data: orderLineRows, error: linesError } = await supabase
        .from("order_lines")
        .select("*")
        .in("procurement_item_id", itemIds)
        .order("created_at", { ascending: true });

      if (linesError) {
        throw linesError;
      }

      const lines = orderLineRows ?? [];
      const orderIds = Array.from(new Set(lines.map((row) => row.order_id)));
      let orderRows: OrderRow[] = [];
      if (orderIds.length > 0) {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .in("id", orderIds);

        if (error) {
          throw error;
        }

        orderRows = data ?? [];
      }

      const lineIds = lines.map((row) => row.id);
      let movementRows: InventoryMovementRow[] = [];
      if (lineIds.length > 0) {
        const { data, error } = await supabase
          .from("inventory_movements")
          .select("*")
          .in("order_line_id", lineIds)
          .order("created_at", { ascending: true });

        if (error) {
          throw error;
        }

        movementRows = data ?? [];
      }

      return shapeProcurementItemsWithOrderContext({
        itemRows: rows,
        orderRows,
        orderLineRows: lines,
        movementRows,
      });
    },
  };
}

export async function getProcurementSource(
  mode?: WorkspaceMode,
): Promise<ProcurementSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return createBrowserProcurementSource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseProcurementSource(supabase);
}
