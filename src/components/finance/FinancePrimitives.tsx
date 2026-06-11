import { cn } from "@/lib/utils";

// Shared building blocks for the finance blocks (estimate header, procurement header,
// dashboard widget, portfolio page). Single visual system: one font, three sizes
// (value ~20-22px/500, label 13px, sub 11px), three colors (foreground, muted, destructive).

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

export function KpiCard({
  label,
  value,
  valueClassName,
  sub,
  subClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string | null;
  subClassName?: string;
}) {
  return (
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={cn("text-xl font-medium tabular-nums text-foreground", valueClassName)}>{value}</p>
      {sub ? <p className={cn("text-[11px] text-muted-foreground", subClassName)}>{sub}</p> : null}
    </div>
  );
}

export function DetailRow({
  label,
  value,
  emphasized,
  valueClassName,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  valueClassName?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-[13px]",
        emphasized && "bg-muted/30",
      )}
    >
      <span className={emphasized ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
      <span
        className={cn(
          "tabular-nums text-foreground",
          emphasized ? "font-semibold" : "font-medium",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}
