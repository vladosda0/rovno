import type { SupabaseClient } from "@supabase/supabase-js";
import { getProcurementItems } from "@/data/procurement-store";
import { buildReceivedQtyByOrderLineId } from "@/data/orders-source";
import type { WorkspaceMode } from "@/data/workspace-source";
import { resolveWorkspaceMode } from "@/data/workspace-source";
import type { ProcurementItemV2 } from "@/types/entities";
import type { Database as ProcurementDatabase } from "../../backend-truth/generated/supabase-types";

type ProcurementItemRow = ProcurementDatabase["public"]["Tables"]["procurement_items"]["Row"];
type OrderRow = ProcurementDatabase["public"]["Tables"]["orders"]["Row"];
type OrderLineRow = ProcurementDatabase["public"]["Tables"]["order_lines"]["Row"];
type InventoryMovementRow = ProcurementDatabase["public"]["Tables"]["inventory_movements"]["Row"];
type TypedSupabaseClient = SupabaseClient<ProcurementDatabase>;

interface ShapeProcurementItemsInput {
  itemRows: ProcurementItemRow[];
  orderRows: OrderRow[];
  orderLineRows: OrderLineRow[];
  movementRows: InventoryMovementRow[];
}

export interface ProcurementSource {
  mode: WorkspaceMode["kind"];
  getProjectProcurementItems: (projectId: string) => Promise<ProcurementItemV2[]>;
}

function createBrowserProcurementSource(mode: "demo" | "local"): ProcurementSource {
  return {
    mode,
    async getProjectProcurementItems(projectId: string) {
      return getProcurementItems(projectId);
    },
  };
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
        lockedFromEstimate: false,
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

function createSupabaseProcurementSource(
  supabase: TypedSupabaseClient,
): ProcurementSource {
  return {
    mode: "supabase",
    async getProjectProcurementItems(projectId: string) {
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
