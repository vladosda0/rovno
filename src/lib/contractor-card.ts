import type { PartyDetails } from "@/data/requisites-lookup-source";

/** The six card shades (rovno#282): stored key, display name, gradient, monogram text. */
export const CARD_SHADES = [
  { key: "graphite", from: "#1B1B18", to: "#4A4A40", fg: "#F4F2E4" },
  { key: "rovno_blue", from: "#1E5CCB", to: "#5B8BE0", fg: "#FFFFFF" },
  { key: "olive", from: "#4F5E32", to: "#8A9A5B", fg: "#F4F2E4" },
  { key: "brick", from: "#A9472A", to: "#D9825B", fg: "#FFFFFF" },
  { key: "emerald", from: "#16624F", to: "#3FA184", fg: "#FFFFFF" },
  { key: "sand", from: "#B8A57A", to: "#E6DBBE", fg: "#1B1B18" },
] as const;

export type CardShade = (typeof CARD_SHADES)[number];

export function cardShade(key: string | null | undefined): CardShade {
  return CARD_SHADES.find((shade) => shade.key === key) ?? CARD_SHADES[0];
}

export function shadeBackground(shade: CardShade): string {
  return `radial-gradient(130% 160% at 100% 0%, ${shade.to} 0%, ${shade.from} 60%)`;
}

const LEGAL_FORM = /^(ооо|оао|зао|пао|ао|ип)\s+/i;

/** Two letters for a card without a logo: «ООО «Ремонт-Плюс»» gives «РП». */
export function cardInitials(name: string): string {
  const words = name
    .replace(/[«»"'„“”]/g, "")
    .trim()
    .replace(LEGAL_FORM, "")
    .split(/[\s-]+/)
    .filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** Prepends https:// to a bare domain and returns the link, or null unless it is a web address. */
export function webLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.includes(".") ? url.href : null;
  } catch {
    return null;
  }
}

/** What a row shows for a link: the address without the scheme and trailing slash. */
export function linkLabel(value: string): string {
  return value.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

function phoneDigits(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  const international = (value ?? "").trim().startsWith("+");
  if (digits.length === 10 && !international) return `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8") && !international) return `7${digits.slice(1)}`;
  // «+7 » stands in the field already, and a person typed 8 after it.
  if (digits.length === 12 && digits.startsWith("78")) return `7${digits.slice(2)}`;
  return digits;
}

export function telLink(value: string | null | undefined): string | null {
  const digits = phoneDigits(value);
  return digits.length > 1 ? `tel:+${digits}` : null;
}

export function whatsappLink(value: string | null | undefined): string | null {
  const digits = phoneDigits(value);
  return digits.length > 1 ? `https://wa.me/${digits}` : null;
}

export function mailLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && /^[^\s@?&#]+@[^\s@?&#]+$/.test(trimmed) ? `mailto:${trimmed}` : null;
}

const TELEGRAM_HOST = /^(t\.me|telegram\.me)$/i;

/** Accepts @name, name, or a t.me link, including a private group invite t.me/+…. */
export function telegramLink(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/")) {
    const link = webLink(trimmed);
    return link && TELEGRAM_HOST.test(new URL(link).hostname) ? link : null;
  }
  const name = trimmed.replace(/^@/, "");
  return /^\w+$/.test(name) ? `https://t.me/${name}` : null;
}

/** Stored form: a t.me link as a link, anything else as @name. */
export function normalizeTelegram(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.includes("/") ? trimmed : `@${trimmed.replace(/^@/, "")}`;
}

/** What the form field holds: the «@» stands in front of the field by itself. */
export function telegramFieldValue(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/^@/, "");
}

export interface RequisiteLine {
  key: "legalName" | "inn" | "innKpp" | "ogrn" | "legalAddress" | "signatory";
  value: string;
}

/** The rows of the requisites block; only the INN when the registry gave nothing. */
export function requisiteLines(inn: string, details: PartyDetails | null): RequisiteLine[] {
  if (!details) return [{ key: "inn", value: inn.trim() }];
  const signatory = [details.signatoryPosition, details.signatoryName].filter(Boolean).join(" ");
  const lines: Array<RequisiteLine | null> = [
    details.legalName ? { key: "legalName", value: details.legalName } : null,
    details.kpp ? { key: "innKpp", value: `${details.inn} · ${details.kpp}` } : { key: "inn", value: details.inn },
    details.ogrn ? { key: "ogrn", value: details.ogrn } : null,
    details.legalAddress ? { key: "legalAddress", value: details.legalAddress } : null,
    signatory ? { key: "signatory", value: signatory } : null,
  ];
  return lines.filter((line): line is RequisiteLine => line !== null);
}
