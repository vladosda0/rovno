// Per-tier feature limits mirrored from rovno-db
// (`supabase/functions/_shared/tier_limits.ts`).
//
// Drift protection: rovno-db/scripts/verify-tier-limits-sync.mjs compares this
// file against the backend copy on every CI run. Update both files together when
// changing limits.
//
// -1 = unlimited.

export interface TierLimits {
  readonly ai_chat_per_month: number;
  readonly ai_doc_per_month: number;
  readonly ai_photo_per_month: number;
  readonly estimates_total: number;
  readonly editors_per_project: number;
  readonly viewers_per_project: number;
  readonly can_create_organization: boolean;
  readonly can_create_business_card: boolean;
}

export const TIER_LIMITS: Readonly<Record<string, TierLimits>> = {
  free: {
    ai_chat_per_month: 50,
    ai_doc_per_month: 1,
    ai_photo_per_month: 1,
    estimates_total: 1,
    editors_per_project: 0,
    viewers_per_project: 0,
    can_create_organization: false,
    can_create_business_card: false,
  },
  master: {
    ai_chat_per_month: 500,
    ai_doc_per_month: 10,
    ai_photo_per_month: 15,
    estimates_total: -1,
    editors_per_project: 2,
    viewers_per_project: -1,
    can_create_organization: false,
    can_create_business_card: false,
  },
  brigade: {
    ai_chat_per_month: 2000,
    ai_doc_per_month: 50,
    ai_photo_per_month: 100,
    estimates_total: -1,
    editors_per_project: -1,
    viewers_per_project: -1,
    can_create_organization: true,
    can_create_business_card: true,
  },
};

export type TierCode = keyof typeof TIER_LIMITS;

export function isTierCode(value: unknown): value is TierCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(TIER_LIMITS, value);
}

export function getTierLimits(tierCode: string): TierLimits | null {
  if (!isTierCode(tierCode)) {
    return null;
  }
  return TIER_LIMITS[tierCode];
}
