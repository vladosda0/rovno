import type { EstimateV2Dependency, EstimateV2Work } from "@/types/estimate-v2";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toIso(date: Date): string {
  return date.toISOString();
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + (days * DAY_MS));
}

function durationDays(work: Pick<EstimateV2Work, "plannedStart" | "plannedEnd">): number {
  const start = toDate(work.plannedStart);
  const end = toDate(work.plannedEnd);
  if (!start || !end) return 1;
  const diff = Math.floor((end.getTime() - start.getTime()) / DAY_MS);
  return Math.max(1, diff + 1);
}

function workSortKey(
  work: EstimateV2Work,
  stageOrderById: Map<string, number>,
): [number, number, string] {
  return [stageOrderById.get(work.stageId) ?? Number.MAX_SAFE_INTEGER, work.order, work.id];
}

export function autoScheduleSequential(
  works: EstimateV2Work[],
  anchorDateIso: string,
  stageOrderById: Map<string, number> = new Map<string, number>(),
): EstimateV2Work[] {
  const anchorParsed = toDate(anchorDateIso) ?? new Date();
  let cursor = startOfLocalDay(anchorParsed);
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
    const plannedStart = startOfLocalDay(cursor);
    const plannedEnd = addDays(plannedStart, spanDays - 1);
    updatesById.set(work.id, {
      plannedStart: toIso(plannedStart),
      plannedEnd: toIso(plannedEnd),
    });
    cursor = addDays(plannedEnd, 1);
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
  const graph = new Map<string, string[]>();
  dependencies.forEach((dep) => {
    const list = graph.get(dep.fromWorkId) ?? [];
    list.push(dep.toWorkId);
    graph.set(dep.fromWorkId, list);
    if (!graph.has(dep.toWorkId)) graph.set(dep.toWorkId, []);
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
        const result = dfs(nextNode);
        if (result) return result;
      } else if (nextState === 1) {
        const index = stack.indexOf(nextNode);
        if (index >= 0) return [...stack.slice(index), nextNode];
        return [node, nextNode];
      }
    }
    stack.pop();
    state.set(node, 2);
    return null;
  };

  for (const node of graph.keys()) {
    if ((state.get(node) ?? 0) !== 0) continue;
    const cycle = dfs(node);
    if (cycle) return { valid: false, cyclePath: cycle };
  }

  return { valid: true, cyclePath: null };
}

export function applyFSConstraints(
  works: EstimateV2Work[],
  dependencies: Pick<EstimateV2Dependency, "fromWorkId" | "toWorkId" | "lagDays">[],
): EstimateV2Work[] {
  const byId = new Map<string, EstimateV2Work>(works.map((work) => [work.id, { ...work }]));

  const safeDuration = (work: EstimateV2Work): number => durationDays(work);
  const safeDate = (value: string | null): Date | null => toDate(value);

  const iterationLimit = Math.max(works.length * Math.max(dependencies.length, 1), 1) + 5;
  for (let i = 0; i < iterationLimit; i += 1) {
    let changed = false;

    dependencies.forEach((dependency) => {
      const from = byId.get(dependency.fromWorkId);
      const to = byId.get(dependency.toWorkId);
      if (!from || !to) return;

      const fromEnd = safeDate(from.plannedEnd);
      const toStart = safeDate(to.plannedStart);
      if (!fromEnd || !toStart) return;

      const minStart = addDays(startOfLocalDay(fromEnd), Math.max(0, Math.round(dependency.lagDays)));
      if (toStart.getTime() >= minStart.getTime()) return;

      const spanDays = safeDuration(to);
      const nextStart = startOfLocalDay(minStart);
      const nextEnd = addDays(nextStart, spanDays - 1);
      to.plannedStart = toIso(nextStart);
      to.plannedEnd = toIso(nextEnd);
      changed = true;
    });

    if (!changed) break;
  }

  return works.map((work) => byId.get(work.id) ?? work);
}
