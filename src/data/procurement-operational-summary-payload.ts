/** Shared parse helpers for `get_procurement_operational_summary` JSON (no orders-source import). */

/** RPC row shape from `get_procurement_operational_summary` → `ordered_lines`. */
export type ProcurementOperationalRpcOrderedLine = {
  order_line_id: string;
  order_id: string;
  order_status: string;
  ordered_at: string | null;
  delivery_due_at: string | null;
  procurement_item_id: string | null;
  procurement_item_title: string | null;
  title: string;
  quantity: number;
  unit: string | null;
  created_at: string;
};

/** RPC row shape from `get_procurement_operational_summary` → `procurement_items`. */
export type ProcurementOperationalRpcProcurementItem = {
  procurement_item_id: string;
  estimate_resource_line_id: string | null;
  task_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  quantity: number;
  unit: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseRpcOrderedLine(value: unknown): ProcurementOperationalRpcOrderedLine | null {
  const row = asRecord(value);
  if (!row) return null;
  const orderLineId = row.order_line_id;
  const orderId = row.order_id;
  if (typeof orderLineId !== "string" || typeof orderId !== "string") {
    return null;
  }
  const qty = row.quantity;
  const quantity = typeof qty === "number" && Number.isFinite(qty) ? qty : Number(qty);
  if (!Number.isFinite(quantity)) {
    return null;
  }
  return {
    order_line_id: orderLineId,
    order_id: orderId,
    order_status: typeof row.order_status === "string" ? row.order_status : "",
    ordered_at: typeof row.ordered_at === "string" ? row.ordered_at : null,
    delivery_due_at: typeof row.delivery_due_at === "string" ? row.delivery_due_at : null,
    procurement_item_id: typeof row.procurement_item_id === "string" ? row.procurement_item_id : null,
    procurement_item_title: typeof row.procurement_item_title === "string"
      ? row.procurement_item_title
      : null,
    title: typeof row.title === "string" ? row.title : "",
    quantity,
    unit: typeof row.unit === "string" ? row.unit : null,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

function parseRpcProcurementItem(value: unknown): ProcurementOperationalRpcProcurementItem | null {
  const row = asRecord(value);
  if (!row) return null;
  const id = row.procurement_item_id;
  if (typeof id !== "string") {
    return null;
  }
  const qty = row.quantity;
  const quantity = typeof qty === "number" && Number.isFinite(qty) ? qty : Number(qty);
  if (!Number.isFinite(quantity)) {
    return null;
  }
  return {
    procurement_item_id: id,
    estimate_resource_line_id: typeof row.estimate_resource_line_id === "string"
      ? row.estimate_resource_line_id
      : null,
    task_id: typeof row.task_id === "string" ? row.task_id : null,
    title: typeof row.title === "string" ? row.title : "",
    description: typeof row.description === "string" ? row.description : null,
    category: typeof row.category === "string" ? row.category : null,
    quantity,
    unit: typeof row.unit === "string" ? row.unit : null,
    status: typeof row.status === "string" ? row.status : "",
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
  };
}

/**
 * Parse JSON from `get_procurement_operational_summary` for mappers and order-line merge.
 */
export function parseProcurementOperationalSummaryPayload(data: unknown): {
  orderedLines: ProcurementOperationalRpcOrderedLine[];
  procurementItems: ProcurementOperationalRpcProcurementItem[];
} | null {
  const root = asRecord(data);
  if (!root) return null;

  const orderedRaw = root.ordered_lines;
  const itemsRaw = root.procurement_items;
  const orderedLines = Array.isArray(orderedRaw)
    ? orderedRaw.map(parseRpcOrderedLine).filter((row): row is ProcurementOperationalRpcOrderedLine => Boolean(row))
    : [];
  const procurementItems = Array.isArray(itemsRaw)
    ? itemsRaw.map(parseRpcProcurementItem).filter((row): row is ProcurementOperationalRpcProcurementItem => Boolean(row))
    : [];

  return { orderedLines, procurementItems };
}
