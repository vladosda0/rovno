/** Matches hosted `ai-inference` JSON `llmProvider`. Only GigaChat: Qwen sends project data abroad (decision 2026-10-20). */
export type AiLlmProvider = "gigachat";

export const AI_LLM_PROVIDER: AiLlmProvider = "gigachat";

/** Where the removed model picker kept its choice; cleared so an old «qwen» does not linger. */
export const AI_SIDEBAR_CHAT_MODEL_STORAGE_KEY = "ai-sidebar-chat-model";

export function clearStoredAiLlmProvider(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AI_SIDEBAR_CHAT_MODEL_STORAGE_KEY);
}
