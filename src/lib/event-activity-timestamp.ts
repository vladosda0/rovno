import type { Event } from "@/types/entities";

export const PAYLOAD_TIMESTAMP_KEYS = [
  "activityAt",
  "activity_at",
  "occurredAt",
  "occurred_at",
  "effectiveAt",
  "effective_at",
  "changedAt",
  "changed_at",
] as const;

function parseTimestampMs(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/**
 * Prefer a semantic ISO timestamp from the activity payload (when present), else `fallbackIso`
 * (typically `activity_events.created_at`).
 */
export function resolvePayloadPreferredIsoTimestamp(
  payload: Record<string, unknown> | undefined,
  fallbackIso: string,
): string {
  if (payload) {
    for (const k of PAYLOAD_TIMESTAMP_KEYS) {
      const v = payload[k];
      if (typeof v === "string" && v.trim()) {
        const ms = Date.parse(v);
        if (!Number.isNaN(ms)) {
          return v;
        }
      }
    }
  }
  return fallbackIso;
}

/**
 * Prefer a semantic activity time from the event payload (when present), then fall back to
 * `event.timestamp`. Used for feed sorting, day grouping, and display so rows stay aligned with
 * their calendar day when `activity_events.created_at` lags the real change time.
 */
export function getEventGroupTimestampMs(event: Event): number {
  const raw = event.payload;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return parseTimestampMs(resolvePayloadPreferredIsoTimestamp(raw as Record<string, unknown>, event.timestamp));
  }
  return parseTimestampMs(event.timestamp);
}
