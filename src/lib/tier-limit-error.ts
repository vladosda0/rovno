// Parses the P0001 "tier_limit" errors raised by the backend triggers
// (enforce_estimate_count_limit, enforce_project_member_limits,
// enforce_org_brigade_only, enforce_contractor_profile_brigade_only) and maps
// them to the quota.paywall.* i18n copy so the UI can show a graceful paywall
// instead of a raw database error.

import { toast } from "@/hooks/use-toast";

export type TierLimitType =
  | "estimates_total"
  | "editors_per_project"
  | "viewers_per_project"
  | "can_create_organization"
  | "can_create_business_card";

export interface TierLimitInfo {
  limit_type: TierLimitType;
  plan_code?: string;
  limit?: number;
  current?: number;
  requested?: number;
  required?: string;
}

// The exception message string each trigger raises, mapped to its limit type.
// Used as a fallback when a wrapping layer strips the PostgrestError `hint`.
const MESSAGE_TO_LIMIT_TYPE: Record<string, TierLimitType> = {
  estimate_limit_exceeded: "estimates_total",
  project_editor_limit_exceeded: "editors_per_project",
  project_viewer_limit_exceeded: "viewers_per_project",
  organization_requires_brigade: "can_create_organization",
  business_card_requires_brigade: "can_create_business_card",
};

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseTierLimitError(error: unknown): TierLimitInfo | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { message?: unknown; hint?: unknown; details?: unknown };

  // Preferred: the JSON hint emitted by the triggers (reason === 'tier_limit').
  const hint = asText(e.hint);
  if (hint) {
    try {
      const parsed = JSON.parse(hint) as Record<string, unknown>;
      if (
        parsed &&
        parsed.reason === "tier_limit" &&
        typeof parsed.limit_type === "string"
      ) {
        return parsed as unknown as TierLimitInfo;
      }
    } catch {
      // hint was not JSON; fall through to message matching.
    }
  }

  // Fallback: match the exception message string, which survives even when the
  // structured hint is dropped by a wrapping layer.
  const haystack = `${asText(e.message)} ${asText(e.details)}`;
  for (const [needle, limitType] of Object.entries(MESSAGE_TO_LIMIT_TYPE)) {
    if (haystack.includes(needle)) {
      return { limit_type: limitType };
    }
  }
  return null;
}

export function tierLimitPaywallKey(
  limitType: TierLimitType,
): "estimates" | "editors" | "organization" {
  switch (limitType) {
    case "estimates_total":
      return "estimates";
    case "editors_per_project":
    case "viewers_per_project":
      return "editors";
    case "can_create_organization":
    case "can_create_business_card":
      return "organization";
  }
}

type Translate = (key: string) => string;

/**
 * If `error` is a backend tier-limit error, shows the matching paywall toast and
 * returns true (caller should skip its generic error handling). Otherwise returns
 * false so the caller can fall back to its default error message.
 */
export function showTierLimitPaywall(error: unknown, t: Translate): boolean {
  const info = parseTierLimitError(error);
  if (!info) return false;
  const key = tierLimitPaywallKey(info.limit_type);
  toast({
    title: t(`quota.paywall.${key}.title`),
    description: t(`quota.paywall.${key}.body`),
  });
  return true;
}

/** Show the paywall toast for a known limit type (proactive gate, no error). */
export function showTierLimitPaywallByType(
  limitType: TierLimitType,
  t: Translate,
): void {
  const key = tierLimitPaywallKey(limitType);
  toast({
    title: t(`quota.paywall.${key}.title`),
    description: t(`quota.paywall.${key}.body`),
  });
}
