import type { Event } from "@/types/entities";

export function isAIEvent(event: Event): boolean {
  const payload = event.payload as Record<string, unknown>;
  return event.actor_id === "ai" || payload.source === "ai" || payload.createdFrom === "ai";
}
