// RSS feed for Dzen (dzen.ru): dist/blog/dzen.xml.
//
// A separate feed, not feed.xml: Dzen accepts a narrow set of tags in
// content:encoded and wants its own categories, while feed.xml stays the plain
// full-content RSS every other reader gets (R-20261016-33). The prerenderer
// (scripts/prerender-blog.mjs) writes both; this module only shapes text.
//
// Requirements taken from Dzen's help, "Изменение RSS-ленты" (checked
// 16.10.2026: https://dzen.ru/help/ru/website/rss-modify.html):
//   - RSS 2.0, namespaces content / dc / media / atom (the help's example also
//     declares georss; nothing here uses it);
//   - item: `title` is required; `link` is the human-readable article URL with
//     NO utm_* or other parameters; `guid` unique and stable (Dzen updates an
//     item by guid or URL for 7 days, then ignores re-sends); `pubDate` in
//     RFC 822; `description` is the card text; full text in
//     `content:encoded` inside CDATA;
//   - `enclosure` is the cover: JPEG, GIF or PNG (WebP is not on the list),
//     at least 700 px wide; `url` and `type` attributes;
//   - `category`: `format-article` | `format-post`, `index` | `noindex`,
//     `comment-all` | `comment-subscribers` | `comment-none`, and
//     `native-draft` to land as a draft in Studio; no category at all means
//     "publish to the channel as is";
//   - content:encoded tags: p, a, b, i, u, s, h1-h4, blockquote, ul/ol/li
//     (nothing but text inside li), img and figure/figcaption, video/source,
//     embed iframes. Images JPEG/GIF/PNG, 700 px wide or more; an image Dzen
//     cannot read is dropped and the item still publishes;
//   - no more than 500 items per feed; the URL must not be disallowed in
//     robots.txt (/blog/ is open there);
//   - a feed is first accepted with at least 10 items (hence "connect after
//     10 articles", mockup frame 7); later sends should carry fresh items, and
//     an item already taken is matched by guid/URL, so re-listing older posts
//     changes nothing on Dzen's side after its 7-day window.
// Re-checked 16.10.2026 against the live page; nothing above had changed.
// The help also suggests ids on h2-h4 for a table of contents; this feed
// leaves them out (Dzen builds the post without them), see renderNode.
// Not used on purpose: `video`/`iframe` embeds (the H4 contract limits the feed
// to the text tags above; a video becomes a plain link, which Dzen turns into
// a widget for YouTube / VK Video by itself), `author` (only for partners of
// Dzen's seamless-news programme), `pdalink`, `georss`.
//
// Tables are not on Dzen's list, so each table becomes a list: one item per
// data row, "Шапка: значение; Шапка: значение" (the mockup Vlad approved on
// 16.10.2026, frame 7). Everything else outside the list is unwrapped to its
// text. utm_* parameters are cut from every link and image address.
//
// Plain ESM with no DOM of its own, like anchorsConfig.mjs: the caller passes
// a parser (jsdom's DOMParser in the prerenderer, the browser's in tests).

/** Categories every item carries. See the header for what each means. */
export const DZEN_CATEGORIES = ["format-article", "index", "comment-all"];

/** Dzen takes at most this many items per feed. */
export const DZEN_MAX_ITEMS = 500;

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/** Tag in our article HTML → tag Dzen accepts. Missing means "unwrap". */
const INLINE_TAGS = {
  strong: "b",
  b: "b",
  em: "i",
  i: "i",
  u: "u",
  s: "s",
  strike: "s",
  del: "s",
};

const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "blockquote", "ul", "ol"]);

/** Removed with everything inside: nothing a Dzen reader should see as text. */
const DROPPED_TAGS = new Set(["hr", "colgroup", "col", "script", "style", "template", "nav"]);

const IMAGE_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
};

export function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * The address with every utm_* query parameter removed. Relative addresses
 * are resolved against `siteOrigin` (Dzen has no base URL to resolve them
 * against). Returns null for anything that is not http(s) after resolving.
 */
export function stripUtm(value, siteOrigin) {
  if (typeof value !== "string" || value.trim() === "") return null;
  let url;
  try {
    url = new URL(value.trim(), siteOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  }
  return url.href;
}

/** MIME type of a cover Dzen accepts, by file extension; null for the rest. */
export function dzenImageType(src) {
  if (typeof src !== "string") return null;
  let pathname;
  try {
    pathname = new URL(src).pathname;
  } catch {
    return null;
  }
  const match = /\.([a-z0-9]+)$/i.exec(pathname);
  return match ? IMAGE_TYPES[match[1].toLowerCase()] ?? null : null;
}

function normalizeSpace(text) {
  return text.replace(/[ \t\n\r\f]+/g, " ").trim();
}

function children(node) {
  return Array.from(node.childNodes ?? []);
}

function tagName(node) {
  return String(node.tagName ?? node.nodeName ?? "").toLowerCase();
}

/** YouTube embed → watch URL (Dzen turns that link into a player itself). */
function videoLink(src) {
  const match = /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/.exec(src ?? "");
  return match ? `https://www.youtube.com/watch?v=${match[1]}` : src;
}

/** "Шапка: значение; …" per data row; the header row is the first all-th row. */
function tableToList(table) {
  const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.children).filter((cell) => /^(td|th)$/i.test(cell.tagName)),
  );
  const nonEmpty = rows.filter((cells) => cells.length > 0);
  if (nonEmpty.length === 0) return "";
  const cellText = (cell) => normalizeSpace(cell.textContent ?? "");
  const hasHeader = nonEmpty[0].every((cell) => tagName(cell) === "th");
  const header = hasHeader ? nonEmpty[0].map(cellText) : [];
  const body = hasHeader ? nonEmpty.slice(1) : nonEmpty;
  const items = body
    .map((cells) =>
      cells
        .map((cell, index) => {
          const value = cellText(cell);
          const label = header[index];
          return label ? `${label}: ${value}` : value;
        })
        .filter((part) => part !== "")
        .join("; "),
    )
    .filter((line) => line !== "");
  if (items.length === 0) {
    // A header with no data rows still says something; keep it as one line.
    return header.length ? `<p>${escapeXml(header.join("; "))}</p>` : "";
  }
  return `<ul>${items.map((line) => `<li>${escapeXml(line)}</li>`).join("")}</ul>`;
}

function renderInline(nodes, ctx) {
  return nodes.map((node) => renderNode(node, ctx, true)).join("");
}

function renderNode(node, ctx, inline) {
  if (node.nodeType === TEXT_NODE) return escapeXml(node.nodeValue ?? "");
  if (node.nodeType !== ELEMENT_NODE) return "";
  const tag = tagName(node);
  if (DROPPED_TAGS.has(tag)) return "";

  if (tag === "table") return tableToList(node);

  if (tag === "br") return " ";

  if (tag === "a") {
    const raw = node.getAttribute("href") ?? "";
    const inner = renderInline(children(node), ctx);
    // An in-page #anchor points at an id Dzen's copy does not have.
    if (raw.startsWith("#")) return inner;
    const href = stripUtm(raw, ctx.siteOrigin);
    return href ? `<a href="${escapeXml(href)}">${inner}</a>` : inner;
  }

  if (tag === "img") {
    const src = stripUtm(node.getAttribute("src"), ctx.siteOrigin);
    if (!src) return "";
    const alt = node.getAttribute("alt");
    return `<img src="${escapeXml(src)}"${alt ? ` alt="${escapeXml(alt)}"` : ""}>`;
  }

  if (tag === "figure") {
    const img = node.querySelector("img");
    const imgHtml = img ? renderNode(img, ctx, true) : "";
    if (!imgHtml) return "";
    const caption = node.querySelector("figcaption");
    const captionHtml = caption ? renderInline(children(caption), ctx) : "";
    return `<figure>${imgHtml}${captionHtml.trim() ? `<figcaption>${captionHtml}</figcaption>` : ""}</figure>`;
  }

  if (tag === "iframe") {
    const src = stripUtm(videoLink(node.getAttribute("src")), ctx.siteOrigin);
    return src ? `<p><a href="${escapeXml(src)}">${escapeXml(src)}</a></p>` : "";
  }

  if (tag === "li") {
    // Dzen: nothing but text inside a list item.
    const text = normalizeSpace(node.textContent ?? "");
    return text ? `<li>${escapeXml(text)}</li>` : "";
  }

  if (tag === "ul" || tag === "ol") {
    const items = children(node)
      .filter((child) => child.nodeType === ELEMENT_NODE && tagName(child) === "li")
      .map((child) => renderNode(child, ctx, false))
      .join("");
    return items ? `<${tag}>${items}</${tag}>` : "";
  }

  if (tag === "pre") {
    const text = node.textContent ?? "";
    return text.trim() ? `<p>${escapeXml(text)}</p>` : "";
  }

  if (INLINE_TAGS[tag]) {
    const inner = renderInline(children(node), ctx);
    return inner ? `<${INLINE_TAGS[tag]}>${inner}</${INLINE_TAGS[tag]}>` : "";
  }

  if (BLOCK_TAGS.has(tag)) {
    const inner = tag === "blockquote"
      ? children(node).map((child) => renderNode(child, ctx, false)).join("")
      : renderInline(children(node), ctx);
    if (!inner.trim()) return "";
    // A block met inside inline content (a p in a figcaption) keeps its text.
    return inline ? inner : `<${tag}>${inner}</${tag}>`;
  }

  // div (FAQ wrappers), span, code, and anything else: unwrap.
  return children(node).map((child) => renderNode(child, ctx, inline)).join("");
}

/**
 * Article HTML (already sanitized) → HTML with only the tags Dzen accepts.
 * `parseHtml` returns a document whose `body` holds the parsed fragment.
 */
export function dzenArticleHtml(html, parseHtml, siteOrigin) {
  const doc = parseHtml(html ?? "");
  const ctx = { siteOrigin };
  return children(doc.body).map((node) => renderNode(node, ctx, false)).join("");
}

/** CDATA body; a literal "]]>" in the text is split across two sections. */
function cdata(value) {
  return `<![CDATA[${String(value).replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

/**
 * One <item>. `post` carries slug, title, excerpt, cover_image_url and
 * published_at; `bodyHtml` is dzenArticleHtml() of its content.
 */
export function dzenItemXml(post, bodyHtml, siteOrigin) {
  const url = stripUtm(`${siteOrigin}/blog/${post.slug}/`, siteOrigin);
  const pubDate = post.published_at ? new Date(post.published_at).toUTCString() : "";
  const cover = stripUtm(post.cover_image_url, siteOrigin);
  const coverType = cover ? dzenImageType(cover) : null;
  const lines = [
    "    <item>",
    `      <title>${escapeXml(post.title)}</title>`,
    `      <link>${escapeXml(url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
  ];
  if (pubDate) lines.push(`      <pubDate>${pubDate}</pubDate>`);
  lines.push('      <media:rating scheme="urn:simple">nonadult</media:rating>');
  for (const category of DZEN_CATEGORIES) lines.push(`      <category>${category}</category>`);
  if (cover && coverType) {
    lines.push(`      <enclosure url="${escapeXml(cover)}" type="${coverType}"/>`);
  }
  if (post.excerpt) lines.push(`      <description>${escapeXml(post.excerpt)}</description>`);
  lines.push(`      <content:encoded>${cdata(bodyHtml)}</content:encoded>`);
  lines.push("    </item>");
  return lines.join("\n");
}

/**
 * The whole feed. `posts` newest first (published only); `renderBody(post)`
 * returns dzenArticleHtml() of that post. At most DZEN_MAX_ITEMS items.
 */
export function dzenFeedXml(posts, { siteOrigin, title, description, renderBody }) {
  const items = posts
    .slice(0, DZEN_MAX_ITEMS)
    .map((post) => dzenItemXml(post, renderBody(post), siteOrigin))
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(`${siteOrigin}/blog/`)}</link>
    <atom:link href="${escapeXml(`${siteOrigin}/blog/dzen.xml`)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(description)}</description>
    <language>ru</language>
${items}
  </channel>
</rss>
`;
}
