import type { Task } from "@/types/entities";

/**
 * True while the estimate still owns the task: it is linked to an estimate work,
 * or its checklist carries estimate lineage (a hero-created task before its
 * first projection). Only a task for which this is false may be deleted by hand
 * in Supabase mode (rovno#125).
 */
export function isTaskOwnedByEstimate(task: Pick<Task, "estimateV2WorkId" | "checklist">): boolean {
  if (task.estimateV2WorkId) return true;
  return (task.checklist ?? []).some((item) => Boolean(item.estimateV2WorkId || item.estimateV2LineId));
}
