// Reading-time estimate for blog posts.
//
// 180 wpm is the common estimate for Russian long-form (Cyrillic words run
// longer than English ones, so the usual 200-230 wpm English figure over-
// promises). The value is stored on the row at save time so the public list,
// the article header, RSS and the prerenderer all agree without recomputing.

export const WORDS_PER_MINUTE_RU = 180;

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+/gu);
  return matches ? matches.length : 0;
}

export function readingTimeMinutes(wordCount: number): number {
  if (wordCount <= 0) return 1;
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE_RU));
}

/** "5 мин чтения" (used by the public pages and the prerenderer). */
export function formatReadingTime(minutes: number | null): string | null {
  if (!minutes || minutes < 1) return null;
  return `${minutes} мин чтения`;
}
