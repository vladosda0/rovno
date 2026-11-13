#!/usr/bin/env node
// Build-time prerenderer for the public knowledge base (docs-library, step 1.5).
// Runs after scripts/prerender-blog.mjs (see package.json "build").
//
//   dist/baza/<slug>/index.html   — one static page per published kb_documents row
//   dist/baza/resheniya/[<slug>/]  — «Решения» (slice 4): the folder and one page per
//                                    published card, none while no card is published
//   dist/baza/izmeneniya/         — «Что изменилось» (slice 8), when kb_changes_feed answers
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
  KB_RESERVED_SLUGS,
  createTranslator,
  fallbackShellWithoutKbPages,
  isSafeSlug,
  kbChangesPageHtml,
  kbChangesSitemapUrls,
  kbFolderPageHtml,
  kbHubSitemapUrls,
  kbIndexPageHtml,
  kbPageHtml,
  kbSitemapUrls,
  kbSolutionPages,
  kbSolutionSitemapUrls,
  kbUsableSolutionRows,
  mergeIntoSitemap,
  sortKbRows,
} from "../src/lib/knowledge-base/kbPrerenderConfig.mjs";
import {
  KB_FOLDER_PAGE_SIZE,
  KB_INDEX_PATH,
  STAGING_ROBOTS_TXT,
  isStagingBackend,
  kbFolderPageCount,
  kbFolderPath,
  kbLlmsSection,
} from "../src/lib/knowledge-base/kbSeo.mjs";
import { KB_FOLDERS, normalizeKbRow } from "../src/lib/knowledge-base/kbConfig.mjs";
import { KB_SOLUTION_SELECT, normalizeKbSolution, sortKbSolutions } from "../src/lib/knowledge-base/kbSolutions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const PAGE_ROWS = 1000;
const MAX_PAGES = 100; // 100k rows: a runaway guard, the registry is ~7k

const COLUMNS =
  "doc_id,slug,designation,title,category,folder,display_mode,object_types,domains," +
  "applicability_note,publisher,country,edition,effective_from,last_checked_at,source_links," +
  "full_text_available,updated_at,doc_status,doc_status_since,replaced_by,edition_date,text_checked_at," +
  "text_source_url,text_pdf_url,text_label,text_base_year,applied_amendments,pending_amendments,recognized_from_scan,upcoming_amendments,text_unavailable_reason";

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

/**
 * Clauses of one document and the SP switch, read as anon like the rows: RLS
 * returns no clauses while the switch is off, so a switched-off build renders
 * the slice-1 page.
 */
async function fetchAnon(env, pathAndQuery, range) {
  const base = env.VITE_SUPABASE_URL.replace(/\/$/, "");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${base}/rest/v1/${pathAndQuery}`, {
    headers: { apikey: key, authorization: `Bearer ${key}`, ...(range ? { "Range-Unit": "items", Range: range } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`PostgREST ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function fetchSpFullText(env) {
  try {
    const rows = await fetchAnon(env, "kb_settings?select=value&key=eq.sp_full_text");
    return Array.isArray(rows) && rows[0]?.value === true;
  } catch (error) {
    log(`WARN: SP switch fetch failed, SP pages without text (${error?.message ?? error})`);
    return false;
  }
}

async function fetchClausesOrNone(env, docId) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchClauses(env, docId);
    } catch (error) {
      if (attempt >= 2) {
        log(`WARN: clauses of ${docId} failed twice, page without text (${error?.message ?? error})`);
        return null;
      }
    }
  }
}

async function fetchClauses(env, docId) {
  const out = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const batch = await fetchAnon(
      env,
      `kb_clauses?select=anchor,number,level,heading,body,position,amendments&doc_id=eq.${encodeURIComponent(docId)}&order=position.asc`,
      `${from}-${from + PAGE_ROWS - 1}`,
    );
    if (!Array.isArray(batch)) return out;
    out.push(...batch);
    if (batch.length < PAGE_ROWS) return out;
  }
}

/**
 * Published «Решения» cards with their facts, read as anon (RLS: published only).
 * The SP switch does not touch them (decision 12.10). Fail-soft: a failed read
 * writes no card pages and leaves the documents alone.
 */
async function fetchSolutionsOrNone(env) {
  try {
    const select = encodeURIComponent(KB_SOLUTION_SELECT.replace(/\s+/g, ""));
    const rows = await fetchAnon(env, `kb_solutions?select=${select}&status=eq.published&order=slug.asc`);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    log(`WARN: solutions fetch failed, no /baza/resheniya/ pages (${error?.message ?? error})`);
    return [];
  }
}

/**
 * «Что изменилось» rows from kb_changes_feed (slice 8), read as anon. Null when
 * the backend has no such function yet or the read failed: then no page is
 * written, rather than an empty one claiming nothing has changed.
 */
async function fetchChangesOrNone(env) {
  try {
    const base = env.VITE_SUPABASE_URL.replace(/\/$/, "");
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const response = await fetch(`${base}/rest/v1/rpc/kb_changes_feed`, {
      method: "POST",
      headers: { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_limit: 300 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      log(`WARN: kb_changes_feed answered ${response.status}, no /baza/izmeneniya/ page`);
      return null;
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows : null;
  } catch (error) {
    log(`WARN: changes fetch failed, no /baza/izmeneniya/ page (${error?.message ?? error})`);
    return null;
  }
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

  const rows_ = rows.filter((row) => isSafeSlug(row?.slug) && !KB_RESERVED_SLUGS.has(row.slug));
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
  const env = await loadEnv();
  const spFullText = await fetchSpFullText(env);
  let withText = 0;
  let degraded = 0;
  for (const row of rows_) {
    const dir = path.join(DIST, "baza", row.slug);
    await mkdir(dir, { recursive: true });
    let clauses = [];
    if (row.full_text_available === true && (row.folder !== "sp" || spFullText)) {
      clauses = await fetchClausesOrNone(env, row.doc_id);
      if (clauses === null) { degraded += 1; clauses = []; }
    }
    if (clauses.length) withText += 1;
    await writeFile(path.join(dir, "index.html"), kbPageHtml(template, row, t, cssAssets, { clauses, spFullText }), "utf8");
  }
  log(`full text in ${withText} page(s)${spFullText ? "" : " (SP switch off)"}${degraded ? `, ${degraded} without text after fetch errors` : ""}`);

  // Public hubs: /baza/ and one page per folder (split by KB_FOLDER_PAGE_SIZE),
  // so every document is two links from the index, not only in the sitemap.
  const byFolder = new Map(KB_FOLDERS.map((f) => [f, []]));
  for (const row of rows_) {
    const folder = byFolder.has(row.folder) ? row.folder : "other";
    byFolder.get(folder).push(row);
  }
  const counts = Object.fromEntries([...byFolder].map(([f, list]) => [f, list.length]));
  const solutionRows = kbUsableSolutionRows(await fetchSolutionsOrNone(env));
  const solutionPages = kbSolutionPages(template, solutionRows, t, cssAssets);
  const solutionCount = solutionRows.length;
  await mkdir(path.join(DIST, "baza"), { recursive: true });
  await writeFile(path.join(DIST, "baza", "index.html"), kbIndexPageHtml(template, counts, t, cssAssets, solutionCount), "utf8");
  for (const page of solutionPages) {
    const dir = path.join(DIST, ...page.path.split("/").filter(Boolean));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), page.html, "utf8");
  }
  log(`wrote ${solutionPages.length} «Решения» page(s) under baza/resheniya/`);
  const changeRows = await fetchChangesOrNone(env);
  if (changeRows) {
    const dir = path.join(DIST, "baza", "izmeneniya");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "index.html"), kbChangesPageHtml(template, changeRows, t, cssAssets), "utf8");
    log(`wrote baza/izmeneniya/ with ${changeRows.length} change(s)`);
  }
  const hubPaths = [KB_INDEX_PATH];
  for (const [folder, list] of byFolder) {
    if (!list.length) continue;
    const sorted = sortKbRows(list);
    const pages = kbFolderPageCount(sorted.length);
    for (let page = 1; page <= pages; page++) {
      const slice = sorted.slice((page - 1) * KB_FOLDER_PAGE_SIZE, page * KB_FOLDER_PAGE_SIZE);
      const rel = kbFolderPath(folder, page);
      const dir = path.join(DIST, ...rel.split("/").filter(Boolean));
      await mkdir(dir, { recursive: true });
      await writeFile(
        path.join(dir, "index.html"),
        kbFolderPageHtml(template, folder, slice, t, { page, pages, total: sorted.length, spFullText, cssAssets }),
        "utf8",
      );
      hubPaths.push(rel);
    }
  }
  log(`wrote ${hubPaths.length} hub page(s) under baza/`);

  // /llms.txt is written by prerender-blog; the base adds its own section.
  const llmsPath = path.join(DIST, "llms.txt");
  if (existsSync(llmsPath)) {
    const fullTextDocs = rows_
      .filter((r) => r.full_text_available === true && (r.folder !== "sp" || spFullText))
      .map(normalizeKbRow);
    const llms = (await readFile(llmsPath, "utf8")).replace(/\n## База знаний Ровно[\s\S]*$/, "\n");
    const solutions = sortKbSolutions(solutionRows.map(normalizeKbSolution));
    await writeFile(llmsPath, llms.trimEnd() + "\n" + kbLlmsSection(counts, t, fullTextDocs, solutions), "utf8");
  }
  log(`wrote ${rows_.length} page(s) under baza/`);

  const sitemapPath = path.join(DIST, "sitemap.xml");
  const existing = existsSync(sitemapPath) ? await readFile(sitemapPath, "utf8") : null;
  const today = new Date().toISOString().slice(0, 10);
  await writeFile(
    sitemapPath,
    mergeIntoSitemap(existing, [
      ...kbHubSitemapUrls(hubPaths, today),
      ...kbSolutionSitemapUrls(solutionRows, today),
      ...(changeRows ? kbChangesSitemapUrls(today) : []),
      ...kbSitemapUrls(rows_, today),
    ]),
    "utf8",
  );
  log(`added ${hubPaths.length + solutionPages.length + (changeRows ? 1 : 0) + rows_.length} url(s) to sitemap.xml`);
  outcome.fetchFailed = false;
  return rows_.length;
}

/**
 * A staging build serves the same pages as rovno.ai: keep it out of search
 * whatever happens with the knowledge base fetch.
 */
async function closeStagingToCrawlers() {
  if (!existsSync(DIST)) return;
  if (!isStagingBackend((await loadEnv()).VITE_SUPABASE_URL)) return;
  await writeFile(path.join(DIST, "robots.txt"), STAGING_ROBOTS_TXT, "utf8");
  log("staging backend: robots.txt closes the whole site to crawlers");
}

async function main() {
  let written = 0;
  const outcome = { fetchFailed: false };
  await closeStagingToCrawlers();
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
