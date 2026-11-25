#!/usr/bin/env node
// Sends rovno.ai pages to IndexNow (Yandex, Bing) after a prod deploy.
//   node scripts/indexnow-submit.mjs [--since YYYY-MM-DD] [--prefix /baza/] [--dry-run]
// Reads the live https://rovno.ai/sitemap.xml, so it runs AFTER the release is
// on rovno.ai (the key file must already answer at rovno.ai/<key>.txt). Never
// for staging. Exit code 1 when the endpoint refuses.
import process from "node:process";
import { INDEXNOW_ENDPOINT, INDEXNOW_HOST, INDEXNOW_KEY, indexNowBodies, sitemapUrls } from "../src/lib/seo/indexnow.mjs";

const argv = process.argv.slice(2);
const arg = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : null;
};
const since = arg("--since");
const prefix = arg("--prefix");
const dryRun = argv.includes("--dry-run");

const keyCheck = await fetch(`https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`, { signal: AbortSignal.timeout(20_000) });
const keyText = keyCheck.ok ? (await keyCheck.text()).trim() : "";
if (keyText !== INDEXNOW_KEY) {
  console.error(`[indexnow] the key file is not live on ${INDEXNOW_HOST} (HTTP ${keyCheck.status}); deploy first`);
  process.exit(1);
}

const sitemap = await fetch(`https://${INDEXNOW_HOST}/sitemap.xml`, { signal: AbortSignal.timeout(30_000) });
if (!sitemap.ok) {
  console.error(`[indexnow] sitemap.xml: HTTP ${sitemap.status}`);
  process.exit(1);
}
const urls = sitemapUrls(await sitemap.text(), { since, prefix });
console.log(`[indexnow] ${urls.length} url(s)${since ? ` modified since ${since}` : ""}${prefix ? ` under ${prefix}` : ""}`);
if (dryRun || urls.length === 0) process.exit(0);

let failed = false;
for (const body of indexNowBodies(urls)) {
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  // 200 and 202 both mean accepted (202: the key is still being verified).
  console.log(`[indexnow] ${body.urlList.length} url(s): HTTP ${res.status}`);
  if (res.status !== 200 && res.status !== 202) failed = true;
}
process.exit(failed ? 1 : 0);
