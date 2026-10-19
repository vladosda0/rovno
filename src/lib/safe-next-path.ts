// The `?next=` return path of the auth pages, or null when it would leave this origin.
// Resolved the way the browser resolves it, so `//host`, `/\host` and a tab or newline
// hidden between the slashes are all judged by where they actually lead.
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith("/")) return null;
  try {
    const url = new URL(next, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Dot segments are resolved away, which can leave `//host` at the front.
    return path.startsWith("//") ? null : path;
  } catch {
    return null;
  }
}
