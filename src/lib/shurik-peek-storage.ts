const KEY_PREFIX = "shurik-peeked:";
/** Far more than anyone has unread at once; keeps the entry from growing without end. */
const MAX_REMEMBERED = 200;

/** Ids of the messages whose first line this person has already been shown on this device. */
export function readPeekedShurikMessageIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function rememberPeekedShurikMessageIds(userId: string, ids: string[]): void {
  try {
    const all = [...readPeekedShurikMessageIds(userId), ...ids];
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(all.slice(-MAX_REMEMBERED)));
  } catch {
    // Storage is unavailable: the line may show again on the next visit, which is the lesser harm.
  }
}
