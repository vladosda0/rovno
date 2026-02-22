// Procurement normalization + matching key + status computation

import type { ProcurementItemV2, ProcurementStatus } from "@/types/entities";

/** Lowercase, trim, collapse spaces, strip punctuation except x, ×, . */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-zа-яё0-9\s.x×-]/gi, "");
}

/** Deterministic dedup key */
export function matchingKey(
  name: string,
  spec: string | null | undefined,
  unit: string,
  stageId: string | null | undefined,
): string {
  return [
    normalizeName(name),
    spec ? normalizeName(spec) : "",
    unit.toLowerCase().trim(),
    stageId ?? "",
  ].join("|");
}

/** Derive status from quantity fields */
export function computeStatus(item: ProcurementItemV2): ProcurementStatus {
  const remaining = Math.max(item.requiredQty - item.receivedQty, 0);
  if (remaining <= 0) return "in_stock";
  if (item.orderedQty > item.receivedQty) return "ordered";
  return "to_buy";
}

/** Remaining quantity */
export function remainingQty(item: ProcurementItemV2): number {
  return Math.max(item.requiredQty - item.receivedQty, 0);
}

/** Human-readable status label */
export function statusLabel(status: ProcurementStatus): string {
  switch (status) {
    case "to_buy": return "To buy";
    case "ordered": return "Ordered";
    case "in_stock": return "In stock";
  }
}

/** Format currency (RUB) */
export function fmtCost(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("ru-RU") + " ₽";
}
