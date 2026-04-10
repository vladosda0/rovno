/**
 * Wave 1 live text assistant: uses `buildAIProjectContext` + thin client (mock until backend).
 * Set `VITE_AI_LIVE_TEXT_ASSISTANT=1` in env to enable.
 */
export function isLiveTextAssistantEnabled(): boolean {
  const v = import.meta.env.VITE_AI_LIVE_TEXT_ASSISTANT;
  return v === "1" || v === "true" || String(v).toLowerCase() === "yes";
}
