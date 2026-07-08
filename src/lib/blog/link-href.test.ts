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

  it("treats mailto as external (no origin)", () => {
    expect(isInternalHref("mailto:hi@rovno.ai")).toBe(false);
  });
});
