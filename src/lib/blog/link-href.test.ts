import { describe, expect, it } from "vitest";
import { isInternalHref, normalizeHref } from "./link-href";

describe("normalizeHref", () => {
  it("prefixes https:// on a bare host", () => {
    expect(normalizeHref("rovno.ai/blog")).toBe("https://rovno.ai/blog");
    expect(normalizeHref("  example.com  ")).toBe("https://example.com");
  });

  it("leaves absolute http(s) URLs alone", () => {
    expect(normalizeHref("https://a.test/x?y=1#z")).toBe("https://a.test/x?y=1#z");
    expect(normalizeHref("http://a.test")).toBe("http://a.test");
  });

  it("preserves root-relative and in-page links", () => {
    // The whole point of the internal-linking cluster: these must NOT become
    // https:///blog/smeta.
    expect(normalizeHref("/blog/smeta")).toBe("/blog/smeta");
    expect(normalizeHref("#zakupki")).toBe("#zakupki");
  });

  it("upgrades protocol-relative URLs", () => {
    expect(normalizeHref("//cdn.test/a.png")).toBe("https://cdn.test/a.png");
  });

  it("preserves mailto and tel", () => {
    expect(normalizeHref("mailto:hi@rovno.ai")).toBe("mailto:hi@rovno.ai");
    expect(normalizeHref("tel:+79001234567")).toBe("tel:+79001234567");
  });

  it("refuses dangerous schemes instead of mangling them", () => {
    expect(normalizeHref("javascript:alert(1)")).toBeNull();
    expect(normalizeHref("JavaScript:alert(1)")).toBeNull();
    expect(normalizeHref("data:text/html,<script>")).toBeNull();
    expect(normalizeHref("vbscript:msgbox")).toBeNull();
  });

  it("refuses the backslash trap that escapes the origin", () => {
    // `new URL("/\\evil.com", "https://rovno.ai/").href === "https://evil.com/"`.
    // Neither TipTap's isAllowedUri nor DOMPurify rejects it, so if this passes
    // the link ships as same-site (no target, no rel) and navigates off-site.
    expect(normalizeHref("/\\evil.com")).toBeNull();
    expect(normalizeHref("/\\/evil.com")).toBeNull();
    expect(normalizeHref("\\\\evil.com")).toBeNull();
    expect(normalizeHref("https://rovno.ai\\@evil.com")).toBeNull();
  });

  it("accepts a bare host with a port (a colon is not always a scheme)", () => {
    expect(normalizeHref("example.com:8080/x")).toBe("https://example.com:8080/x");
    expect(normalizeHref("localhost:3000")).toBe("https://localhost:3000");
    expect(normalizeHref("1.2.3.4:80")).toBe("https://1.2.3.4:80");
    expect(normalizeHref("rovno.ai:443/pricing")).toBe("https://rovno.ai:443/pricing");
  });

  it("does not mistake a dangerous scheme for a host:port just because a digit follows", () => {
    // `scheme:` + digit is what a naive "a scheme is never followed by a digit"
    // rule accepts, turning javascript:1 into the nonsense link https://javascript:1
    // instead of refusing it.
    expect(normalizeHref("javascript:1")).toBeNull();
    expect(normalizeHref("jAvAsCrIpT:1//")).toBeNull();
    expect(normalizeHref("data:1")).toBeNull();
    expect(normalizeHref("vbscript:0")).toBeNull();
    expect(normalizeHref("example.com:80abc")).toBeNull();
  });

  it("rejects hrefs the URL parser cannot resolve", () => {
    // These used to be returned as valid and written into the link mark.
    expect(normalizeHref("//")).toBeNull();
    expect(normalizeHref("?q=1")).toBeNull();
  });

  it("returns null for blank input", () => {
    expect(normalizeHref("")).toBeNull();
    expect(normalizeHref("   ")).toBeNull();
  });
});

describe("isInternalHref", () => {
  it("treats relative and in-page hrefs as internal", () => {
    expect(isInternalHref("/blog/smeta")).toBe(true);
    expect(isInternalHref("#razdel")).toBe(true);
  });

  it("treats an absolute rovno.ai URL as internal", () => {
    expect(isInternalHref("https://rovno.ai/pricing")).toBe(true);
  });

  it("treats other origins as external", () => {
    expect(isInternalHref("https://example.com")).toBe(false);
    expect(isInternalHref("http://rovno.ai")).toBe(false); // scheme is part of origin
    expect(isInternalHref("https://evil.rovno.ai.attacker.test")).toBe(false);
  });

  it("resolves rather than pattern-matches, so an origin escape reads as external", () => {
    // normalizeHref rejects these outright; belt and braces if one ever reaches here.
    expect(isInternalHref("/\\evil.com")).toBe(false);
    expect(isInternalHref("//evil.com")).toBe(false);
  });

  it("ignores a default port", () => {
    expect(isInternalHref("https://rovno.ai:443/x")).toBe(true);
  });

  it("treats mailto as external (no origin)", () => {
    expect(isInternalHref("mailto:hi@rovno.ai")).toBe(false);
  });
});
