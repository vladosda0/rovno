// A guest pressed «Следить за изменениями» on /baza/<slug>/ (docs-library 8.5,
// frame 5a): the slug waits here through sign-up and is followed once the person
// is signed in (KbPendingWatch). Local storage, not session: the confirmation
// link may open in another tab. Kept free of the Supabase client so the app
// shell can read it without loading the knowledge base.

export const KB_PENDING_WATCH_KEY = "rovno.kbPendingWatch.v1";

/** A request older than this is dropped: whoever pressed the button has moved on. */
export const KB_PENDING_WATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function rememberKbPendingWatch(slug: string, now: number = Date.now()): void {
  try {
    localStorage.setItem(KB_PENDING_WATCH_KEY, JSON.stringify({ slug, at: now }));
  } catch {
    // No storage: the person presses the button again after signing in.
  }
}

function readPending(): { slug: string; at: number } | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KB_PENDING_WATCH_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const entry = parsed as { slug?: unknown; at?: unknown } | null;
    if (entry && typeof entry.slug === "string" && typeof entry.at === "number") return { slug: entry.slug, at: entry.at };
  } catch {
    // The plain-string format from before: treated as expired.
  }
  return { slug: "", at: Number.NEGATIVE_INFINITY };
}

/** The waiting slug, or null; an expired or unreadable entry is removed. */
export function peekKbPendingWatch(now: number = Date.now()): string | null {
  const entry = readPending();
  if (!entry) return null;
  if (!entry.slug || now - entry.at > KB_PENDING_WATCH_MAX_AGE_MS || entry.at > now) {
    try {
      localStorage.removeItem(KB_PENDING_WATCH_KEY);
    } catch {
      // Nothing to remove.
    }
    return null;
  }
  return entry.slug;
}

export function clearKbPendingWatch(slug: string): void {
  if (readPending()?.slug !== slug) return;
  try {
    localStorage.removeItem(KB_PENDING_WATCH_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** The server will never accept this slug (no such document, a malformed slug): stop retrying it. */
export function isPermanentKbWatchRefusal(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === "P0002" || code === "22023";
}

/** The query key of «does this person follow this document». */
export function kbWatchingKey(slug: string, profileId: string | null) {
  return ["kb", "watching", slug, profileId ?? "none"] as const;
}
