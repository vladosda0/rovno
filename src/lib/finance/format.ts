// Pure percentage formatters shared by the finance blocks. Kept out of the
// component module (FinancePrimitives) so react-refresh only sees component
// exports there, and so Phases 3-5 can import these without pulling in JSX.

export function formatPct(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value)}%`;
}

/**
 * Signed variant for deltas, e.g. "+12%" / "-5%". The sign comes from the ROUNDED value
 * (signDisplay), so a 0.4% delta renders "0%", never a signed zero like "+0%".
 */
export function formatSignedPct(value: number | null, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: digits,
    signDisplay: "exceptZero",
  }).format(value);
  return `${formatted}%`;
}
