function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** The time for today, a word for yesterday, day and month for anything older. */
export function formatShurikMessageTime(
  createdAt: string,
  now: Date,
  language: string,
  yesterdayLabel: string,
): string {
  const written = new Date(createdAt);
  if (Number.isNaN(written.getTime())) return "";

  const daysAgo = Math.round((startOfDay(now) - startOfDay(written)) / 86_400_000);
  if (daysAgo <= 0) {
    return new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(written);
  }
  if (daysAgo === 1) return yesterdayLabel;
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "short" }).format(written);
}
