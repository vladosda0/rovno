import { describe, expect, it } from "vitest";
import { deviceLabelFromUserAgent, labelPasskeys, passkeyDisplayName, PASSKEY_NAMES } from "@/lib/passkey-names";

describe("passkeyDisplayName", () => {
  it("translates the names Auth gives by AAGUID", () => {
    expect(passkeyDisplayName("Apple Passwords")).toBe("Пароли Apple");
    expect(passkeyDisplayName("iCloud Keychain")).toBe("Пароли Apple");
    expect(passkeyDisplayName("iCloud Keychain (Managed)")).toBe("Пароли Apple");
    expect(passkeyDisplayName("Google Password Manager")).toBe("Менеджер паролей Google");
    expect(passkeyDisplayName("Microsoft Password Manager")).toBe("Менеджер паролей Microsoft");
    expect(passkeyDisplayName("Chrome on Mac")).toBe("Chrome на Mac");
    expect(passkeyDisplayName("Edge on Mac")).toBe("Edge на Mac");
    expect(passkeyDisplayName("Passkey")).toBe("Устройство");
  });

  it("keeps brand names, names set by the person and an empty name falls back", () => {
    for (const brand of ["Windows Hello", "Samsung Pass", "1Password", "Bitwarden", "Dashlane", "Proton Pass", "KeePassXC", "NordPass"]) {
      expect(passkeyDisplayName(brand)).toBe(brand);
    }
    expect(passkeyDisplayName("Рабочий ноутбук")).toBe("Рабочий ноутбук");
    expect(passkeyDisplayName(undefined)).toBe("Устройство");
    expect(passkeyDisplayName("  ")).toBe("Устройство");
  });

  it("is a flat object of strings, so the server can repeat it", () => {
    expect(Object.values(PASSKEY_NAMES).every((v) => typeof v === "string")).toBe(true);
  });
});

describe("labelPasskeys", () => {
  it("numbers two of the same store in the order they were set up", () => {
    const labels = labelPasskeys([
      { id: "b", friendly_name: "Google Password Manager", created_at: "2026-11-17T10:00:00Z" },
      { id: "a", friendly_name: "Google Password Manager", created_at: "2026-11-16T10:00:00Z" },
      { id: "c", friendly_name: "Apple Passwords", created_at: "2026-11-18T10:00:00Z" },
    ]);
    expect(labels).toEqual({ a: "Менеджер паролей Google", b: "Менеджер паролей Google 2", c: "Пароли Apple" });
  });
});

describe("deviceLabelFromUserAgent", () => {
  const cases: Array<[string, string]> = [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 YaBrowser/24.10.0.0 Safari/537.36", "Яндекс Браузер · Windows"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36", "Chrome · macOS"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15", "Safari · macOS"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0", "Edge · Windows"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1", "Chrome · iOS"],
    ["Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36", "Samsung Internet · Android"],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0", "Firefox · Linux"],
    ["something odd", "Браузер"],
  ];
  it.each(cases)("%s", (ua, label) => {
    expect(deviceLabelFromUserAgent(ua)).toBe(label);
  });
});
