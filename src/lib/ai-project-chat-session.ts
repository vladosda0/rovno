const STORAGE_PREFIX = "rovno:ai-chat:";

const CHAT_SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function storageKey(projectId: string): string {
  return `${STORAGE_PREFIX}${projectId}`;
}

function migrateSessionToLocal(projectId: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(projectId);
    if (window.localStorage.getItem(key)) return;
    const legacy = window.sessionStorage.getItem(key);
    if (legacy && CHAT_SESSION_UUID_RE.test(legacy)) {
      window.localStorage.setItem(key, legacy);
      window.sessionStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Stable per-project chat id for hosted ai-inference Layer B continuity.
 * Stored in localStorage so the same project reuses one session across tabs and refresh.
 */
export function getOrCreateProjectChatSessionId(projectId: string): string | undefined {
  if (typeof window === "undefined" || !projectId.trim()) return undefined;
  try {
    migrateSessionToLocal(projectId);
    const key = storageKey(projectId);
    const existing = window.localStorage.getItem(key);
    if (existing && CHAT_SESSION_UUID_RE.test(existing)) {
      return existing;
    }
    const id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return undefined;
  }
}

/** Start a new server-side session: new UUID, same project (call after archiving the prior thread). */
export function rotateProjectChatSessionId(projectId: string): string | undefined {
  if (typeof window === "undefined" || !projectId.trim()) return undefined;
  try {
    migrateSessionToLocal(projectId);
    const key = storageKey(projectId);
    const id = crypto.randomUUID();
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    return undefined;
  }
}
