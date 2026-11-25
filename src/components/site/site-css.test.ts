// Guards the isolation of the public-site styles (epic site-redesign, step 1.1):
// every rule in site.css must be scoped to the public site, no review-only mock
// classes may leak in, and every asset it references must exist in public/site/.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import postcss, { type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const here = path.dirname(new URL(import.meta.url).pathname);
const cssPath = path.join(here, "site.css");
const publicDir = path.resolve(here, "../../../public");
const siteDir = path.join(publicDir, "site");

const root = postcss.parse(readFileSync(cssPath, "utf8"), { from: cssPath });

function inKeyframes(rule: Rule): boolean {
  for (let p = rule.parent; p; p = p.parent as typeof p) {
    if (p.type === "atrule" && /keyframes$/i.test((p as postcss.AtRule).name)) return true;
  }
  return false;
}

const rules: Rule[] = [];
root.walkRules((rule) => {
  if (!inKeyframes(rule)) rules.push(rule);
});
const selectors = rules.flatMap((rule) => rule.selectors.map((s) => s.trim()));

// Lenis toggles these classes on <html> only while it is running.
const LENIS_EXCEPTION = /^(html\.lenis(\s+body)?|\.lenis-[a-z]+(\s.*)?)$/;
const scoped = (s: string) => /^\.rv-site(-portal)?(?![\w-])/.test(s);

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(full) : [full];
  });
}

describe("public site styles (site.css)", () => {
  it("parses into a non-trivial rule set", () => {
    expect(rules.length).toBeGreaterThan(200);
  });

  it("scopes every selector under .rv-site or .rv-site-portal (Lenis html classes excepted)", () => {
    const unscoped = selectors.filter((s) => !scoped(s) && !LENIS_EXCEPTION.test(s));
    expect(unscoped).toEqual([]);
  });

  it("has no bare element selectors that would restyle the app", () => {
    const bare = selectors.filter((s) => !LENIS_EXCEPTION.test(s)).filter((s) =>
      /^(html|body|main|section|footer|header|nav|h[1-6]|p|a|button|img|ul|li|\*|:root)([\s.:[#>+~]|$)/.test(s),
    );
    expect(bare).toEqual([]);
  });

  it("puts cursor:none only under .rv-site", () => {
    const offenders: string[] = [];
    root.walkDecls("cursor", (decl) => {
      if (!/none/.test(decl.value)) return;
      const rule = decl.parent as Rule;
      for (const s of rule.selectors) if (!/^\.rv-site(?![\w-])/.test(s.trim())) offenders.push(s);
    });
    expect(offenders).toEqual([]);
  });

  it("contains no review-only mock-* classes", () => {
    expect(selectors.filter((s) => s.includes("mock-"))).toEqual([]);
  });

  it("points every url() at an existing file under /site/", () => {
    const urls: string[] = [];
    root.walkDecls((decl) => {
      for (const m of decl.value.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) urls.push(m[2]);
    });
    root.walkAtRules("font-face", (at) =>
      at.walkDecls("src", (decl) => {
        for (const m of decl.value.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) urls.push(m[2]);
      }),
    );
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url.startsWith("/site/"), url).toBe(true);
      expect(existsSync(path.join(publicDir, url)), url).toBe(true);
    }
  });
});

describe("public site assets (public/site)", () => {
  const files = filesUnder(siteDir);

  it("stays within the 3 MB budget", () => {
    const total = files.reduce((sum, file) => sum + statSync(file).size, 0);
    expect(total).toBeLessThanOrEqual(3 * 1024 * 1024);
  });

  it("ships no heavy PNGs", () => {
    const heavy = files.filter((f) => f.endsWith(".png") && statSync(f).size > 300 * 1024);
    expect(heavy).toEqual([]);
  });
});
