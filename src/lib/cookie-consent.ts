// Cookie consent: what the visitor chose about analytics cookies (rovno#333).
//
// Stored in localStorage, not in a cookie and not in the account: the choice
// belongs to this browser, and a missing record means "has not chosen yet".
// Until then the banner is shown and Yandex Metrika runs as it always did
// (Vlad's decision 11.11, variant B); only an explicit `analytics: false`
// keeps the tag from loading (see bootstrapMetrika in ./analytics).
//
// Every read and write is guarded: the accessor throws in Safari private mode
// and with site data blocked, and this runs on every first paint.

export const COOKIE_CONSENT_STORAGE_KEY = "rovno.cookieConsent.v1";
const CONSENT_VERSION = 1;

export interface CookieConsent {
  analytics: boolean;
  at: string;
  v: typeof CONSENT_VERSION;
}

function parse(raw: string | null): CookieConsent | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Partial<CookieConsent>;
    if (record.v !== CONSENT_VERSION) return null;
    if (typeof record.analytics !== "boolean") return null;
    return { analytics: record.analytics, at: typeof record.at === "string" ? record.at : "", v: CONSENT_VERSION };
  } catch {
    return null;
  }
}

/** The stored choice, or null when the visitor has not chosen (or the record is unreadable). */
export function readCookieConsent(): CookieConsent | null {
  try {
    return parse(localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Only an explicit "no" turns analytics off; no record keeps today's behaviour. */
export function analyticsDeclined(): boolean {
  return sessionDeclined || readCookieConsent()?.analytics === false;
}

const listeners = new Set<() => void>();
// Bumped on every write, so subscribers re-render even when storage refused it
// and the stored record reads the same as before.
let revision = 0;

function notify(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

/** Writes the choice. Returns whether it was persisted. */
export function writeCookieConsent(analytics: boolean): boolean {
  const record: CookieConsent = { analytics, at: new Date().toISOString(), v: CONSENT_VERSION };
  let saved = false;
  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
    saved = true;
  } catch {
    // Worst case the banner comes back next visit; still better than throwing.
  }
  // Notify even when storage refused: the banner the visitor just answered
  // must still go away for this page.
  sessionAnswered = true;
  sessionDeclined = !analytics;
  notify();
  return saved;
}

// Remember an answer for the life of this page when storage is unavailable.
let sessionAnswered = false;
let sessionDeclined = false;

/** Whether the banner still has to ask: no stored choice and no answer on this page. */
export function cookieConsentPending(): boolean {
  return !sessionAnswered && readCookieConsent() === null;
}

export function subscribeCookieConsent(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== COOKIE_CONSENT_STORAGE_KEY) return;
    // Another tab answered: its stored record replaces this page's in-memory one.
    const stored = readCookieConsent();
    if (stored) sessionDeclined = !stored.analytics;
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** A number that changes on every write: the useSyncExternalStore snapshot. */
export function getCookieConsentRevision(): number {
  return revision;
}

/** Event the footer and the privacy page dispatch to open the settings dialog. */
export const OPEN_COOKIE_SETTINGS_EVENT = "rovno:open-cookie-settings";

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}

/** Test hook: forget the in-memory answer. */
export function resetCookieConsentForTests(): void {
  sessionAnswered = false;
  sessionDeclined = false;
}
