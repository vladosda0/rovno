function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayFormatter(language: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "long" });
}

/** "13 октября" / "October 13". Empty string for a missing or malformed date. */
export function formatReportDay(value: string | null | undefined, language: string): string {
  const date = parse(value);
  return date ? dayFormatter(language).format(date) : "";
}

function withYear(date: Date, language: string, day?: string): string {
  const parts = new Intl.DateTimeFormat(language, { day: "numeric", month: "long", year: "numeric" })
    .formatToParts(date);
  // Drops what some locales print after the year ("г." in Russian).
  while (parts.length > 0 && parts[parts.length - 1].type === "literal") parts.pop();
  return parts.map((part) => (part.type === "day" && day ? day : part.value)).join("");
}

/**
 * "9–13 октября" inside one month, "25 сентября – 1 октября" across months,
 * a single day when both ends fall on the same date. The year is printed when
 * the ends are in different years or the period is not in the current year.
 */
export function formatReportPeriod(
  start: string | null | undefined,
  end: string | null | undefined,
  language: string,
  now: Date = new Date(),
): string {
  const from = parse(start);
  const to = parse(end);
  if (!from || !to) return formatReportDay(start ?? end, language);
  const formatter = dayFormatter(language);
  if (from.getFullYear() !== to.getFullYear()) {
    return `${withYear(from, language)} – ${withYear(to, language)}`;
  }
  const showYear = to.getFullYear() !== now.getFullYear();
  const sameMonth = from.getMonth() === to.getMonth();
  if (sameMonth && from.getDate() === to.getDate()) {
    return showYear ? withYear(to, language) : formatter.format(to);
  }
  if (sameMonth) {
    const days = `${from.getDate()}–${to.getDate()}`;
    if (showYear) return withYear(to, language, days);
    return formatter
      .formatToParts(to)
      .map((part) => (part.type === "day" ? days : part.value))
      .join("");
  }
  return `${formatter.format(from)} – ${showYear ? withYear(to, language) : formatter.format(to)}`;
}

/** Local calendar date as the value of an <input type="date">. */
export function toDateInputValue(value: string | null | undefined): string {
  const date = parse(value);
  if (!date) return "";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Start or end of the local day picked in an <input type="date">, as ISO. */
export function dateInputToIso(value: string, edge: "start" | "end"): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = edge === "start"
    ? new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
    : new Date(Number(year), Number(month) - 1, Number(day), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const CUSTOM_PERIOD_MAX_AGE_YEARS = 5;

export interface CustomReportPeriod {
  from: string;
  to: string;
}

/** A date input value that parses and is not more than five years back. */
export function isUsableReportDate(value: string, now: Date = new Date()): boolean {
  const iso = dateInputToIso(value, "start");
  if (!iso) return false;
  const oldest = new Date(now);
  oldest.setFullYear(oldest.getFullYear() - CUSTOM_PERIOD_MAX_AGE_YEARS);
  return Date.parse(iso) > oldest.getTime();
}

/**
 * The period typed into the two date inputs, or null when it cannot be asked
 * for: a date that does not parse, a start more than five years back, a start
 * after the end. An end later than today becomes today.
 */
export function resolveCustomReportPeriod(
  fromValue: string,
  toValue: string,
  now: Date = new Date(),
): CustomReportPeriod | null {
  const today = toDateInputValue(now.toISOString());
  const from = dateInputToIso(fromValue, "start");
  const to = dateInputToIso(toValue > today ? today : toValue, "end");
  if (!from || !to) return null;
  const oldest = new Date(now);
  oldest.setFullYear(oldest.getFullYear() - CUSTOM_PERIOD_MAX_AGE_YEARS);
  if (Date.parse(from) <= oldest.getTime()) return null;
  if (Date.parse(from) >= Math.min(Date.parse(to), now.getTime())) return null;
  return { from, to };
}
