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
  | "billing_panel_purchase_credits_clicked"
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
  | "ai_live_text_completed";

export type AnalyticsEventPayload = Record<string, unknown>;

import mixpanel from 'mixpanel-browser';

const SESSION_ID = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}`;

const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN;

let mixpanelInitialized = false;

function initMixpanel() {
  if (mixpanelInitialized || !MIXPANEL_TOKEN || typeof window === 'undefined') return;
  try {
    mixpanel.init(MIXPANEL_TOKEN, {
      debug: import.meta.env.DEV,
      api_host: "https://api-eu.mixpanel.com",
      persistence: "localStorage",
      ignore_dnt: true,
      autocapture: false,
      record_sessions_percent: 0,
    });
    mixpanel.opt_in_tracking();
    mixpanelInitialized = true;
    if (currentUserId) {
      try {
        mixpanel.identify(currentUserId);
      } catch (error) {
        console.warn('[analytics] Mixpanel identify failed:', error);
      }
    }
  } catch (error) {
    console.warn('[analytics] Mixpanel init failed:', error);
  }
}

let currentUserId: string | null = null;

export function setAnalyticsUserId(userId: string | null) {
  currentUserId = userId;
  if (mixpanelInitialized) {
    if (userId) {
      try {
        mixpanel.identify(userId);
      } catch (error) {
        console.warn('[analytics] Mixpanel identify failed:', error);
      }
    } else {
      try {
        mixpanel.reset();
      } catch (error) {
        console.warn('[analytics] Mixpanel reset failed:', error);
      }
    }
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

  if (!mixpanelInitialized) initMixpanel();
  if (mixpanelInitialized) {
    try {
      mixpanel.track(event, fullPayload);
    } catch (error) {
      console.warn('[analytics] Mixpanel track failed:', error);
    }
  }
}
