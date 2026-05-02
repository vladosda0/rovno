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
  /**
   * Render the bar in placeholder style for works without persisted dates.
   * The bar is dashed/translucent and sits on a single day; pointerdown still
   * routes through onDragStart so the user can drag-to-create real dates.
   */
  placeholder?: boolean;
  placeholderHint?: string;
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
  placeholder = false,
  placeholderHint,
  onDragStart,
}: GanttBarProps) {
  const left = (startDay - timelineStartDay) * pxPerDay;
  const width = Math.max(pxPerDay, (endDay - startDay + 1) * pxPerDay);

  const containerClass = placeholder
    ? `absolute top-1/2 h-7 -translate-y-1/2 rounded-md border border-dashed border-primary/60 bg-primary/30 text-xs text-primary-foreground ${
      isOwner ? "cursor-grab active:cursor-grabbing" : "cursor-default"
    }`
    : `absolute top-1/2 h-7 -translate-y-1/2 rounded-md border border-primary/40 bg-primary/80 text-xs text-primary-foreground shadow-sm ${
      isOwner ? "cursor-grab active:cursor-grabbing" : "cursor-default"
    }`;

  return (
    <div
      className={containerClass}
      style={{ left, width }}
      onPointerDown={(event) => {
        if (!isOwner) return;
        // Capture the pointer on this element so move/up still fire after the
        // cursor leaves the window or this element. Replaces the prior
        // window-level listener pattern.
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // setPointerCapture can throw on detached elements; safe to ignore.
        }
        onDragStart(workId, "move", event);
      }}
      title={placeholder && placeholderHint ? placeholderHint : title}
      role="button"
      tabIndex={-1}
    >
      <div className="flex h-full items-center justify-center px-2">
        <span className="truncate">{placeholder ? (placeholderHint ?? title) : title}</span>
      </div>

      {isOwner && !placeholder && (
        <>
          <div
            className="absolute left-0 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-primary-foreground/25"
            onPointerDown={(event) => {
              event.stopPropagation();
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // ignore
              }
              onDragStart(workId, "resize-start", event);
            }}
          />
          <div
            className="absolute right-0 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-primary-foreground/25"
            onPointerDown={(event) => {
              event.stopPropagation();
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // ignore
              }
              onDragStart(workId, "resize-end", event);
            }}
          />
        </>
      )}
    </div>
  );
}
