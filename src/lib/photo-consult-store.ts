import type { Media, Task, Stage } from "@/types/entities";

export interface PhotoConsultContext {
  photo: Media;
  task?: Task;
  stage?: Stage;
  siblingPhotos?: Media[]; // other photos in same task
}

type Listener = (payload: { projectId: string; context: PhotoConsultContext | null }) => void;

const contextsByProjectId = new Map<string, PhotoConsultContext>();
const listeners = new Set<Listener>();

export function openPhotoConsult(ctx: PhotoConsultContext) {
  contextsByProjectId.set(ctx.photo.project_id, ctx);
  listeners.forEach((listener) => listener({ projectId: ctx.photo.project_id, context: ctx }));
}

export function closePhotoConsult(projectId?: string) {
  if (projectId) {
    contextsByProjectId.delete(projectId);
    listeners.forEach((listener) => listener({ projectId, context: null }));
    return;
  }

  Array.from(contextsByProjectId.keys()).forEach((key) => {
    contextsByProjectId.delete(key);
    listeners.forEach((listener) => listener({ projectId: key, context: null }));
  });
}

export function getPhotoConsultContext(projectId?: string): PhotoConsultContext | null {
  if (projectId) {
    return contextsByProjectId.get(projectId) ?? null;
  }

  const firstContext = contextsByProjectId.values().next();
  return firstContext.done ? null : firstContext.value;
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
