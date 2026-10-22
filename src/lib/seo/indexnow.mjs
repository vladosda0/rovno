// IndexNow: tell Yandex and Bing about new and changed pages in hours instead of
// waiting for a crawl (Yandex Webmaster «Поддержка протокола IndexNow»; protocol
// at indexnow.org). One endpoint is enough: api.indexnow.org passes the
// submission to every engine that supports the protocol. The key file sits at
// the site root, public/<key>.txt, and holds the key itself.
//
// Only rovno.ai is ever submitted: the staging site is closed to crawlers.

export const INDEXNOW_KEY = "db6be34f29ace695979e0ec51135109c";
export const INDEXNOW_HOST = "rovno.ai";
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
/** The protocol accepts at most 10 000 URLs per request. */
export const INDEXNOW_BATCH = 10000;

/**
 * <loc> and <lastmod> of a sitemap, filtered: only https://rovno.ai URLs, only
 * those under `prefix` when given, only those modified on or after `since`
 * (YYYY-MM-DD) when given.
 */
export function sitemapUrls(xml, { since = null, prefix = null } = {}) {
  const out = [];
  for (const m of String(xml ?? "").matchAll(/<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)) {
    const loc = m[1].trim().replace(/&amp;/g, "&");
    let url;
    try {
      url = new URL(loc);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== INDEXNOW_HOST) continue;
    if (prefix && !url.pathname.startsWith(prefix)) continue;
    const lastmod = (m[2] ?? "").slice(0, 10);
    if (since && lastmod && lastmod < since) continue;
    out.push(loc);
  }
  return [...new Set(out)];
}

/** Request bodies for the POST, split into protocol-size batches. */
export function indexNowBodies(urls) {
  const bodies = [];
  for (let i = 0; i < urls.length; i += INDEXNOW_BATCH) {
    bodies.push({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
      urlList: urls.slice(i, i + INDEXNOW_BATCH),
    });
  }
  return bodies;
}
