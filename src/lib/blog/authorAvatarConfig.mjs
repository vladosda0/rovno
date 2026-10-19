// Author avatar shapes, shared by the live SPA (components/blog/AuthorByline)
// and the build-time prerenderer (scripts/prerender-blog.mjs), like the other
// *Config.mjs modules: the static snapshot and the hydrated page must draw the
// same avatar.
//
// The poses of Shurik, the system author, live in /shurik/ (public/shurik/*):
// full-figure stickers on a transparent background. A round crop cuts them,
// so they render whole and a little larger (Vlad, 19.10.2026). Human authors
// keep the round photo.

/** Byline next to the article title. */
export const STICKER_LINE_HEIGHT = 48;
/** "Об авторе" card. */
export const STICKER_BIO_HEIGHT = 88;
/** public/shurik/avatar.png is 355x373; width attributes keep this ratio. */
const STICKER_RATIO = 355 / 373;

export function stickerWidth(height) {
  return Math.round(height * STICKER_RATIO);
}

/** True for an avatar from Shurik's pose folder, on any origin. */
export function isStickerAvatar(url) {
  if (typeof url !== "string" || url.trim() === "") return false;
  try {
    return new URL(url, "https://rovno.ai").pathname.startsWith("/shurik/");
  } catch {
    return false;
  }
}
