import type { Event, EventType } from "@/types/entities";

/**
 * Presentation-layer redaction for activity/event feeds.
 * Does not mutate stored `event.payload`; DB rows may still contain full text.
 */
export interface ActivityRedactionContext {
  /** When false, hide finance-heavy and supplier/money-heavy payload strings. */
  canViewFinanceDetail: boolean;
}

function isEstimateEventType(type: EventType): boolean {
  return (
    type.startsWith("estimate")
    || type === "estimate_created"
    || type === "estimate_approved"
    || type === "estimate_archived"
    || type === "estimate_deleted"
    || type === "estimate_paid_updated"
  );
}

function isProcurementEventType(type: EventType): boolean {
  return type.startsWith("procurement") || type === "procurement_created" || type === "procurement_updated" || type === "procurement_deleted";
}

function isLikelyMoneyOrSupplierPayload(payload: Record<string, unknown>): boolean {
  const keys = Object.keys(payload).map((k) => k.toLowerCase());
  if (keys.some((k) => k.includes("price") || k.includes("amount") || k.includes("total") || k.includes("cost") || k.includes("cents"))) {
    return true;
  }
  if (keys.some((k) => k.includes("supplier") || k.includes("vendor"))) {
    return true;
  }
  return false;
}

/**
 * Returns a safe one-line detail string for activity rows, or null to omit the detail line.
 */
export function getActivityDisplayDetail(
  event: Event,
  ctx: ActivityRedactionContext,
): string | null {
  const payload = event.payload as Record<string, unknown>;
  const raw = (payload.title ?? payload.caption ?? payload.name ?? payload.text ?? "") as string;
  const trimmed = typeof raw === "string" ? raw.trim() : "";

  if (!trimmed) {
    return null;
  }

  if (!ctx.canViewFinanceDetail) {
    if (isEstimateEventType(event.type) || isProcurementEventType(event.type)) {
      return null;
    }
    if (isLikelyMoneyOrSupplierPayload(payload)) {
      return null;
    }
  }

  return trimmed;
}

export function getActivityDisplayDetailForHome(
  event: Event,
  ctxByProjectId: Record<string, ActivityRedactionContext> | undefined,
  fallbackCtx: ActivityRedactionContext,
): string | null {
  const ctx = ctxByProjectId?.[event.project_id] ?? fallbackCtx;
  return getActivityDisplayDetail(event, ctx);
}
