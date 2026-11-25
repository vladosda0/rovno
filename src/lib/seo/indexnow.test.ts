import { describe, expect, it } from "vitest";
import { INDEXNOW_BATCH, INDEXNOW_KEY, indexNowBodies, sitemapUrls } from "./indexnow.mjs";
import { readFileSync } from "node:fs";
import path from "node:path";

const XML = `<?xml version="1.0"?><urlset>
  <url><loc>https://rovno.ai/</loc><lastmod>2026-10-01</lastmod></url>
  <url><loc>https://rovno.ai/baza/</loc><lastmod>2026-10-22</lastmod></url>
  <url><loc>https://rovno.ai/baza/sp-71-13330/</loc><lastmod>2026-10-22</lastmod></url>
  <url><loc>https://rovno.ai/blog/a/</loc><lastmod>2026-10-10</lastmod></url>
  <url><loc>https://vladosda0-rovno-90e7.twc1.net/baza/x/</loc><lastmod>2026-10-22</lastmod></url>
  <url><loc>http://rovno.ai/baza/y/</loc></url>
</urlset>`;

describe("IndexNow", () => {
  it("takes only rovno.ai https URLs, filtered by date and prefix", () => {
    expect(sitemapUrls(XML)).toHaveLength(4);
    expect(sitemapUrls(XML, { since: "2026-10-20" })).toEqual(["https://rovno.ai/baza/", "https://rovno.ai/baza/sp-71-13330/"]);
    expect(sitemapUrls(XML, { prefix: "/blog/" })).toEqual(["https://rovno.ai/blog/a/"]);
  });

  it("splits into protocol-size batches with the key and its location", () => {
    const urls = Array.from({ length: INDEXNOW_BATCH + 1 }, (_, i) => `https://rovno.ai/baza/d${i}/`);
    const bodies = indexNowBodies(urls);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].urlList).toHaveLength(INDEXNOW_BATCH);
    expect(bodies[0]).toMatchObject({ host: "rovno.ai", key: INDEXNOW_KEY, keyLocation: `https://rovno.ai/${INDEXNOW_KEY}.txt` });
  });

  it("ships the key file at the site root with the key as its whole content", () => {
    const file = path.join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`);
    expect(readFileSync(file, "utf8")).toBe(INDEXNOW_KEY);
    expect(INDEXNOW_KEY).toMatch(/^[0-9a-f]{32}$/);
  });
});
