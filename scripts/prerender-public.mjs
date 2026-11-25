#!/usr/bin/env node
// Build-time prerender of the public pages: the landing and the four legal
// pages (site-redesign 1.2). Runs LAST in `npm run build`, after
// prerender-blog.mjs and prerender-kb.mjs, because both of those use
// dist/index.html as an empty app-shell template, and this script fills its
// #root with the landing markup.
//
//   dist/index.html                   — landing markup + head (also the SPA
//                                       fallback: a pre-paint guard hides the
//                                       markup on every other address)
//   dist/<offer|privacy|refund|contacts>/index.html — page markup + head
//
// The markup comes from dist-ssr/public-pages.js (`vite build --ssr
// src/ssr/public-pages.tsx`): the same React components the browser renders.
// A render error FAILS the build: a broken public page must not ship silently.

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { injectPublicPage } from "./lib/public-prerender.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const SSR_ENTRY = path.join(ROOT, "dist-ssr", "public-pages.js");

function log(message) {
  console.log(`[prerender-public] ${message}`);
}

/** CSS chunks that carry the public site's styles (code-split from the entry). */
async function findSiteCssAssets() {
  const assetsDir = path.join(DIST, "assets");
  const result = [];
  for (const file of await readdir(assetsDir)) {
    if (!file.endsWith(".css")) continue;
    const text = await readFile(path.join(assetsDir, file), "utf8");
    if (text.includes(".rv-site")) result.push(`/assets/${file}`);
  }
  return result;
}

/** The three latest posts, from the list prerender-blog.mjs inlined into /blog/. */
async function readLatestPosts() {
  const file = path.join(DIST, "blog", "index.html");
  if (!existsSync(file)) return [];
  const html = await readFile(file, "utf8");
  const match = html.match(/<script type="application\/json" id="__BLOG_LIST_DATA__">([\s\S]*?)<\/script>/);
  if (!match) return [];
  try {
    return JSON.parse(match[1]).slice(0, 3);
  } catch {
    return [];
  }
}

async function main() {
  const shellPath = path.join(DIST, "index.html");
  if (!existsSync(shellPath)) {
    console.error("[prerender-public] dist/index.html not found — run `vite build` first.");
    process.exit(1);
  }
  if (!existsSync(SSR_ENTRY)) {
    console.error("[prerender-public] dist-ssr/public-pages.js not found — run `vite build --ssr src/ssr/public-pages.tsx --outDir dist-ssr` first.");
    process.exit(1);
  }
  const { renderPublicPage, PUBLIC_PAGE_ROUTES } = await import(pathToFileURL(SSR_ENTRY).href);
  const shell = await readFile(shellPath, "utf8");
  const cssAssets = await findSiteCssAssets();
  const posts = await readLatestPosts();
  log(`site css chunks: ${cssAssets.join(", ") || "none"}; posts for the landing feed: ${posts.length}`);

  for (const route of PUBLIC_PAGE_ROUTES) {
    const file = route === "/" ? shellPath : path.join(DIST, ...route.split("/").filter(Boolean), "index.html");
    const template = existsSync(file) ? await readFile(file, "utf8") : shell;
    const rendered = renderPublicPage(route, { posts });
    const html = injectPublicPage(template, { ...rendered, cssAssets: rendered.rootHtml.includes("rv-site") ? cssAssets : [] });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, html, "utf8");
    log(`wrote ${path.relative(DIST, file)} (${rendered.rootHtml.length} chars of markup)`);
  }
}

await main();
