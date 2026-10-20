#!/usr/bin/env node
// Build-time prerenderer for the public knowledge base (docs-library, step 1.5).
// Runs after scripts/prerender-blog.mjs (see package.json "build").
//
//   dist/baza/<slug>/index.html   — one static page per published kb_documents row
//   dist/sitemap.xml              — the blog's sitemap, extended with those pages
//
// Same mechanics and env as the blog prerenderer: the app shell is dist/index.html,
// the data comes from Supabase REST with the public publishable key
// (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from process.env, then
// .env.local / .env). Anon RLS serves published rows only.
//
// Fail-soft: with no env or no network it logs a warning and exits 0 with zero
// pages. A knowledge-base fetch must never fail the product build.
//
// Landing-canonical guard (same shape as prerender-blog's): when the fetch failed
// and this run wrote ZERO pages, the canonical «/» that
// prerender-blog stamped into dist/index.html is removed again, because that file
// is the SPA fallback every /baza/<slug>/ URL would then be served, and a landing
// canonical on it declares the whole knowledge base a duplicate of the home page.
//
// The pure half (HTML, escaping, sitemap) is src/lib/knowledge-base/kbPrerenderConfig.mjs.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createTranslator,
  fallbackShellWithoutKbPages,
  isSafeSlug,
  kbPageHtml,
  kbSitemapUrls,
  mergeIntoSitemap,
} from "../src/lib/knowledge-base/kbPrerenderConfig.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PAGE_ROWS = 1000;
const MAX_PAGES = 100; // 100k rows: a runaway guard, the registry is ~7k

const COLUMNS =
  "doc_id,slug,designation,title,category,folder,display_mode,object_types,domains," +
  "applicability_note,publisher,country,edition,effective_from,last_checked_at,source_links," +
  "full_text_available,updated_at";

function log(message) {
  console.log(`[prerender-kb] ${message}`);
}

async function loadEnv() {
  const wanted = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
  const out = {};
  for (const key of wanted) if (process.env[key]) out[key] = process.env[key];
  for (const file of [".env.local", ".env"]) {
    if (wanted.every((k) => out[k])) break;
    const filePath = path.join(ROOT, file);
    if (!existsSync(filePath)) continue;
    const text = await readFile(filePath, "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*("?)(.*)\2\s*$/);
      if (match && wanted.includes(match[1]) && !out[match[1]]) out[match[1]] = match[3];
    }
  }
  return out;
}

async function fetchPublishedDocuments(env) {
  const base = env.VITE_SUPABASE_URL?.replace(/\/$/, "");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set");
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_ROWS;
    const url =
      `${base}/rest/v1/kb_documents?select=${encodeURIComponent(COLUMNS)}` +
      `&is_published=eq.true&order=slug.asc`;
    const response = await fetch(url, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "Range-Unit": "items",
        Range: `${from}-${from + PAGE_ROWS - 1}`,
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status === 404 && page === 0) {
      log("knowledge base table is not on this backend yet — writing 0 pages");
      return rows;
    }
    if (!response.ok) {
      throw new Error(`PostgREST ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error("PostgREST returned a non-array body");
    rows.push(...batch);
    if (batch.length < PAGE_ROWS) return rows;
  }
  log(`WARN: stopped after ${MAX_PAGES} pages`);
  return rows;
}

/** CSS chunks carrying the landing/blog styles (code-split out of the entry CSS). */
async function findLandingCssAssets() {
  const assetsDir = path.join(DIST, "assets");
  if (!existsSync(assetsDir)) return [];
  const result = [];
  for (const file of await readdir(assetsDir)) {
    if (!file.endsWith(".css")) continue;
    const text = await readFile(path.join(assetsDir, file), "utf8");
    if (text.includes(".rv-landing") || text.includes(".rv-kb-facts")) result.push(`/assets/${file}`);
  }
  return result;
}

const TEMPLATE_PATH = path.join(DIST, "index.html");

/** Returns the number of pages written; 0 on every soft-failure path. */
async function writePages(outcome) {
  const templatePath = TEMPLATE_PATH;
  if (!existsSync(templatePath)) {
    log("WARN: dist/index.html not found — run `vite build` first; skipping knowledge base pages");
    return 0;
  }

  let rows;
  try {
    const env = await loadEnv();
    if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY) {
      log("WARN: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are not set — writing 0 pages");
      return 0;
    }
    outcome.fetchFailed = true;
    rows = await fetchPublishedDocuments(env);
    outcome.fetchFailed = false;
    log(`fetched ${rows.length} published document(s)`);
  } catch (error) {
    log(`WARN: knowledge base fetch failed — writing 0 pages (${error?.message ?? error})`);
    return 0;
  }

  const rows_ = rows.filter((row) => isSafeSlug(row?.slug));
  if (rows_.length !== rows.length) log(`WARN: skipped ${rows.length - rows_.length} row(s) with an unusable slug`);
  if (rows_.length === 0) {
    log("WARN: no publishable knowledge base documents — writing 0 pages");
    return 0;
  }

  const template = await readFile(templatePath, "utf8");
  const ru = JSON.parse(await readFile(path.join(ROOT, "src", "locales", "ru.json"), "utf8"));
  const t = createTranslator(ru);
  const cssAssets = await findLandingCssAssets();

  outcome.fetchFailed = true;
  for (const row of rows_) {
    const dir = path.join(DIST, "baza", row.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), kbPageHtml(template, row, t, cssAssets), "utf8");
  }
  log(`wrote ${rows_.length} page(s) under baza/`);

  const sitemapPath = path.join(DIST, "sitemap.xml");
  const existing = existsSync(sitemapPath) ? await readFile(sitemapPath, "utf8") : null;
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(sitemapPath, mergeIntoSitemap(existing, kbSitemapUrls(rows_, today)), "utf8");
  log(`added ${rows_.length} url(s) to sitemap.xml`);
  outcome.fetchFailed = false;
  return rows_.length;
}

async function main() {
  let written = 0;
  const outcome = { fetchFailed: false };
  try {
    written = await writePages(outcome);
  } finally {
    if (existsSync(TEMPLATE_PATH)) {
      const shell = fallbackShellWithoutKbPages(await readFile(TEMPLATE_PATH, "utf8"),
        { pagesWritten: written, fetchFailed: outcome.fetchFailed });
      if (shell !== null) {
        await writeFile(TEMPLATE_PATH, shell, "utf8");
        log("WARN: removed the landing canonical from the SPA fallback — the knowledge base fetch failed and no /baza/ page was written");
      }
    }
  }
}

try {
  await main();
} catch (error) {
  // Fail-soft on anything unexpected too: the product build must not die here.
  log(`WARN: unexpected error — knowledge base pages may be incomplete (${error?.stack ?? error})`);
}
process.exit(0);
