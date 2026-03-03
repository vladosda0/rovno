import type { PointerEvent as ReactPointerEvent } from "react";

export type GanttDragMode = "move" | "resize-start" | "resize-end";

interface GanttBarProps {
  workId: string;
  title: string;
  startDay: number;
  endDay: number;
  timelineStartDay: number;
  pxPerDay: number;
  isOwner: boolean;
  onDragStart: (workId: string, mode: GanttDragMode, event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function GanttBar({
  workId,
  title,
  startDay,
  endDay,
  timelineStartDay,
  pxPerDay,
  isOwner,
  onDragStart,
}: GanttBarProps) {
  const left = (startDay - timelineStartDay) * pxPerDay;
  const width = Math.max(pxPerDay, (endDay - startDay + 1) * pxPerDay);

  return (
    <div
      className={`absolute top-1/2 h-7 -translate-y-1/2 rounded-md border border-primary/40 bg-primary/80 text-xs text-primary-foreground shadow-sm ${
        isOwner ? "cursor-grab active:cursor-grabbing" : "cursor-default"
      }`}
      style={{ left, width }}
      onPointerDown={(event) => {
        if (!isOwner) return;
        onDragStart(workId, "move", event);
      }}
      title={title}
      role="button"
      tabIndex={-1}
    >
      <div className="flex h-full items-center justify-center px-2">
        <span className="truncate">{title}</span>
      </div>

      {isOwner && (
        <>
          <div
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-primary-foreground/25"
            onPointerDown={(event) => {
              event.stopPropagation();
              onDragStart(workId, "resize-start", event);
            }}
          />
          <div
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-primary-foreground/25"
            onPointerDown={(event) => {
              event.stopPropagation();
              onDragStart(workId, "resize-end", event);
            }}
          />
        </>
      )}
    </div>
  );
}
