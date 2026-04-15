/**
 * Wave 8 live text assistant routing (hosted `ai-inference`):
 * - `shouldUseHostedLiveTextAssistantPath(workspaceKind, projectId)` — true for **Supabase + UUID project** by default.
 * - **Kill switch:** set `VITE_AI_LIVE_TEXT_ASSISTANT` to `0`, `false`, `no`, or `off` to force the legacy heuristic path (rollback).
 *
 * `AISidebar` must call `shouldUseHostedLiveTextAssistantPath` with **workspace kind and project id** (not zero-arg).
 */
export {
  shouldUseHostedLiveTextAssistantPath,
  isLiveTextHostedKillSwitchEnabled,
} from "@/lib/ai-assistant-client";
