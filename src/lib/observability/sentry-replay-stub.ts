/**
 * Inert replacement for Sentry integrations we deliberately exclude from the
 * observability v1 bundle, wired via `resolve.alias` in vite.config.ts:
 *
 *   - @sentry/replay + @sentry/replay-canvas — Session Replay (rrweb). A hard
 *     non-goal (152-ФЗ: records raw PII from estimate texts). ~150KB gz.
 *   - @sentry/feedback — Sentry's own feedback widget (modal + screenshot
 *     DOM). We ship our own FeedbackWidget, so this is dead weight. It is
 *     retained by tree-shaking only because @sentry/browser's feedbackSync.js
 *     CALLS buildFeedbackIntegration at module load (a side effect), so it
 *     must be stubbed, not just left unused.
 *
 * @sentry/browser re-exports all of these from its index, dragging them into
 * the lazy Sentry chunk even though our init path never references them. The
 * stub keeps every re-exported/consumed name present (so the ESM bindings
 * resolve) while carrying no recorder / widget code.
 *
 * Safe because nothing in our init path invokes these integrations. If a
 * future change adds replay or Sentry's feedback, remove the corresponding
 * alias rather than shipping a no-op.
 */

function noopIntegration(name: string) {
  return { name, setupOnce() {} };
}

// --- @sentry/replay + @sentry/replay-canvas ---
export const replayIntegration = () => noopIntegration("Replay");
export const replayCanvasIntegration = () => noopIntegration("ReplayCanvas");
export const getReplay = () => undefined;

// --- @sentry/feedback ---
// buildFeedbackIntegration returns the integration FACTORY (called at module
// load by feedbackSync.js), so it must return a function.
export const buildFeedbackIntegration = () => () => noopIntegration("Feedback");
export const feedbackModalIntegration = () => noopIntegration("FeedbackModal");
export const feedbackScreenshotIntegration = () => noopIntegration("FeedbackScreenshot");
export const getFeedback = () => undefined;
export const sendFeedback = () => Promise.resolve();
