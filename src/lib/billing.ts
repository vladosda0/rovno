// Shared billing helpers, feature flag, and row shapes for the T-Bank flow.
//
// The tbank tables (subscriptions, payment_intents) and RPCs are NOT in the
// generated Supabase Database type (src/integrations/supabase/types.ts), so
// consumers reach them through the untyped `rawSupabase` client and the row
// shapes declared here.

// Feature flag for the full T-Bank checkout flow. Default false (an unset env
// var is not the string "true"). Flip VITE_BILLING_ENABLED=true only after the
// live T-Bank terminal key is provisioned (post-moderation). While false: paid
// plans render a "soon" badge and /billing/* routes redirect to /pricing.
export const BILLING_ENABLED = import.meta.env.VITE_BILLING_ENABLED === "true";

const rubFormatter = new Intl.NumberFormat("ru-RU");

// 99000 kopecks -> "990 ₽"
export function formatRubFromKopecks(kopecks: number): string {
  return `${rubFormatter.format(Math.round(kopecks / 100))} ₽`;
}

// Plan tier ordering shared by the upgrade/downgrade UI. Higher rank = pricier
// tier. Mirrors the backend rank in tbank-init-payment / tbank_schedule_plan_change.
export const PLAN_RANK: Record<string, number> = { free: 0, master: 1, brigade: 2 };

export function planRank(code: string | null | undefined): number {
  return code ? (PLAN_RANK[code] ?? 0) : 0;
}

// UUID for the mandatory idempotency_key. Prefers WebCrypto; the fallback emits
// a UUID v4 *shape* so the backend's isUuid() check accepts it even in a
// non-secure context (file://, http-localhost). The fallback uses Math.random
// and is NOT cryptographically secure — only acceptable for dev where
// crypto.randomUUID is unavailable.
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Array<number>(16);
  for (let i = 0; i < 16; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0"));
  return (
    `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-` +
    `${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`
  );
}

export interface SubscriptionRow {
  readonly id: string;
  readonly profile_id: string;
  readonly provider: string;
  readonly plan_code: string;
  readonly status: string;
  readonly is_current: boolean;
  readonly currency: string;
  readonly amount_cents: number | null;
  readonly auto_renew: boolean;
  readonly current_period_starts_at: string | null;
  readonly current_period_ends_at: string | null;
  readonly canceled_at: string | null;
  readonly grace_until: string | null;
  readonly created_at: string;
  // Scheduled downgrade target applied at the next renewal (null when none).
  readonly pending_plan_code: string | null;
}

export interface PaymentIntentRow {
  readonly id: string;
  readonly profile_id: string;
  readonly plan_code: string;
  readonly amount_kopecks: number;
  readonly currency: string;
  readonly status: string;
  readonly error_code: string | null;
  readonly error_message: string | null;
  readonly confirmed_at: string | null;
  readonly created_at: string;
}

// Response of the tbank-init-payment Edge Function (phase 1b contract + C1).
export interface InitPaymentResponse {
  readonly intent_id: string;
  readonly payment_id: string;
  readonly status: string;
  readonly amount_kopecks: number;
  readonly plan_display_name: string;
  // T-Bank hosted payment page; used as the checkout fallback when the JS
  // widget can't mount. null on the idempotent-replay path.
  readonly payment_url: string | null;
}

export type SubscriptionStatus = "none" | "active" | "grace" | "expired";

const GRACE_DAYS = 7;

// Mirrors the design rule (§15.5): a current subscription stays usable until
// current_period_ends_at + 7 days; past that it is read-only (soft block).
export function deriveSubscriptionStatus(
  sub: Pick<SubscriptionRow, "current_period_ends_at"> | null,
  now: number = Date.now(),
): { status: SubscriptionStatus; readOnly: boolean } {
  if (!sub) {
    return { status: "none", readOnly: false };
  }
  const endsAt = sub.current_period_ends_at
    ? new Date(sub.current_period_ends_at).getTime()
    : null;
  if (endsAt === null || Number.isNaN(endsAt)) {
    return { status: "active", readOnly: false };
  }
  if (now < endsAt) {
    return { status: "active", readOnly: false };
  }
  const graceEnd = endsAt + GRACE_DAYS * 24 * 60 * 60 * 1000;
  if (now < graceEnd) {
    return { status: "grace", readOnly: false };
  }
  return { status: "expired", readOnly: true };
}
