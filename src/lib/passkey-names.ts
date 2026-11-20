/**
 * How a device for «Вход по лицу или отпечатку» is named on screen (epic external-login,
 * slice 5; agent decision 2026-11-16, item 2). Auth sets `friendly_name` from the AAGUID in
 * English, or `Passkey` when the store is unknown. Known stores are translated here; anything
 * else, including a name the person typed, is shown as is.
 *
 * Kept a flat object on purpose: the server repeats the same table for the letters.
 */
export const PASSKEY_NAMES: Record<string, string> = {
  "Apple Passwords": "Пароли Apple",
  "iCloud Keychain": "Пароли Apple",
  "iCloud Keychain (Managed)": "Пароли Apple",
  "Google Password Manager": "Менеджер паролей Google",
  "Microsoft Password Manager": "Менеджер паролей Microsoft",
  "Chrome on Mac": "Chrome на Mac",
  "Edge on Mac": "Edge на Mac",
  "Windows Hello": "Windows Hello",
  "Samsung Pass": "Samsung Pass",
  "1Password": "1Password",
  Bitwarden: "Bitwarden",
  Dashlane: "Dashlane",
  "Proton Pass": "Proton Pass",
  KeePassXC: "KeePassXC",
  NordPass: "NordPass",
  Passkey: "Устройство",
};

/** The fallback name when Auth gave none and the rename right after setup did not go through. */
export const PASSKEY_FALLBACK_NAME = PASSKEY_NAMES.Passkey;

/** The name Auth gives a passkey from an unknown store; it is replaced right after setup. */
export const AUTH_DEFAULT_PASSKEY_NAME = "Passkey";

export function passkeyDisplayName(friendlyName: string | null | undefined): string {
  const raw = (friendlyName ?? "").trim();
  if (!raw) return PASSKEY_FALLBACK_NAME;
  return Object.prototype.hasOwnProperty.call(PASSKEY_NAMES, raw) ? PASSKEY_NAMES[raw] : raw;
}

interface NamedPasskey {
  id: string;
  friendly_name?: string | null;
  created_at: string;
}

/** Display names by passkey id; two of the same name are numbered in the order they were set up. */
export function labelPasskeys(passkeys: NamedPasskey[]): Record<string, string> {
  const ordered = [...passkeys].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const seen = new Map<string, number>();
  const labels: Record<string, string> = {};
  for (const passkey of ordered) {
    const name = passkeyDisplayName(passkey.friendly_name);
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    labels[passkey.id] = count === 1 ? name : `${name} ${count}`;
  }
  return labels;
}

/** «Браузер · система» for a store Auth does not know, e.g. «Яндекс Браузер · Windows». */
export function deviceLabelFromUserAgent(ua: string): string {
  let browser = "Браузер";
  // Order matters: Chromium-based browsers also say «Chrome», iOS browsers also say «Safari».
  if (/YaBrowser\//.test(ua)) browser = "Яндекс Браузер";
  else if (/Edg(iOS|A)?\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/SamsungBrowser\//.test(ua)) browser = "Samsung Internet";
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = "Firefox";
  else if (/CriOS\/|Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";

  let os = "";
  if (/iPad/.test(ua)) os = "iPadOS";
  else if (/iPhone|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Linux/.test(ua)) os = "Linux";

  return os ? `${browser} · ${os}` : browser;
}
