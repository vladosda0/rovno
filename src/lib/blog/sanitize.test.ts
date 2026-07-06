// @vitest-environment jsdom
//
// Locks the article sanitizer allow-list (audit F2): it is the sole XSS
// barrier on the live path and its iframe gate lives in a lazily-installed
// DOMPurify hook, one refactor away from silently reopening injection. These
// assertions fail loudly if the strip/keep behavior ever regresses. The same
// sanitizeConfig.mjs backs the build-time prerenderer, so this coverage guards
// both render paths.

import { describe, it, expect } from "vitest";
import { sanitizeArticleHtml } from "./sanitize";

describe("sanitizeArticleHtml", () => {
  it("strips <script>", () => {
    expect(sanitizeArticleHtml("<p>ok</p><script>alert(1)</script>")).not.toMatch(/<script/i);
  });

  it("strips event-handler attributes", () => {
    expect(sanitizeArticleHtml('<img src=x onerror="alert(1)">')).not.toMatch(/onerror/i);
  });

  it("strips javascript: URLs", () => {
    expect(sanitizeArticleHtml('<a href="javascript:alert(1)">x</a>')).not.toMatch(/javascript:/i);
  });

  it("strips <style>", () => {
    expect(sanitizeArticleHtml("<style>body{background:url(x)}</style><p>x</p>")).not.toMatch(/<style/i);
  });

  it("removes a non-allowlisted iframe", () => {
    expect(sanitizeArticleHtml('<iframe src="https://evil.com/x"></iframe>')).not.toMatch(/<iframe/i);
  });

  it("removes an http (non-https) iframe from an allowlisted host", () => {
    expect(sanitizeArticleHtml('<iframe src="http://www.youtube.com/embed/x"></iframe>')).not.toMatch(/<iframe/i);
  });

  it("keeps https iframes from every allowlisted video host", () => {
    const hosts = [
      "https://www.youtube.com/embed/x",
      "https://www.youtube-nocookie.com/embed/x",
      "https://player.vimeo.com/video/1",
      "https://rutube.ru/play/embed/1",
      "https://vk.com/video_ext.php?oid=1",
      "https://vkvideo.ru/video_ext.php?oid=1",
    ];
    for (const src of hosts) {
      expect(sanitizeArticleHtml(`<iframe src="${src}"></iframe>`), src).toMatch(/<iframe/i);
    }
  });

  it("keeps ordinary rich-text formatting", () => {
    const out = sanitizeArticleHtml("<p><strong>bold</strong> and <em>italic</em> and <a href=\"https://ok.example\">link</a></p>");
    expect(out).toMatch(/<strong>/);
    expect(out).toMatch(/<em>/);
    expect(out).toMatch(/href="https:\/\/ok\.example"/);
  });

  it("tolerates empty / undefined-ish input", () => {
    expect(sanitizeArticleHtml("")).toBe("");
  });
});
