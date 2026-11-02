import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Thumbs under Shurik's answers (docs-library 6.11). The server keeps them for Vlad and
// lets nobody read them back, so what the button shows is remembered on this side: in the
// transcript inside a project, in localStorage for the shared conversation outside one.
// The client types do not list this RPC, hence the untyped client here and only here.
const rawSupabase = supabase as unknown as SupabaseClient;

export type AiAnswerRating = "good" | "bad";

const SERVER_RATING: Record<AiAnswerRating, "up" | "down"> = { good: "up", bad: "down" };

export interface AiAnswerRatingInput {
  messageId: string;
  rating: AiAnswerRating | null;
  /** Null outside a project. */
  projectId: string | null;
  question: string;
  answer: string;
}

/** False when the write failed: a rating is a signal for us, never a reason to bother the person. */
export async function sendAiAnswerRating(input: AiAnswerRatingInput): Promise<boolean> {
  try {
    const { error } = await rawSupabase.rpc("set_ai_answer_rating", {
      p_message_id: input.messageId,
      p_rating: input.rating ? SERVER_RATING[input.rating] : null,
      p_project_id: input.projectId,
      p_question: input.question,
      p_answer: input.answer,
    });
    return !error;
  } catch {
    return false;
  }
}

/** What a press on a rating button leaves: pressing the lit one takes the rating off. */
export function toggledRating(current: AiAnswerRating | undefined, pressed: AiAnswerRating): AiAnswerRating | null {
  return current === pressed ? null : pressed;
}

/** FNV-1a, two seeds: enough to tell one answer from another in a 40-turn conversation. */
function textHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
}

/**
 * The shared conversation comes from the server with no ids of its own, so an answer is
 * named by its text. The same answer given twice shares one rating, which is the lesser
 * harm against a rating that moves to a neighbour when a turn drops off the 40-turn window.
 */
export function homeAnswerId(text: string): string {
  return `home:${textHash(text)}`;
}

const STORAGE_PREFIX = "rovno.homeAiRatings.v1:";
const MAX_STORED = 200;

export function readHomeAnswerRatings(profileId: string): Record<string, AiAnswerRating> {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${profileId}`);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, AiAnswerRating>)
      : {};
  } catch {
    return {};
  }
}

export function writeHomeAnswerRating(profileId: string, id: string, rating: AiAnswerRating | null): void {
  const { [id]: _previous, ...rest } = readHomeAnswerRatings(profileId);
  const next = rating ? { ...rest, [id]: rating } : rest;
  const entries = Object.entries(next).slice(-MAX_STORED);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${profileId}`, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Storage is unavailable: the server still has the rating, the button forgets it on reload.
  }
}
