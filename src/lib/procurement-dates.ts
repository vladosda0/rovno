import { getActiveLanguage } from "@/i18n";

// Parse a stored required-by date. A bare YYYY-MM-DD (what the picker writes) must be read as a
// LOCAL date so write and read agree in every timezone; a full ISO timestamp (estimate-synced
// dates) keeps its instant semantics.
export function parseProcurementDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}

export function formatProcurementDate(value: string | null | undefined, dash: string): string {
  if (!value) return dash;
  const parsed = parseProcurementDate(value);
  if (Number.isNaN(parsed.getTime())) return dash;
  return parsed.toLocaleDateString(getActiveLanguage() === "ru" ? "ru-RU" : "en-US");
}
