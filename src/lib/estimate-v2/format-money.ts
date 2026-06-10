// Money formatters for the estimate-v2 UI.
//
// `formatMoney` mirrors the legacy local `money()` helper (full amount with kopecks,
// e.g. "5 672 359,26 ₽") and is used wherever exact figures matter (the "Подробнее"
// breakdown, CSV export). `formatCompactMoney` produces a dense form (e.g. "4,65 млн ₽")
// for KPI strips where the grand totals would otherwise be hard to scan.

const fullFormatters = new Map<string, Intl.NumberFormat>();
const compactFormatters = new Map<string, Intl.NumberFormat>();

function fullFormatter(currency: string): Intl.NumberFormat {
  let formatter = fullFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    fullFormatters.set(currency, formatter);
  }
  return formatter;
}

function compactFormatter(currency: string): Intl.NumberFormat {
  let formatter = compactFormatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 2,
    });
    compactFormatters.set(currency, formatter);
  }
  return formatter;
}

/** Full amount with kopecks, e.g. "5 672 359,26 ₽". */
export function formatMoney(cents: number, currency: string): string {
  return fullFormatter(currency).format(cents / 100);
}

/** Compact amount for dense KPI strips, e.g. "4,65 млн ₽". */
export function formatCompactMoney(cents: number, currency: string): string {
  return compactFormatter(currency).format(cents / 100);
}
