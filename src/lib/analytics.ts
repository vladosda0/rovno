export type AnalyticsEventName =
  | "estimate_editor_started"
  | "estimate_status_change_requested"
  | "estimate_status_change_succeeded"
  | "estimate_status_change_failed"
  | "estimate_work_created"
  | "estimate_work_updated"
  | "estimate_work_deleted"
  | "estimate_line_created"
  | "estimate_line_updated"
  | "estimate_line_deleted"
  | "estimate_version_submitted"
  | "estimate_version_approved"
  | "estimate_in_work_transition_requested"
  | "estimate_in_work_transition_succeeded"
  | "estimate_in_work_transition_failed"
  | "estimate_stage_created"
  | "project_stage_created"
  | "procurement_item_opened"
  | "procurement_item_updated"
  | "procurement_item_archived"
  | "procurement_item_relinked_to_estimate_line"
  | "procurement_item_used_from_stock"
  | "procurement_tab_changed"
  | "procurement_order_draft_created"
  | "procurement_order_placed"
  | "hr_item_status_changed"
  | "hr_item_assignees_changed"
  | "hr_payment_created"
  | "hr_filter_changed"
  | "pricing_page_viewed"
  | "billing_panel_compare_plans_clicked"
  | "billing_panel_upgrade_clicked"
  | "plans_dialog_plan_selected"
  | "billing_downgrade_scheduled"
  | "billing_downgrade_cleared"
  | "quota_gate_upgrade_clicked"
  | "tier_lock_cta_clicked"
  | "billing_plan_selected"
  | "billing_checkout_started"
  | "billing_init_payment_succeeded"
  | "billing_init_payment_failed"
  | "billing_payment_confirmed"
  | "billing_payment_failed"
  | "billing_auto_renew_toggled"
  | "billing_subscription_cancel_requested"
  | "promo_redeem_link_clicked"
  | "promo_redeem_page_viewed"
  | "promo_redeem_attempted"
  | "upgrade_prompt_shown"
  | "documents_page_opened"
  | "document_opened"
  | "document_uploaded"
  | "media_uploaded"
  | "ai_answer_saved_to_documents"
  | "ai_sidebar_opened"
  | "ai_prompt_submitted"
  | "ai_response_received"
  | "ai_proposal_generated"
  | "ai_proposal_revised"
  | "ai_proposal_applied"
  | "ai_proposal_rejected"
  | "ai_live_text_completed"
  // ─── New events added during Mixpanel → Yandex Metrika migration (2026-06).
  // Call sites for these will be wired in a follow-up step.
  | "estimate_created_empty"
  | "estimate_first_resource_added"
  | "estimate_constructor_opened"
  | "ai_photo_analyzed"
  | "custom_catalog_created"
  | "custom_estimate_template_created"
  // ─── Task status transitions (2026-06). One marker event per terminal
  // status the user moves a task into. Payload includes `from_status` for
  // funnel breakdown ("how often does in_progress → done vs in_progress → blocked").
  | "task_marked_in_progress"
  | "task_marked_done"
  | "task_marked_blocked";

export type AnalyticsEventPayload = Record<string, unknown>;

/**
 * Product analytics provider: Yandex Metrika.
 *
 * History: this module previously used Mixpanel (api-eu.mixpanel.com).
 * Migrated to Yandex Metrika in 2026-06 to comply with 152-ФЗ
 * (personal-data localization) — see project_analytics_migration memory.
 *
 * The public API (`trackEvent`, `setAnalyticsUserId`, `AnalyticsEventName`)
 * is preserved unchanged so call sites do not need to be touched.
 *
 * The counter ID comes from `VITE_METRIKA_COUNTER_ID` (see `METRIKA_COUNTER_ID`
 * below); the tag itself is bootstrapped by `initMetrika()`, called once from
 * `main.tsx`. Per-route SPA hits are emitted by `MetrikaPageviewTracker`.
 * When no counter is configured, everything in this module is an inert no-op.
 */

/**
 * Single source of truth for the Metrika counter ID, read once from the
 * per-environment env var (prod / staging / dev each get their own counter,
 * so non-prod traffic never lands in the production counter).
 *
 * `null` when the env var is empty or missing — in that case Metrika is fully
 * disabled: `initMetrika()` injects nothing and `trackEvent` / pageviews no-op.
 */
export const METRIKA_COUNTER_ID: number | null = (() => {
  const raw = import.meta.env.VITE_METRIKA_COUNTER_ID;
  if (raw === undefined || raw === null || `${raw}`.trim() === "") return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
})();

type YandexMetrikaFn = ((counterId: number, action: string, ...args: unknown[]) => void) & {
  a?: unknown[];
  l?: number;
};

declare global {
  interface Window {
    ym?: YandexMetrikaFn;
  }
}

const SESSION_ID =
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `session-${Date.now()}`;

let currentUserId: string | null = null;

export function setAnalyticsUserId(userId: string | null): void {
  currentUserId = userId;

  if (METRIKA_COUNTER_ID === null) return;

  if (typeof window === "undefined" || typeof window.ym !== "function") {
    // ym is queued by the Metrika snippet, so calls before tag.js loads
    // are normally buffered. Bail out only if the snippet itself is missing.
    return;
  }

  if (!userId) {
    // Metrika has no explicit "logout" call. Future events from this
    // browser will simply stop carrying a UserID until setAnalyticsUserId
    // is called again with a new value.
    return;
  }

  try {
    window.ym(METRIKA_COUNTER_ID, "setUserID", userId);
  } catch (error) {
    console.warn("[analytics] Metrika setUserID failed:", error);
  }
}

function getAnalyticsIdentity() {
  return {
    user_id: currentUserId ?? "anonymous",
    session_id: SESSION_ID,
  };
}

export function trackEvent(
  event: AnalyticsEventName,
  payload: AnalyticsEventPayload = {},
): void {
  const identity = getAnalyticsIdentity();
  const fullPayload = { ...identity, ...payload };

  if (import.meta.env.DEV) {
    console.info("[analytics]", event, fullPayload);
  }

  if (METRIKA_COUNTER_ID === null) return;

  if (typeof window === "undefined" || typeof window.ym !== "function") {
    return;
  }

  try {
    window.ym(METRIKA_COUNTER_ID, "reachGoal", event, fullPayload);
  } catch (error) {
    console.warn("[analytics] Metrika reachGoal failed:", error);
  }
}

/**
 * Bootstrap the Yandex Metrika tag. Call exactly once at app startup
 * (`main.tsx`), before the first render.
 *
 * The body is gated on the raw env var, which Vite statically replaces at
 * build time, so when no counter is configured esbuild dead-code-eliminates
 * this whole loader from the bundle — no `mc.yandex.ru` request, no init.
 *
 * Session replay is deliberately disabled below: it records PII and is gated
 * behind a separate consent + field-masking workstream (152-ФЗ). Only
 * clickmap / accurateTrackBounce / trackLinks remain on.
 */
export function initMetrika(): void {
  if (!import.meta.env.VITE_METRIKA_COUNTER_ID) return;
  if (METRIKA_COUNTER_ID === null) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const counterId = METRIKA_COUNTER_ID;
  const src = `https://mc.yandex.ru/metrika/tag.js?id=${counterId}`;

  // Don't bootstrap twice (HMR / an accidental second call).
  const existingScripts = document.getElementsByTagName("script");
  for (let i = 0; i < existingScripts.length; i++) {
    if (existingScripts[i].src === src) return;
  }

  // Define the ym() command queue exactly as the official snippet does, so
  // calls issued before tag.js finishes loading are buffered, not dropped.
  const w = window;
  const ym: YandexMetrikaFn = (w.ym =
    w.ym ||
    function (...args: unknown[]) {
      (w.ym!.a = w.ym!.a || []).push(args);
    });
  ym.l = Date.now();

  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  const firstScript = document.getElementsByTagName("script")[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
  } else {
    document.head.appendChild(script);
  }

  ym(counterId, "init", {
    webvisor: false,
    clickmap: true,
    accurateTrackBounce: true,
    trackLinks: true,
    referrer: document.referrer,
    url: location.href,
  });
}
