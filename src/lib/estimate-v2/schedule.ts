import type { EstimateV2Dependency, EstimateV2Work } from "@/types/estimate-v2";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ScheduleTzPolicy = "local_day_iso";
export type WorksById = Record<string, EstimateV2Work>;

export interface TimelineRange {
  start: number;
  end: number;
}

export interface VisibleWindow {
  start: number;
  end: number;
}

export interface WeekTick {
  weekStartDay: number;
  weekNumber: number;
}

export interface MonthTick {
  monthStartDay: number;
  dayCount: number;
}

function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function ensureFiniteDayIndex(dayIndex: number): number {
  if (!Number.isFinite(dayIndex)) return 0;
  return Math.trunc(dayIndex);
}

function normalizeLagDays(lagDays: number): number {
  if (!Number.isFinite(lagDays)) return 0;
  return Math.round(lagDays);
}

function durationFromIndices(start: number | null, end: number | null): number {
  if (start == null && end == null) return 1;
  if (start == null || end == null) return 1;
  return Math.max(1, end - start + 1);
}

function durationDays(work: Pick<EstimateV2Work, "plannedStart" | "plannedEnd">): number {
  const start = toDayIndex(work.plannedStart);
  const end = toDayIndex(work.plannedEnd);
  return durationFromIndices(start, end);
}

function sortNodeIds(ids: Iterable<string>): string[] {
  return [...ids].sort((a, b) => a.localeCompare(b));
}

function getTopologicalOrder(
  workIds: string[],
  deps: Pick<EstimateV2Dependency, "fromWorkId" | "toWorkId">[],
): string[] {
  const known = new Set(workIds);
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  workIds.forEach((id) => {
    adjacency.set(id, []);
    indegree.set(id, 0);
  });

  deps.forEach((dep) => {
    if (!known.has(dep.fromWorkId) || !known.has(dep.toWorkId)) return;
    adjacency.get(dep.fromWorkId)?.push(dep.toWorkId);
    indegree.set(dep.toWorkId, (indegree.get(dep.toWorkId) ?? 0) + 1);
  });

  const queue = sortNodeIds(workIds.filter((id) => (indegree.get(id) ?? 0) === 0));
  const order: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift() as string;
    order.push(node);

    const nextNodes = sortNodeIds(adjacency.get(node) ?? []);
    nextNodes.forEach((next) => {
      const nextIndegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(next);
        queue.sort((a, b) => a.localeCompare(b));
      }
    });
  }

  if (order.length === workIds.length) return order;

  const remaining = workIds.filter((id) => !order.includes(id)).sort((a, b) => a.localeCompare(b));
  return [...order, ...remaining];
}

export function toDayIndex(
  date: string | Date | null | undefined,
  _tzPolicy: ScheduleTzPolicy = "local_day_iso",
): number | null {
  const parsed = parseDate(date);
  if (!parsed) return null;
  const utcMidnight = Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return Math.floor(utcMidnight / DAY_MS);
}

export function fromDayIndex(
  dayIndex: number,
  _tzPolicy: ScheduleTzPolicy = "local_day_iso",
): string {
  const normalized = ensureFiniteDayIndex(dayIndex);
  const utcDate = new Date(normalized * DAY_MS);
  const localMidnight = new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
  return localMidnight.toISOString();
}

export function clampWorkDates(
  work: Pick<EstimateV2Work, "plannedStart" | "plannedEnd">,
  minDays = 1,
): { plannedStart: string; plannedEnd: string; durationDays: number } {
  const minimum = Math.max(1, Math.round(minDays));
  const today = toDayIndex(new Date()) ?? 0;

  let start = toDayIndex(work.plannedStart);
  let end = toDayIndex(work.plannedEnd);

  if (start == null && end == null) {
    start = today;
    end = start + minimum - 1;
  } else if (start == null) {
    start = end as number;
  } else if (end == null) {
    end = start;
  }

  if ((end as number) < (start as number) + minimum - 1) {
    end = (start as number) + minimum - 1;
  }

  const span = Math.max(minimum, (end as number) - (start as number) + 1);

  return {
    plannedStart: fromDayIndex(start as number),
    plannedEnd: fromDayIndex((start as number) + span - 1),
    durationDays: span,
  };
}

export function detectCycle(
  works: Pick<EstimateV2Work, "id">[],
  deps: Pick<EstimateV2Dependency, "fromWorkId" | "toWorkId">[],
): { hasCycle: boolean; cyclePath: string[] } {
  const workIds = new Set(works.map((work) => work.id));
  const graph = new Map<string, string[]>();

  workIds.forEach((id) => graph.set(id, []));
  deps.forEach((dep) => {
    if (!workIds.has(dep.fromWorkId) || !workIds.has(dep.toWorkId)) return;
    graph.get(dep.fromWorkId)?.push(dep.toWorkId);
  });

  graph.forEach((nextNodes, id) => {
    graph.set(id, nextNodes.sort((a, b) => a.localeCompare(b)));
  });

  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];

  const dfs = (node: string): string[] | null => {
    state.set(node, 1);
    stack.push(node);

    const nextNodes = graph.get(node) ?? [];
    for (const nextNode of nextNodes) {
      const nextState = state.get(nextNode) ?? 0;
      if (nextState === 0) {
        const cycle = dfs(nextNode);
        if (cycle) return cycle;
      } else if (nextState === 1) {
        const cycleStart = stack.indexOf(nextNode);
        if (cycleStart >= 0) return [...stack.slice(cycleStart), nextNode];
        return [node, nextNode];
      }
    }

    stack.pop();
    state.set(node, 2);
    return null;
  };

  const orderedIds = sortNodeIds(workIds);
  for (const id of orderedIds) {
    if ((state.get(id) ?? 0) !== 0) continue;
    const cycle = dfs(id);
    if (cycle) return { hasCycle: true, cyclePath: cycle };
  }

  return { hasCycle: false, cyclePath: [] };
}

export function earliestAllowedStart(
  workId: string,
  deps: Pick<EstimateV2Dependency, "fromWorkId" | "toWorkId" | "lagDays">[],
  worksById: WorksById,
): number | null {
  let earliest: number | null = null;

  deps.forEach((dep) => {
    if (dep.toWorkId !== workId) return;
    const predecessor = worksById[dep.fromWorkId];
    if (!predecessor) return;

    const predecessorEnd = toDayIndex(predecessor.plannedEnd);
    if (predecessorEnd == null) return;

    // FS means successor starts after predecessor finish; lag adds extra wait days.
    const candidate = predecessorEnd + normalizeLagDays(dep.lagDays) + 1;
    if (earliest == null || candidate > earliest) earliest = candidate;
  });

  return earliest;
}

export function applyFSConstraints(
  worksById: WorksById,
  deps: Pick<EstimateV2Dependency, "fromWorkId" | "toWorkId" | "lagDays">[],
): WorksById {
  const nextById: WorksById = Object.fromEntries(
    Object.entries(worksById).map(([id, work]) => [id, { ...work }]),
  );

  const cycle = detectCycle(
    Object.values(nextById).map((work) => ({ id: work.id })),
    deps,
  );
  if (cycle.hasCycle) return nextById;

  const workIds = Object.keys(nextById).sort((a, b) => a.localeCompare(b));
  const order = getTopologicalOrder(workIds, deps);

  order.forEach((workId) => {
    const work = nextById[workId];
    if (!work) return;

    const currentStart = toDayIndex(work.plannedStart);
    const currentEnd = toDayIndex(work.plannedEnd);
    const spanDays = durationFromIndices(currentStart, currentEnd);
    const minStart = earliestAllowedStart(workId, deps, nextById);

    if (minStart == null) return;

    const start = currentStart == null ? minStart : Math.max(currentStart, minStart);
    const end = start + spanDays - 1;

    nextById[workId] = {
      ...work,
      plannedStart: fromDayIndex(start),
      plannedEnd: fromDayIndex(end),
    };
  });

  return nextById;
}

export function validateAndFixOnDrag(
  workId: string,
  proposedStart: number,
  proposedEnd: number,
  deps: Pick<EstimateV2Dependency, "fromWorkId" | "toWorkId" | "lagDays">[],
  worksById: WorksById,
): { fixedStart: number; fixedEnd: number; reasons: Array<"min_duration" | "fs_snap"> } {
  const reasons: Array<"min_duration" | "fs_snap"> = [];

  let fixedStart = ensureFiniteDayIndex(proposedStart);
  let fixedEnd = ensureFiniteDayIndex(proposedEnd);

  if (fixedEnd < fixedStart) {
    fixedEnd = fixedStart;
    reasons.push("min_duration");
  }

  const spanDays = fixedEnd - fixedStart + 1;
  const minStart = earliestAllowedStart(workId, deps, worksById);

  if (minStart != null && fixedStart < minStart) {
    fixedStart = minStart;
    fixedEnd = fixedStart + spanDays - 1;
    reasons.push("fs_snap");
  }

  return {
    fixedStart,
    fixedEnd,
    reasons,
  };
}

function workSortKey(
  work: EstimateV2Work,
  stageOrderById: Map<string, number>,
): [number, number, string] {
  return [stageOrderById.get(work.stageId) ?? Number.MAX_SAFE_INTEGER, work.order, work.id];
}

function dayToLocalDate(dayIndex: number): Date {
  return new Date(fromDayIndex(dayIndex));
}

function isoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * DAY_MS));
}

function startOfIsoWeek(dayIndex: number): number {
  const date = dayToLocalDate(dayIndex);
  const mondayOffset = (date.getDay() + 6) % 7;
  return dayIndex - mondayOffset;
}

function startOfMonth(dayIndex: number): number {
  const date = dayToLocalDate(dayIndex);
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return toDayIndex(first) ?? dayIndex;
}

function monthDayCount(dayIndex: number): number {
  const date = dayToLocalDate(dayIndex);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function computeTimelineRange(
  works: Pick<EstimateV2Work, "plannedStart" | "plannedEnd">[],
  options: {
    paddingDays?: number;
    emptySpanDays?: number;
    anchorDate?: string | Date;
  } = {},
): TimelineRange {
  const paddingDays = Math.max(0, Math.round(options.paddingDays ?? 14));
  const emptySpanDays = Math.max(1, Math.round(options.emptySpanDays ?? 30));
  const anchorDay = toDayIndex(options.anchorDate ?? new Date()) ?? 0;

  let minDay = Number.POSITIVE_INFINITY;
  let maxDay = Number.NEGATIVE_INFINITY;

  works.forEach((work) => {
    const start = toDayIndex(work.plannedStart);
    const end = toDayIndex(work.plannedEnd);
    if (start == null || end == null) return;
    if (start < minDay) minDay = start;
    if (end > maxDay) maxDay = end;
  });

  if (!Number.isFinite(minDay) || !Number.isFinite(maxDay)) {
    minDay = anchorDay;
    maxDay = anchorDay + emptySpanDays;
  }

  return {
    start: Math.trunc(minDay) - paddingDays,
    end: Math.trunc(maxDay) + paddingDays,
  };
}

export function computeVisibleWindow(input: {
  timelineStartDay: number;
  timelineEndDay: number;
  scrollLeftPx: number;
  viewportWidthPx: number;
  pxPerDay: number;
  bufferDays?: number;
}): VisibleWindow {
  const timelineStartDay = Math.trunc(input.timelineStartDay);
  const timelineEndDay = Math.max(timelineStartDay, Math.trunc(input.timelineEndDay));
  const pxPerDay = Math.max(1, Math.round(input.pxPerDay));
  const bufferDays = Math.max(0, Math.round(input.bufferDays ?? 30));
  const scrollLeftPx = Number.isFinite(input.scrollLeftPx) ? input.scrollLeftPx : 0;
  const viewportWidthPx = Number.isFinite(input.viewportWidthPx) ? input.viewportWidthPx : pxPerDay;

  const rawStart = timelineStartDay + Math.floor(scrollLeftPx / pxPerDay) - bufferDays;
  const rawEnd = timelineStartDay + Math.ceil((scrollLeftPx + viewportWidthPx) / pxPerDay) + bufferDays;

  const start = Math.max(timelineStartDay, rawStart);
  const end = Math.min(timelineEndDay, rawEnd);

  if (end >= start) return { start, end };

  const anchor = Math.min(
    timelineEndDay,
    Math.max(
      timelineStartDay,
      timelineStartDay + Math.floor(scrollLeftPx / pxPerDay),
    ),
  );

  return {
    start: anchor,
    end: anchor,
  };
}

export function buildWeekTicks(visibleStartDay: number, visibleEndDay: number): WeekTick[] {
  const start = Math.trunc(visibleStartDay);
  const end = Math.trunc(visibleEndDay);
  if (end < start) return [];

  const ticks: WeekTick[] = [];
  for (let weekStart = startOfIsoWeek(start); weekStart <= end; weekStart += 7) {
    const date = dayToLocalDate(weekStart);
    ticks.push({
      weekStartDay: weekStart,
      weekNumber: isoWeek(date),
    });
  }

  return ticks;
}

export function buildMonthTicks(visibleStartDay: number, visibleEndDay: number): MonthTick[] {
  const start = Math.trunc(visibleStartDay);
  const end = Math.trunc(visibleEndDay);
  if (end < start) return [];

  const ticks: MonthTick[] = [];
  let monthStart = startOfMonth(start);
  while (monthStart <= end) {
    const dayCount = monthDayCount(monthStart);
    ticks.push({
      monthStartDay: monthStart,
      dayCount,
    });
    monthStart += dayCount;
  }

  return ticks;
}

export function autoScheduleSequential(
  works: EstimateV2Work[],
  anchorDateIso: string,
  stageOrderById: Map<string, number> = new Map<string, number>(),
): EstimateV2Work[] {
  const anchor = toDayIndex(anchorDateIso) ?? toDayIndex(new Date()) ?? 0;
  let cursor = anchor;

  const sorted = [...works].sort((a, b) => {
    const aKey = workSortKey(a, stageOrderById);
    const bKey = workSortKey(b, stageOrderById);
    if (aKey[0] !== bKey[0]) return aKey[0] - bKey[0];
    if (aKey[1] !== bKey[1]) return aKey[1] - bKey[1];
    return aKey[2].localeCompare(bKey[2]);
  });

  const updatesById = new Map<string, { plannedStart: string; plannedEnd: string }>();
  sorted.forEach((work) => {
    const spanDays = durationDays(work);
    const plannedStart = cursor;
    const plannedEnd = plannedStart + spanDays - 1;
    updatesById.set(work.id, {
      plannedStart: fromDayIndex(plannedStart),
      plannedEnd: fromDayIndex(plannedEnd),
    });
    cursor = plannedEnd + 1;
  });

  return works.map((work) => {
    const update = updatesById.get(work.id);
    if (!update) return work;
    return {
      ...work,
      plannedStart: update.plannedStart,
      plannedEnd: update.plannedEnd,
    };
  });
}

export function validateNoCycles(
  dependencies: Pick<EstimateV2Dependency, "fromWorkId" | "toWorkId">[],
): { valid: true; cyclePath: null } | { valid: false; cyclePath: string[] } {
  const uniqueIds = new Set<string>();
  dependencies.forEach((dep) => {
    uniqueIds.add(dep.fromWorkId);
    uniqueIds.add(dep.toWorkId);
  });

  const cycle = detectCycle(
    [...uniqueIds].map((id) => ({ id })),
    dependencies,
  );

  if (cycle.hasCycle) {
    return {
      valid: false,
      cyclePath: cycle.cyclePath,
    };
  }

  return {
    valid: true,
    cyclePath: null,
  };
}

export function applyFSConstraintsLegacy(
  works: EstimateV2Work[],
  dependencies: Pick<EstimateV2Dependency, "fromWorkId" | "toWorkId" | "lagDays">[],
): EstimateV2Work[] {
  const worksById: WorksById = Object.fromEntries(works.map((work) => [work.id, work]));
  const constrained = applyFSConstraints(worksById, dependencies);
  return works.map((work) => constrained[work.id] ?? work);
}
