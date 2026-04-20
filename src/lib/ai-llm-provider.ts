/** Matches hosted `ai-inference` JSON `llmProvider` (GigaChat vs Alibaba DashScope Qwen). */
export type AiLlmProvider = "gigachat" | "qwen";

export const AI_SIDEBAR_CHAT_MODEL_STORAGE_KEY = "ai-sidebar-chat-model";

export function readStoredAiLlmProvider(): AiLlmProvider {
  if (typeof window === "undefined") return "gigachat";
  const raw = window.localStorage.getItem(AI_SIDEBAR_CHAT_MODEL_STORAGE_KEY);
  return raw === "qwen" ? "qwen" : "gigachat";
}

export function writeStoredAiLlmProvider(next: AiLlmProvider): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AI_SIDEBAR_CHAT_MODEL_STORAGE_KEY, next);
}
