import type { Media, Task, ChecklistItem, Comment, Stage } from "@/types/entities";

export interface PhotoConsultContext {
  photo: Media;
  task?: Task;
  stage?: Stage;
  siblingPhotos?: Media[]; // other photos in same task
}

type Listener = (ctx: PhotoConsultContext | null) => void;

let current: PhotoConsultContext | null = null;
const listeners = new Set<Listener>();

export function openPhotoConsult(ctx: PhotoConsultContext) {
  current = ctx;
  listeners.forEach((l) => l(current));
}

export function closePhotoConsult() {
  current = null;
  listeners.forEach((l) => l(current));
}

export function getPhotoConsultContext(): PhotoConsultContext | null {
  return current;
}

export function subscribePhotoConsult(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Build a prefilled prompt from the context */
export function buildConsultPrompt(ctx: PhotoConsultContext): string {
  const parts: string[] = [];
  parts.push(`Analyze this photo: "${ctx.photo.caption}"`);

  if (ctx.task) {
    parts.push(`in context of task: "${ctx.task.title}"`);
    if (ctx.task.description) parts.push(`(${ctx.task.description})`);

    const done = ctx.task.checklist.filter((c) => c.done).length;
    const total = ctx.task.checklist.length;
    if (total > 0) {
      parts.push(`Checklist progress: ${done}/${total}`);
    }
  }

  if (ctx.stage) {
    parts.push(`Stage: "${ctx.stage.title}"`);
  }

  parts.push(
    "\n\nPlease assess:\n" +
    "1. What step does this photo correspond to?\n" +
    "2. Is it consistent with the method and sequence?\n" +
    "3. Risks or defects visible\n" +
    "4. What is the next correct step?\n" +
    "5. Confidence level and what additional photo angle would help"
  );

  return parts.join(" ");
}
