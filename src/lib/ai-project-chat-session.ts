const STORAGE_PREFIX = "rovno:ai-chat:";

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

/**
 * Stable per-project chat id for hosted ai-inference Layer B continuity.
 * Scoped to sessionStorage (tab session); survives refresh, not cross-browser.
 */
export function getOrCreateProjectChatSessionId(projectId: string): string | undefined {
  if (typeof window === "undefined" || !projectId.trim()) return undefined;
  try {
    const key = storageKey(projectId);
    const existing = window.sessionStorage.getItem(key);
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
      return existing;
    }
    const id = crypto.randomUUID();
    window.sessionStorage.setItem(key, id);
    return id;
  } catch {
    return undefined;
  }
}
