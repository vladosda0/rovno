const AI_SIDEBAR_SESSION_PREFERENCE_KEY = "workspace-ai-sidebar-collapsed";

export function readAiSidebarSessionPreference(): boolean | null {
  try {
    const rawValue = sessionStorage.getItem(AI_SIDEBAR_SESSION_PREFERENCE_KEY);
    if (rawValue === "true") return true;
    if (rawValue === "false") return false;
    return null;
  } catch {
    return null;
  }
}

export function writeAiSidebarSessionPreference(collapsed: boolean): void {
  try {
    sessionStorage.setItem(AI_SIDEBAR_SESSION_PREFERENCE_KEY, String(collapsed));
  } catch {
    // Ignore storage write failures and keep runtime state.
  }
}

export function clearAiSidebarSessionPreference(): void {
  try {
    sessionStorage.removeItem(AI_SIDEBAR_SESSION_PREFERENCE_KEY);
  } catch {
    // Ignore storage clear failures and keep runtime state.
  }
}
