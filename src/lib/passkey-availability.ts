/**
 * Whether Auth offers «Вход по лицу или отпечатку» at all (epic external-login, slice 5).
 * `dev` goes to `main` whole (EPICS.md 4, item 3), and on prod the passkey sign-in is switched
 * on by Auth's variables only at its own release. Until Auth answers `passkeys_enabled: true`
 * in `GET /auth/v1/settings`, the button, the quiet request, the section in «Безопасность» and
 * «Входите быстрее» stay hidden and nothing is asked from `/passkeys/*`.
 *
 * One request per tab: the promise lives in this module. An error, a timeout or anything but
 * a literal `true` counts as off.
 */
const TIMEOUT_MS = 5000;

let cached: Promise<boolean> | null = null;

async function readFlag(): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || typeof fetch !== "function") return false;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${String(url).replace(/\/+$/, "")}/auth/v1/settings`, {
      headers: { apikey: String(key) },
      signal: controller?.signal,
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.passkeys_enabled === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function passkeysEnabledOnServer(): Promise<boolean> {
  cached ??= readFlag();
  return cached;
}

/** Tests only. */
export function __resetPasskeyAvailabilityForTests(): void {
  cached = null;
}
