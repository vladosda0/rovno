import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrder,
  listOrdersByProject,
  listPlacedSupplierOrders,
  listPlacedSupplierOrdersAllProjects,
} from "@/data/order-store";
import type { WorkspaceMode } from "@/data/workspace-source";
import { resolveWorkspaceMode } from "@/data/workspace-source";
import type { OrderLine, OrderReceiveEvent, OrderWithLines } from "@/types/entities";
import type { Database as ProcurementDatabase } from "../../backend-truth/generated/supabase-types";

type OrderRow = ProcurementDatabase["public"]["Tables"]["orders"]["Row"];
type OrderLineRow = ProcurementDatabase["public"]["Tables"]["order_lines"]["Row"];
type InventoryMovementRow = ProcurementDatabase["public"]["Tables"]["inventory_movements"]["Row"];
type ProcurementItemRow = ProcurementDatabase["public"]["Tables"]["procurement_items"]["Row"];
type TypedSupabaseClient = SupabaseClient<ProcurementDatabase>;

interface ShapeOrdersInput {
  orderRows: OrderRow[];
  lineRows: OrderLineRow[];
  movementRows: InventoryMovementRow[];
  procurementItemRows: ProcurementItemRow[];
}

export interface OrdersSource {
  mode: WorkspaceMode["kind"];
  getProjectOrders: (projectId: string) => Promise<OrderWithLines[]>;
  getOrderById: (orderId: string) => Promise<OrderWithLines | null>;
  getPlacedSupplierOrders: (projectId: string) => Promise<OrderWithLines[]>;
  getPlacedSupplierOrdersAllProjects: () => Promise<OrderWithLines[]>;
}

function createBrowserOrdersSource(mode: "demo" | "local"): OrdersSource {
  return {
    mode,
    async getProjectOrders(projectId: string) {
      return listOrdersByProject(projectId);
    },
    async getOrderById(orderId: string) {
      return getOrder(orderId) ?? null;
    },
    async getPlacedSupplierOrders(projectId: string) {
      return listPlacedSupplierOrders(projectId);
    },
    async getPlacedSupplierOrdersAllProjects() {
      return listPlacedSupplierOrdersAllProjects();
    },
  };
}

function mapOrderStatus(status: OrderRow["status"]): OrderWithLines["status"] {
  if (status === "draft") {
    return "draft";
  }
  if (status === "cancelled") {
    return "voided";
  }
  if (status === "received") {
    return "received";
  }
  return "placed";
}

function isAppliedOrderStatus(status: OrderRow["status"]): boolean {
  return status !== "draft" && status !== "cancelled";
}

function movementSortTime(value: string): number {
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) {
    return 0;
  }
  return timestamp;
}

function firstMovementLocationId(
  rows: InventoryMovementRow[],
  predicate: (row: InventoryMovementRow) => boolean,
): string | null {
  const row = [...rows]
    .sort((left, right) => movementSortTime(left.created_at) - movementSortTime(right.created_at))
    .find(predicate);

  return row?.inventory_location_id ?? null;
}

function buildTransferSourceLocationByMovementId(
  movementRows: InventoryMovementRow[],
): Map<string, string> {
  const sourceLocationByMovementId = new Map<string, string>();
  const groupedTransfers = new Map<string, InventoryMovementRow[]>();

  movementRows
    .filter((row) => row.movement_type === "transfer" && row.order_line_id)
    .forEach((row) => {
      const key = [
        row.order_line_id,
        row.created_at,
        Math.abs(row.delta_qty),
      ].join("::");
      const rows = groupedTransfers.get(key) ?? [];
      rows.push(row);
      groupedTransfers.set(key, rows);
    });

  groupedTransfers.forEach((rows) => {
    const positive = rows.find((row) => row.delta_qty > 0);
    const negative = rows.find((row) => row.delta_qty < 0);
    if (!positive?.inventory_location_id || !negative?.inventory_location_id) {
      return;
    }

    sourceLocationByMovementId.set(positive.id, negative.inventory_location_id);
    sourceLocationByMovementId.set(negative.id, positive.inventory_location_id);
  });

  return sourceLocationByMovementId;
}

export function buildReceivedQtyByOrderLineId(
  movementRows: InventoryMovementRow[],
): Map<string, number> {
  const receivedQtyByOrderLineId = new Map<string, number>();

  movementRows.forEach((row) => {
    if (!row.order_line_id || row.delta_qty <= 0) {
      return;
    }
    if (row.movement_type !== "receipt" && row.movement_type !== "transfer") {
      return;
    }

    receivedQtyByOrderLineId.set(
      row.order_line_id,
      (receivedQtyByOrderLineId.get(row.order_line_id) ?? 0) + row.delta_qty,
    );
  });

  return receivedQtyByOrderLineId;
}

function mapMovementRowToReceiveEvent(input: {
  movementRow: InventoryMovementRow;
  line: OrderLine;
  sourceLocationByMovementId: Map<string, string>;
}): OrderReceiveEvent | null {
  const { movementRow, line, sourceLocationByMovementId } = input;

  if (movementRow.movement_type === "adjustment") {
    return null;
  }

  let eventType: OrderReceiveEvent["eventType"];
  if (movementRow.movement_type === "receipt") {
    eventType = "receive";
  } else if (movementRow.movement_type === "issue") {
    eventType = "use";
  } else {
    eventType = movementRow.delta_qty > 0 ? "move_in" : "move_out";
  }

  return {
    id: movementRow.id,
    orderId: line.orderId,
    orderLineId: line.id,
    procurementItemId: movementRow.procurement_item_id ?? line.procurementItemId,
    locationId: movementRow.inventory_location_id ?? "",
    deltaQty: movementRow.delta_qty,
    eventType,
    sourceLocationId: sourceLocationByMovementId.get(movementRow.id) ?? undefined,
    note: movementRow.notes ?? null,
    createdAt: movementRow.created_at,
  };
}

export function shapeOrdersWithDetails(input: ShapeOrdersInput): OrderWithLines[] {
  const procurementItemById = new Map(
    input.procurementItemRows.map((row) => [row.id, row]),
  );
  const receivedQtyByLineId = buildReceivedQtyByOrderLineId(input.movementRows);
  const sourceLocationByMovementId = buildTransferSourceLocationByMovementId(input.movementRows);

  const linesByOrderId = new Map<string, OrderLine[]>();
  input.lineRows.forEach((row) => {
    const procurementItem = row.procurement_item_id
      ? procurementItemById.get(row.procurement_item_id)
      : undefined;
    const lines = linesByOrderId.get(row.order_id) ?? [];
    lines.push({
      id: row.id,
      orderId: row.order_id,
      procurementItemId: row.procurement_item_id ?? "",
      qty: row.quantity,
      receivedQty: receivedQtyByLineId.get(row.id) ?? 0,
      unit: row.unit ?? procurementItem?.unit ?? "",
      plannedUnitPrice: procurementItem?.planned_unit_price_cents != null
        ? procurementItem.planned_unit_price_cents / 100
        : null,
      actualUnitPrice: row.unit_price_cents != null
        ? row.unit_price_cents / 100
        : null,
    });
    linesByOrderId.set(row.order_id, lines);
  });

  for (const lines of linesByOrderId.values()) {
    lines.sort((left, right) => left.id.localeCompare(right.id));
  }

  const orderIdByLineId = new Map(input.lineRows.map((row) => [row.id, row.order_id]));
  const shapedMovementRowsByOrderId = new Map<string, OrderReceiveEvent[]>();
  input.movementRows.forEach((row) => {
    const orderId = row.order_line_id ? orderIdByLineId.get(row.order_line_id) : undefined;
    if (!orderId || !row.order_line_id) {
      return;
    }

    const line = (linesByOrderId.get(orderId) ?? []).find((entry) => entry.id === row.order_line_id);
    if (!line) {
      return;
    }

    const event = mapMovementRowToReceiveEvent({
      movementRow: row,
      line,
      sourceLocationByMovementId,
    });
    if (!event) {
      return;
    }

    const events = shapedMovementRowsByOrderId.get(orderId) ?? [];
    events.push(event);
    shapedMovementRowsByOrderId.set(orderId, events);
  });

  return [...input.orderRows]
    .sort((left, right) => movementSortTime(right.updated_at) - movementSortTime(left.updated_at))
    .map((row) => {
      const lines = linesByOrderId.get(row.id) ?? [];
      const rawMovementRows = input.movementRows.filter((movementRow) => {
        if (!movementRow.order_line_id) {
          return false;
        }
        return orderIdByLineId.get(movementRow.order_line_id) === row.id;
      });

      return {
        id: row.id,
        projectId: row.project_id,
        status: mapOrderStatus(row.status),
        kind: rawMovementRows.some((movementRow) => movementRow.movement_type === "transfer")
          ? "stock"
          : "supplier",
        supplierName: row.supplier_name,
        deliverToLocationId: firstMovementLocationId(
          rawMovementRows,
          (movementRow) => movementRow.delta_qty > 0
            && (movementRow.movement_type === "receipt" || movementRow.movement_type === "transfer"),
        ),
        fromLocationId: firstMovementLocationId(
          rawMovementRows,
          (movementRow) => movementRow.movement_type === "transfer" && movementRow.delta_qty < 0,
        ),
        toLocationId: firstMovementLocationId(
          rawMovementRows,
          (movementRow) => movementRow.movement_type === "transfer" && movementRow.delta_qty > 0,
        ),
        dueDate: null,
        deliveryDeadline: row.delivery_due_at ?? null,
        invoiceAttachment: null,
        note: null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lines,
        receiveEvents: shapedMovementRowsByOrderId.get(row.id) ?? [],
      } satisfies OrderWithLines;
    });
}

async function loadSupabaseClient(): Promise<TypedSupabaseClient> {
  const { supabase } = await import("@/integrations/supabase/client");
  return supabase as unknown as TypedSupabaseClient;
}

async function loadShapedOrders(
  supabase: TypedSupabaseClient,
  options: {
    projectId?: string;
    orderId?: string;
    statuses?: OrderRow["status"][];
  },
): Promise<OrderWithLines[]> {
  let query = supabase
    .from("orders")
    .select("*");

  if (options.projectId) {
    query = query.eq("project_id", options.projectId);
  }

  if (options.orderId) {
    query = query.eq("id", options.orderId);
  }

  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }

  const { data: orderRows, error: ordersError } = await query.order("updated_at", { ascending: false });
  if (ordersError) {
    throw ordersError;
  }

  const rows = orderRows ?? [];
  if (rows.length === 0) {
    return [];
  }

  const orderIds = rows.map((row) => row.id);
  const { data: lineRows, error: linesError } = await supabase
    .from("order_lines")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  if (linesError) {
    throw linesError;
  }

  const lines = lineRows ?? [];
  const procurementItemIds = Array.from(new Set(
    lines
      .flatMap((row) => row.procurement_item_id ? [row.procurement_item_id] : []),
  ));

  let procurementItemRows: ProcurementItemRow[] = [];
  if (procurementItemIds.length > 0) {
    const { data, error } = await supabase
      .from("procurement_items")
      .select("*")
      .in("id", procurementItemIds);

    if (error) {
      throw error;
    }

    procurementItemRows = data ?? [];
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

  return shapeOrdersWithDetails({
    orderRows: rows,
    lineRows: lines,
    movementRows,
    procurementItemRows,
  });
}

function createSupabaseOrdersSource(
  supabase: TypedSupabaseClient,
): OrdersSource {
  return {
    mode: "supabase",
    async getProjectOrders(projectId: string) {
      return loadShapedOrders(supabase, { projectId });
    },

    async getOrderById(orderId: string) {
      const orders = await loadShapedOrders(supabase, { orderId });
      return orders[0] ?? null;
    },

    async getPlacedSupplierOrders(projectId: string) {
      const orders = await loadShapedOrders(supabase, {
        projectId,
        statuses: ["placed", "partially_received"],
      });

      return orders.filter((order) => order.kind === "supplier" && order.status === "placed");
    },

    async getPlacedSupplierOrdersAllProjects() {
      const orders = await loadShapedOrders(supabase, {
        statuses: ["placed", "partially_received"],
      });

      return orders.filter((order) => order.kind === "supplier" && order.status === "placed");
    },
  };
}

export async function getOrdersSource(
  mode?: WorkspaceMode,
): Promise<OrdersSource> {
  const resolvedMode = mode ?? await resolveWorkspaceMode();
  if (resolvedMode.kind !== "supabase") {
    return createBrowserOrdersSource(resolvedMode.kind);
  }

  const supabase = await loadSupabaseClient();
  return createSupabaseOrdersSource(supabase);
}
