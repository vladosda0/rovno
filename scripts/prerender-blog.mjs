#!/usr/bin/env node
// Build-time blog prerenderer (runs after `vite build`, see package.json).
//
// Why: the site is a static SPA on Timeweb (no server control), while the
// crawlers that matter for the blog's mission — YandexBot, GPTBot, ClaudeBot,
// PerplexityBot — fetch raw HTML and execute little or no JS. This script
// gives every published article a real static HTML file on the SAME domain:
//
//   dist/blog/index.html            — article list (crawlable <a> links)
//   dist/blog/<slug>/index.html     — full article HTML + meta + JSON-LD
//   dist/sitemap.xml                — static routes + articles
//   dist/blog/feed.xml              — RSS 2.0 with full content
//   dist/llms.txt                   — LLM-crawler orientation file
//
// Mechanics: takes dist/index.html as the app shell, swaps the head tags for
// per-page SEO tags, injects the article markup into #root (React re-renders
// over it on hydration; the inlined __BLOG_*_DATA__ JSON feeds React Query's
// initialData so the client paints identical content with no refetch), and
// links the CSS chunks that carry the .rv-landing/.rv-article styles (they
// are code-split out of the entry CSS).
//
// Fail-soft by design: with no reachable Supabase (CI placeholder env, local
// offline builds) it still writes a static-routes-only sitemap and exits 0 —
// a broken blog fetch must never fail the product build. Publishing flow:
// articles appear on the site instantly (SPA reads the DB), and get their
// static SEO snapshot on the next deploy.
//
// Keep the head/JSON-LD shapes in sync with src/lib/blog/seo.ts and
// src/lib/blog/jsonld.ts (the runtime twins).

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIST = path.join(ROOT, "dist");

const SITE_ORIGIN = "https://rovno.ai";
const SITE_NAME = "Ровно ИИ";
const BLOG_TITLE = "Блог Ровно";
const BLOG_DESCRIPTION =
  "Статьи команды Ровно о том, как вести стройку без хаоса: сметы, закупки, приёмка работ, контроль подрядчиков и ИИ на объекте.";

const STATIC_ROUTES = ["/", "/blog/", "/offer", "/privacy", "/refund", "/contacts"];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const escapeXml = escapeHtml;

/** JSON safe to embed in <script> (no `</script>` breakout). */
function jsonForScriptTag(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function formatDateRu(iso) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(iso),
  );
}

function readingTimeLabel(minutes) {
  if (!minutes || minutes < 1) return null;
  return `${minutes} мин чтения`;
}

function log(message) {
  console.log(`[prerender-blog] ${message}`);
}

// ---------------------------------------------------------------------------
// Env: process.env first, then .env.local / .env (KEY=VALUE lines)
// ---------------------------------------------------------------------------

async function loadEnvFallback() {
  const wanted = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
  const out = {};
  for (const key of wanted) {
    if (process.env[key]) out[key] = process.env[key];
  }
  for (const file of [".env.local", ".env"]) {
    if (wanted.every((k) => out[k])) break;
    const filePath = path.join(ROOT, file);
    if (!existsSync(filePath)) continue;
    const text = await readFile(filePath, "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*("?)(.*)\2\s*$/);
      if (match && wanted.includes(match[1]) && !out[match[1]]) {
        out[match[1]] = match[3];
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const POST_COLUMNS =
  "id,author_id,slug,title,subtitle,excerpt,content,content_html,cover_image_url," +
  "seo_title,seo_description,tags,locale,status,published_at,reading_time_minutes," +
  "word_count,created_at,updated_at,author:blog_authors(id,display_name,avatar_url,bio)";

async function fetchPublishedPosts(env) {
  const base = env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) {
    throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set");
  }
  const url =
    `${base}/rest/v1/blog_posts?select=${encodeURIComponent(POST_COLUMNS)}` +
    `&status=eq.published&order=published_at.desc`;
  const response = await fetch(url, {
    headers: { apikey: key, authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`PostgREST ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return await response.json();
}

// ---------------------------------------------------------------------------
// Template handling
// ---------------------------------------------------------------------------

/** CSS chunks carrying the landing/blog design system (code-split away from
 * the entry CSS, so prerendered pages must link them explicitly). */
async function findBlogCssAssets() {
  const assetsDir = path.join(DIST, "assets");
  const result = [];
  for (const file of await readdir(assetsDir)) {
    if (!file.endsWith(".css")) continue;
    const text = await readFile(path.join(assetsDir, file), "utf8");
    if (text.includes(".rv-landing") || text.includes(".rv-article")) {
      result.push(`/assets/${file}`);
    }
  }
  return result;
}

function buildHeadTags(page) {
  const tags = [];
  if (page.canonicalPath) {
    const canonical = `${SITE_ORIGIN}${page.canonicalPath}`;
    tags.push(`<link rel="canonical" href="${escapeHtml(canonical)}" />`);
    tags.push(`<meta property="og:url" content="${escapeHtml(canonical)}" />`);
  }
  tags.push(`<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`);
  if (page.article) {
    if (page.article.publishedTime) {
      tags.push(`<meta property="article:published_time" content="${escapeHtml(page.article.publishedTime)}" />`);
    }
    if (page.article.modifiedTime) {
      tags.push(`<meta property="article:modified_time" content="${escapeHtml(page.article.modifiedTime)}" />`);
    }
    for (const tag of page.article.tags ?? []) {
      tags.push(`<meta property="article:tag" content="${escapeHtml(tag)}" />`);
    }
  }
  if (page.jsonLd) {
    tags.push(`<script type="application/ld+json" id="rv-jsonld">${jsonForScriptTag(page.jsonLd)}</script>`);
  }
  for (const href of page.cssAssets ?? []) {
    tags.push(`<link rel="stylesheet" href="${escapeHtml(href)}" />`);
  }
  return tags.join("\n    ");
}

/** Render a page from the app-shell template: swap title/description/OG,
 * append head extras, inject #root markup + inlined data script. */
function renderPage(template, page) {
  let html = template;

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`);
  html = html.replace(
    /<meta name="description"[^>]*\/>/,
    `<meta name="description" content="${escapeHtml(page.description)}" />`,
  );
  html = html.replace(
    /<meta property="og:title"[^>]*\/>/,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
  );
  html = html.replace(
    /<meta property="og:description"[^>]*\/>/,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
  );
  html = html.replace(
    /<meta property="og:type"[^>]*\/>/,
    `<meta property="og:type" content="${page.ogType ?? "website"}" />`,
  );
  if (page.ogImage) {
    html = html.replace(
      /<meta property="og:image"[^>]*\/>/,
      `<meta property="og:image" content="${escapeHtml(page.ogImage)}" />`,
    );
    html = html.replace(
      /<meta name="twitter:card"[^>]*\/>/,
      `<meta name="twitter:card" content="summary_large_image" />`,
    );
  }
  html = html.replace(
    /<meta name="twitter:title"[^>]*\/>/,
    `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`,
  );

  html = html.replace("</head>", `    ${buildHeadTags(page)}\n  </head>`);

  const dataScript = page.inlineData
    ? `<script type="application/json" id="${page.inlineData.id}">${jsonForScriptTag(page.inlineData.value)}</script>\n    `
    : "";
  html = html.replace(
    /<div id="root"><\/div>/,
    `<div id="root">${page.rootHtml}</div>\n    ${dataScript}`,
  );

  return html;
}

// ---------------------------------------------------------------------------
// Markup builders (mirror the React components' classes so the linked CSS
// chunks style the static HTML identically)
// ---------------------------------------------------------------------------

function postCardHtml(post) {
  const meta = [formatDateRu(post.published_at), readingTimeLabel(post.reading_time_minutes)]
    .filter(Boolean)
    .join(" · ");
  const cover = post.cover_image_url
    ? `<img class="rv-blog-card__cover" src="${escapeHtml(post.cover_image_url)}" alt="${escapeHtml(post.title)}" loading="lazy" />`
    : `<div class="rv-blog-card__cover--empty" aria-hidden="true">ровно</div>`;
  const excerpt = post.excerpt ?? post.subtitle;
  return `<a class="rv-blog-card" href="/blog/${escapeHtml(post.slug)}/">
    ${cover}
    <div class="rv-blog-card__body">
      ${meta ? `<span class="rv-blog-card__meta">${escapeHtml(meta)}</span>` : ""}
      <h3 class="rv-blog-card__title">${escapeHtml(post.title)}</h3>
      ${excerpt ? `<p class="rv-blog-card__excerpt">${escapeHtml(excerpt)}</p>` : ""}
    </div>
  </a>`;
}

function pageChromeStart() {
  return `<div class="rv-landing"><header style="padding:24px 48px;border-bottom:1px solid var(--line-blue-soft)"><a href="/" style="display:inline-flex"><img src="/logo.svg" alt="ровно" style="height:52px;width:auto" /></a></header>`;
}

function pageChromeEnd() {
  return `<footer style="padding:48px;background:var(--rv-ink);color:var(--rv-cream);font-family:var(--font-body);font-size:13px"><a href="/" style="color:var(--rv-cream)">rovno.ai</a> — ИИ-супервайзер стройки</footer></div>`;
}

function blogIndexHtml(posts) {
  return `${pageChromeStart()}
  <main>
    <section class="rv-section" style="padding:64px 48px 48px">
      <span class="rv-caption" style="font-size:12px;color:var(--rv-blue)">БЛОГ</span>
      <h1 style="font-family:var(--font-display);font-size:64px;line-height:1;letter-spacing:-0.03em;color:var(--rv-blue);margin:16px 0 0">Разбираем, как строить ровно</h1>
      <p style="font-family:var(--font-body);font-size:18px;line-height:26px;color:var(--rv-blue);opacity:.8;max-width:560px">${escapeHtml(BLOG_DESCRIPTION)}</p>
    </section>
    <section class="rv-section" style="padding:0 48px 128px">
      <div class="rv-blog-grid" style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px">
        ${posts.map(postCardHtml).join("\n        ")}
      </div>
    </section>
  </main>
  ${pageChromeEnd()}`;
}

function articleHtml(post) {
  const meta = [formatDateRu(post.published_at), readingTimeLabel(post.reading_time_minutes)]
    .filter(Boolean)
    .join(" · ");
  const tagsLine = (post.tags ?? []).map((t) => `#${t}`).join("  ");
  return `${pageChromeStart()}
  <main>
    <article>
      <section class="rv-section" style="padding:64px 48px 0">
        <header class="rv-article-header">
          <span class="rv-caption" style="font-size:12px;color:var(--rv-blue)">${escapeHtml([meta, tagsLine].filter(Boolean).join("   "))}</span>
          <h1 class="rv-article-title">${escapeHtml(post.title)}</h1>
          ${post.subtitle ? `<p class="rv-article-subtitle">${escapeHtml(post.subtitle)}</p>` : ""}
          ${post.author ? `<p style="font-family:var(--font-body);font-size:14px;color:var(--rv-blue)">${escapeHtml(post.author.display_name)}</p>` : ""}
        </header>
        ${post.cover_image_url ? `<div class="rv-article-cover"><img src="${escapeHtml(post.cover_image_url)}" alt="${escapeHtml(post.title)}" /></div>` : ""}
      </section>
      <section class="rv-section" style="padding:48px 48px 96px">
        <div class="rv-article">${post.content_html}</div>
      </section>
    </article>
    <nav class="rv-section" style="padding:0 48px 96px;font-family:var(--font-body)">
      <a href="/blog/" style="color:var(--rv-blue)">← Все статьи</a>
    </nav>
  </main>
  ${pageChromeEnd()}`;
}

// ---------------------------------------------------------------------------
// JSON-LD (mirrors src/lib/blog/jsonld.ts)
// ---------------------------------------------------------------------------

const PUBLISHER = {
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_ORIGIN,
  logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/rovno-logo.png` },
};

function articleJsonLd(post) {
  const url = `${SITE_ORIGIN}/blog/${post.slug}/`;
  const article = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.seo_description ?? post.excerpt ?? undefined,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    inLanguage: post.locale === "en" ? "en" : "ru-RU",
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at,
    publisher: PUBLISHER,
  };
  if (post.cover_image_url) article.image = [post.cover_image_url];
  if (post.author) article.author = { "@type": "Person", name: post.author.display_name };
  if (post.word_count) article.wordCount = post.word_count;
  if (post.tags?.length) article.keywords = post.tags.join(", ");
  const breadcrumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: SITE_ORIGIN },
      { "@type": "ListItem", position: 2, name: BLOG_TITLE, item: `${SITE_ORIGIN}/blog/` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };
  return [article, breadcrumbs];
}

function blogIndexJsonLd(posts) {
  return {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: BLOG_TITLE,
    url: `${SITE_ORIGIN}/blog/`,
    inLanguage: "ru-RU",
    publisher: PUBLISHER,
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${SITE_ORIGIN}/blog/${post.slug}/`,
      datePublished: post.published_at ?? undefined,
    })),
  };
}

// ---------------------------------------------------------------------------
// Feeds / sitemap / llms.txt
// ---------------------------------------------------------------------------

function sitemapXml(posts) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [];
  for (const route of STATIC_ROUTES) {
    urls.push(`  <url><loc>${escapeXml(SITE_ORIGIN + route)}</loc><lastmod>${today}</lastmod></url>`);
  }
  for (const post of posts) {
    const lastmod = (post.updated_at ?? post.published_at ?? "").slice(0, 10) || today;
    urls.push(
      `  <url><loc>${escapeXml(`${SITE_ORIGIN}/blog/${post.slug}/`)}</loc><lastmod>${lastmod}</lastmod></url>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>
`;
}

function rssXml(posts) {
  const items = posts
    .map((post) => {
      const url = `${SITE_ORIGIN}/blog/${post.slug}/`;
      const pubDate = post.published_at ? new Date(post.published_at).toUTCString() : "";
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}
      ${post.excerpt ? `<description>${escapeXml(post.excerpt)}</description>` : ""}
      <content:encoded><![CDATA[${(post.content_html ?? "").replaceAll("]]>", "]]]]><![CDATA[>")}]]></content:encoded>
    </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(BLOG_TITLE)}</title>
    <link>${SITE_ORIGIN}/blog/</link>
    <atom:link href="${SITE_ORIGIN}/blog/feed.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(BLOG_DESCRIPTION)}</description>
    <language>ru</language>
${items}
  </channel>
</rss>
`;
}

function llmsTxt(posts) {
  const lines = [
    `# ${SITE_NAME} (rovno.ai)`,
    "",
    "> Ровно — ИИ-супервайзер стройки: рабочее пространство, где смета, задачи,",
    "> закупки, фотофиксация и документы собраны в одном месте. Для заказчиков,",
    "> подрядчиков и строительных компаний в России.",
    "",
    "## Продукт",
    `- [Главная](${SITE_ORIGIN}/): что делает Ровно`,
    `- [Тарифы](${SITE_ORIGIN}/#pricing): Бесплатно / Мастер / Бригада`,
    "",
    "## Блог — статьи о стройке",
    `- [Все статьи](${SITE_ORIGIN}/blog/)`,
    `- [RSS](${SITE_ORIGIN}/blog/feed.xml)`,
  ];
  for (const post of posts) {
    const desc = (post.seo_description ?? post.excerpt ?? "").replace(/\s+/g, " ").trim();
    lines.push(`- [${post.title}](${SITE_ORIGIN}/blog/${post.slug}/)${desc ? `: ${desc}` : ""}`);
  }
  lines.push("", "## Контакты", `- Email: vlad@rovno.ai`, `- Telegram: https://t.me/stroyrovno`, "");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const templatePath = path.join(DIST, "index.html");
  if (!existsSync(templatePath)) {
    console.error("[prerender-blog] dist/index.html not found — run `vite build` first.");
    process.exit(1);
  }
  const template = await readFile(templatePath, "utf8");

  let posts = [];
  let dataOk = false;
  try {
    const env = await loadEnvFallback();
    posts = await fetchPublishedPosts(env);
    dataOk = true;
    log(`fetched ${posts.length} published post(s)`);
  } catch (error) {
    log(`WARN: blog fetch failed — emitting static-only artifacts (${error.message})`);
  }

  // sitemap.xml is always written (static routes at minimum).
  await writeFile(path.join(DIST, "sitemap.xml"), sitemapXml(posts), "utf8");
  log("wrote sitemap.xml");

  await writeFile(path.join(DIST, "llms.txt"), llmsTxt(posts), "utf8");
  log("wrote llms.txt");

  if (!dataOk) return;

  const cssAssets = await findBlogCssAssets();
  log(`blog css chunks: ${cssAssets.join(", ") || "none found"}`);

  // Blog index
  const indexHtml = renderPage(template, {
    title: `${BLOG_TITLE} — стройка без хаоса`,
    description: BLOG_DESCRIPTION,
    canonicalPath: "/blog/",
    ogType: "website",
    jsonLd: posts.length > 0 ? blogIndexJsonLd(posts) : null,
    cssAssets,
    rootHtml: blogIndexHtml(posts),
    inlineData: { id: "__BLOG_LIST_DATA__", value: posts },
  });
  await mkdir(path.join(DIST, "blog"), { recursive: true });
  await writeFile(path.join(DIST, "blog", "index.html"), indexHtml, "utf8");
  log("wrote blog/index.html");

  // Articles
  for (const post of posts) {
    const pageHtml = renderPage(template, {
      title: `${post.seo_title ?? post.title} — ${BLOG_TITLE}`,
      description: post.seo_description ?? post.excerpt ?? BLOG_DESCRIPTION,
      canonicalPath: `/blog/${post.slug}/`,
      ogType: "article",
      ogImage: post.cover_image_url,
      article: {
        publishedTime: post.published_at,
        modifiedTime: post.updated_at,
        tags: post.tags ?? [],
      },
      jsonLd: articleJsonLd(post),
      cssAssets,
      rootHtml: articleHtml(post),
      inlineData: { id: "__BLOG_POST_DATA__", value: post },
    });
    const dir = path.join(DIST, "blog", post.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), pageHtml, "utf8");
  }
  log(`wrote ${posts.length} article page(s)`);

  await writeFile(path.join(DIST, "blog", "feed.xml"), rssXml(posts), "utf8");
  log("wrote blog/feed.xml");
}

await main();
