import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  addDependency,
  removeDependency,
  updateWorkDates,
} from "@/data/estimate-v2-store";
import {
  clampWorkDates,
  computeTimelineRange,
  computeVisibleWindow,
  fromDayIndex,
  toDayIndex,
  validateAndFixOnDrag,
} from "@/lib/estimate-v2/schedule";
import type { EstimateV2Dependency, EstimateV2Stage, EstimateV2Work } from "@/types/estimate-v2";
import { DependencyEditor } from "@/components/estimate-v2/gantt/DependencyEditor";
import { GanttBar, type GanttDragMode } from "@/components/estimate-v2/gantt/GanttBar";
import { GanttHeader, type GanttScale } from "@/components/estimate-v2/gantt/GanttHeader";
import { GanttRow } from "@/components/estimate-v2/gantt/GanttRow";

const LEFT_PANE_WIDTH = 384;
const STAGE_ROW_HEIGHT = 40;
const WORK_ROW_HEIGHT = 44;
const HORIZONTAL_BUFFER_DAYS = 30;

const SCALE_PIXELS_PER_DAY: Record<GanttScale, number> = {
  days: 28,
  weeks: 14,
  months: 6,
};

const dayRangeLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

interface EstimateGanttProps {
  projectId: string;
  stages: EstimateV2Stage[];
  works: EstimateV2Work[];
  dependencies: EstimateV2Dependency[];
  isOwner: boolean;
}

interface RowDescriptor {
  key: string;
  kind: "stage" | "work";
  title: string;
  subtitle?: string;
  height: number;
  workId?: string;
}

interface DragState {
  workId: string;
  mode: GanttDragMode;
  originStart: number;
  originEnd: number;
  pointerStartDay: number;
  latestClientX: number;
  rafId: number | null;
}

function normalizedDraftWork(work: EstimateV2Work): EstimateV2Work {
  const start = toDayIndex(work.plannedStart);
  const end = toDayIndex(work.plannedEnd);
  if (start != null && end != null) return work;

  const clamped = clampWorkDates(
    {
      plannedStart: work.plannedStart,
      plannedEnd: work.plannedEnd,
    },
    1,
  );

  return {
    ...work,
    plannedStart: clamped.plannedStart,
    plannedEnd: clamped.plannedEnd,
  };
}

export function EstimateGantt({
  projectId,
  stages,
  works,
  dependencies,
  isOwner,
}: EstimateGanttProps) {
  const { toast } = useToast();

  const [scale, setScale] = useState<GanttScale>("weeks");
  const [dependencyEditorOpen, setDependencyEditorOpen] = useState(false);

  const sortedStages = useMemo(
    () => [...stages].sort((a, b) => a.order - b.order),
    [stages],
  );

  const worksByStage = useMemo(() => {
    const map = new Map<string, EstimateV2Work[]>();
    works.forEach((work) => {
      const list = map.get(work.stageId) ?? [];
      list.push(work);
      map.set(work.stageId, list);
    });
    map.forEach((list) => list.sort((a, b) => a.order - b.order));
    return map;
  }, [works]);

  const baseWorksById = useMemo(
    () => Object.fromEntries(works.map((work) => [work.id, normalizedDraftWork(work)])),
    [works],
  );

  const [draftWorksById, setDraftWorksById] = useState<Record<string, EstimateV2Work>>(baseWorksById);
  const draftWorksByIdRef = useRef(draftWorksById);
  useEffect(() => {
    draftWorksByIdRef.current = draftWorksById;
  }, [draftWorksById]);

  const dragStateRef = useRef<DragState | null>(null);
  const dependenciesRef = useRef(dependencies);
  useEffect(() => {
    dependenciesRef.current = dependencies;
  }, [dependencies]);

  useEffect(() => {
    if (dragStateRef.current) return;
    setDraftWorksById(baseWorksById);
    draftWorksByIdRef.current = baseWorksById;
  }, [baseWorksById]);

  const rows = useMemo<RowDescriptor[]>(() => {
    const out: RowDescriptor[] = [];

    sortedStages.forEach((stage) => {
      out.push({
        key: `stage-${stage.id}`,
        kind: "stage",
        title: stage.title,
        height: STAGE_ROW_HEIGHT,
      });

      const stageWorks = worksByStage.get(stage.id) ?? [];
      stageWorks.forEach((work) => {
        const draft = draftWorksById[work.id] ?? work;
        const subtitle = draft.plannedStart && draft.plannedEnd
          ? `${dayRangeLabel.format(new Date(draft.plannedStart))} - ${dayRangeLabel.format(new Date(draft.plannedEnd))}`
          : "No planned dates";

        out.push({
          key: `work-${work.id}`,
          kind: "work",
          title: work.title,
          subtitle,
          height: WORK_ROW_HEIGHT,
          workId: work.id,
        });
      });
    });

    return out;
  }, [draftWorksById, sortedStages, worksByStage]);

  const pxPerDay = SCALE_PIXELS_PER_DAY[scale];
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(800);

  const timelineRange = useMemo(() => {
    const draftWorks = works.map((work) => draftWorksById[work.id] ?? work);
    return computeTimelineRange(draftWorks, {
      paddingDays: 14,
      emptySpanDays: 30,
      anchorDate: new Date(),
    });
  }, [draftWorksById, works]);

  const timelineStartDay = timelineRange.start;
  const timelineEndDay = timelineRange.end;
  const computedTimelineWidth = Math.max(pxPerDay, (timelineEndDay - timelineStartDay + 1) * pxPerDay);
  const timelineWidth = Math.max(computedTimelineWidth, viewportWidth);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;

    setViewportWidth(node.clientWidth);

    const observer = new ResizeObserver(() => {
      setViewportWidth(node.clientWidth);
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maxScrollLeft = Math.max(0, timelineWidth - viewport.clientWidth);
    const nextScrollLeft = Math.min(Math.max(viewport.scrollLeft, 0), maxScrollLeft);
    if (viewport.scrollLeft !== nextScrollLeft) {
      viewport.scrollLeft = nextScrollLeft;
    }
    if (scrollLeft !== nextScrollLeft) {
      setScrollLeft(nextScrollLeft);
    }
  }, [scrollLeft, scale, timelineStartDay, timelineEndDay, timelineWidth, viewportWidth]);

  const visibleWindow = computeVisibleWindow({
    timelineStartDay,
    timelineEndDay,
    scrollLeftPx: scrollLeft,
    viewportWidthPx: viewportWidth,
    pxPerDay,
    bufferDays: HORIZONTAL_BUFFER_DAYS,
  });
  const visibleStartDay = visibleWindow.start;
  const visibleEndDay = visibleWindow.end;

  const clientXToDayIndex = useCallback((clientX: number): number => {
    const viewport = viewportRef.current;
    if (!viewport) return timelineStartDay;
    const rect = viewport.getBoundingClientRect();
    const x = clientX - rect.left + viewport.scrollLeft;
    return timelineStartDay + Math.floor(x / pxPerDay);
  }, [pxPerDay, timelineStartDay]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    drag.latestClientX = event.clientX;
    if (drag.rafId != null) return;

    drag.rafId = window.requestAnimationFrame(() => {
      const active = dragStateRef.current;
      if (!active) return;
      active.rafId = null;

      const pointerDay = clientXToDayIndex(active.latestClientX);
      const delta = pointerDay - active.pointerStartDay;

      let proposedStart = active.originStart;
      let proposedEnd = active.originEnd;

      if (active.mode === "move") {
        proposedStart += delta;
        proposedEnd += delta;
      } else if (active.mode === "resize-start") {
        proposedStart += delta;
      } else {
        proposedEnd += delta;
      }

      const fixed = validateAndFixOnDrag(
        active.workId,
        proposedStart,
        proposedEnd,
        dependenciesRef.current,
        draftWorksByIdRef.current,
      );

      const nextStart = fromDayIndex(fixed.fixedStart);
      const nextEnd = fromDayIndex(fixed.fixedEnd);

      setDraftWorksById((prev) => {
        const current = prev[active.workId];
        if (!current) return prev;
        if (current.plannedStart === nextStart && current.plannedEnd === nextEnd) return prev;

        const next = {
          ...prev,
          [active.workId]: {
            ...current,
            plannedStart: nextStart,
            plannedEnd: nextEnd,
          },
        };
        draftWorksByIdRef.current = next;
        return next;
      });
    });
  }, [clientXToDayIndex]);

  const finalizeDragRef = useRef<(commit: boolean) => void>(() => {});

  const handlePointerUp = useCallback(() => {
    finalizeDragRef.current(true);
  }, []);

  const handlePointerCancel = useCallback(() => {
    finalizeDragRef.current(false);
  }, []);

  const finalizeDrag = useCallback((commit: boolean) => {
    const drag = dragStateRef.current;
    if (!drag) return;

    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);

    if (drag.rafId != null) {
      window.cancelAnimationFrame(drag.rafId);
    }

    dragStateRef.current = null;

    if (!commit) {
      setDraftWorksById(baseWorksById);
      draftWorksByIdRef.current = baseWorksById;
      return;
    }

    const updated = draftWorksByIdRef.current[drag.workId];
    if (!updated?.plannedStart || !updated?.plannedEnd) {
      setDraftWorksById(baseWorksById);
      draftWorksByIdRef.current = baseWorksById;
      return;
    }

    const result = updateWorkDates(
      projectId,
      drag.workId,
      updated.plannedStart,
      updated.plannedEnd,
      { source: "gantt" },
    );

    if (!result.ok) {
      toast({
        title: "Unable to update work dates",
        description: result.reason,
        variant: "destructive",
      });
      setDraftWorksById(baseWorksById);
      draftWorksByIdRef.current = baseWorksById;
      return;
    }

    if (result.shiftedWorkIds.length > 0) {
      toast({
        title: "Constraints applied",
        description: `${result.shiftedWorkIds.length} dependent work(s) were shifted.`,
      });
    }
  }, [baseWorksById, handlePointerCancel, handlePointerMove, handlePointerUp, projectId, toast]);

  useEffect(() => {
    finalizeDragRef.current = finalizeDrag;
  }, [finalizeDrag]);

  useEffect(() => (
    () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
    }
  ), [handlePointerCancel, handlePointerMove, handlePointerUp]);

  const handleBarDragStart = useCallback((
    workId: string,
    mode: GanttDragMode,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (!isOwner) return;

    const work = draftWorksByIdRef.current[workId];
    if (!work) return;

    const originStart = toDayIndex(work.plannedStart);
    const originEnd = toDayIndex(work.plannedEnd);
    if (originStart == null || originEnd == null) return;

    dragStateRef.current = {
      workId,
      mode,
      originStart,
      originEnd,
      pointerStartDay: clientXToDayIndex(event.clientX),
      latestClientX: event.clientX,
      rafId: null,
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    event.preventDefault();
  }, [clientXToDayIndex, handlePointerCancel, handlePointerMove, handlePointerUp, isOwner]);

  const handleAddDependency = useCallback((fromWorkId: string, toWorkId: string, lagDays: number, comment?: string) => {
    const result = addDependency(projectId, fromWorkId, toWorkId, lagDays, comment);
    if (!result.ok) {
      if (result.reason === "cycle") {
        toast({
          title: "Dependency creates a cycle",
          description: result.cyclePath?.join(" -> ") || "Please choose another dependency.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Unable to add dependency",
        description: result.reason,
        variant: "destructive",
      });
      return;
    }

    if (result.shiftedWorkIds.length > 0) {
      toast({
        title: "Dependency added",
        description: `${result.shiftedWorkIds.length} work(s) shifted to satisfy FS constraints.`,
      });
      return;
    }

    toast({ title: "Dependency added" });
  }, [projectId, toast]);

  const handleRemoveDependency = useCallback((dependencyId: string) => {
    removeDependency(projectId, dependencyId);
  }, [projectId]);

  return (
    <div className="rounded-card border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Work schedule</p>
          <p className="text-xs text-muted-foreground">Drag bars to move or resize. Constraints are enforced live.</p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={scale} onValueChange={(value) => setScale(value as GanttScale)}>
            <SelectTrigger className="h-8 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="days">Days</SelectItem>
              <SelectItem value="weeks">Weeks</SelectItem>
              <SelectItem value="months">Months</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            disabled={!isOwner}
            onClick={() => setDependencyEditorOpen(true)}
          >
            <Link2 className="mr-1 h-4 w-4" /> Dependencies
          </Button>
        </div>
      </div>

      <div className="flex min-h-[420px]">
        <div className="shrink-0 border-r border-border" style={{ width: LEFT_PANE_WIDTH }}>
          <div className="h-12 border-b border-border px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Stages / Works</p>
          </div>

          {rows.map((row) => (
            <GanttRow
              key={row.key}
              kind={row.kind}
              title={row.title}
              subtitle={row.subtitle}
              height={row.height}
            />
          ))}
        </div>

        <div
          ref={viewportRef}
          className="relative flex-1 overflow-x-auto"
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
        >
          <div className="relative" style={{ width: timelineWidth }}>
            <GanttHeader
              scale={scale}
              timelineStartDay={timelineStartDay}
              timelineEndDay={timelineEndDay}
              visibleStartDay={visibleStartDay}
              visibleEndDay={visibleEndDay}
              pxPerDay={pxPerDay}
              width={timelineWidth}
            />

            {rows.map((row) => {
              const baseRowClass = row.kind === "stage"
                ? "relative border-b border-border bg-muted/25"
                : "relative border-b border-border bg-background";

              return (
                <div
                  key={`timeline-${row.key}`}
                  className={baseRowClass}
                  style={{
                    height: row.height,
                    backgroundImage: `repeating-linear-gradient(to right, transparent, transparent ${Math.max(pxPerDay - 1, 1)}px, hsl(var(--border) / 0.45) ${Math.max(pxPerDay - 1, 1)}px, hsl(var(--border) / 0.45) ${pxPerDay}px)`,
                  }}
                >
                  {row.kind === "work" && row.workId && (() => {
                    const draft = draftWorksById[row.workId];
                    if (!draft) return null;

                    const start = toDayIndex(draft.plannedStart);
                    const end = toDayIndex(draft.plannedEnd);
                    if (start == null || end == null) return null;
                    if (end < visibleStartDay || start > visibleEndDay) return null;

                    return (
                      <GanttBar
                        workId={row.workId}
                        title={draft.title}
                        startDay={start}
                        endDay={end}
                        timelineStartDay={timelineStartDay}
                        pxPerDay={pxPerDay}
                        isOwner={isOwner}
                        onDragStart={handleBarDragStart}
                      />
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <DependencyEditor
        open={dependencyEditorOpen}
        onOpenChange={setDependencyEditorOpen}
        works={works}
        dependencies={dependencies}
        isOwner={isOwner}
        onAddDependency={handleAddDependency}
        onRemoveDependency={handleRemoveDependency}
      />
    </div>
  );
}
