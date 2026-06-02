import { describe, expect, it } from "vitest";
import { sanitizeOfficeHtml } from "./sanitize-office-html";

describe("sanitizeOfficeHtml", () => {
  it("strips <script> tags", () => {
    const out = sanitizeOfficeHtml('<p>ok</p><script>alert(1)</script>');
    expect(out).toContain("<p>ok</p>");
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("strips inline event handlers", () => {
    const out = sanitizeOfficeHtml('<img src="data:image/png;base64,AAAA" onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain("onerror");
  });

  it("strips inline style (url() exfil path)", () => {
    const out = sanitizeOfficeHtml('<td style="background:url(https://evil.test/x)">x</td>');
    expect(out.toLowerCase()).not.toContain("style=");
    expect(out.toLowerCase()).not.toContain("evil.test");
  });

  it("strips <style> and <link> tags (external CSS fetch path)", () => {
    const styleOut = sanitizeOfficeHtml('<style>@import url(https://evil.test/x.css)</style><p>ok</p>');
    expect(styleOut.toLowerCase()).not.toContain("<style");
    expect(styleOut.toLowerCase()).not.toContain("evil.test");
    expect(styleOut).toContain("<p>ok</p>");
    const linkOut = sanitizeOfficeHtml('<link rel="stylesheet" href="https://evil.test/x.css"><p>ok</p>');
    expect(linkOut.toLowerCase()).not.toContain("<link");
    expect(linkOut.toLowerCase()).not.toContain("evil.test");
  });

  it("removes external image src but keeps data: URIs", () => {
    const external = sanitizeOfficeHtml('<img src="https://evil.test/track.png">');
    expect(external.toLowerCase()).not.toContain("evil.test");
    const inline = sanitizeOfficeHtml('<img src="data:image/png;base64,AAAA">');
    expect(inline).toContain("data:image/png;base64,AAAA");
  });

  it("forces safe rel/target on links", () => {
    const out = sanitizeOfficeHtml('<a href="https://example.test">link</a>');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it("returns empty string when nothing survives sanitization", () => {
    expect(sanitizeOfficeHtml("<script>alert(1)</script>")).toBe("");
    expect(sanitizeOfficeHtml("   ")).toBe("");
  });

  it("preserves benign table markup", () => {
    const out = sanitizeOfficeHtml("<h4>Sheet1</h4><table><tr><td>A1</td></tr></table>");
    expect(out).toContain("<h4>Sheet1</h4>");
    expect(out).toContain("<td>A1</td>");
  });
});
