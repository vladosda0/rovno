interface GanttRowProps {
  kind: "stage" | "work";
  title: string;
  subtitle?: string;
  height: number;
}

export function GanttRow({ kind, title, subtitle, height }: GanttRowProps) {
  if (kind === "stage") {
    return (
      <div
        className="border-b border-border bg-muted/40 px-3 py-2"
        style={{ height }}
      >
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
      </div>
    );
  }

  return (
    <div
      className="border-b border-border px-3 py-2"
      style={{ height }}
    >
      <p className="truncate text-sm text-foreground">{title}</p>
      {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
