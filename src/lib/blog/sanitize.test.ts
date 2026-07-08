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

  it("strips <style> wherever it sits in the fragment", () => {
    // The leading-position case passed for the WRONG reason: a fragment starting
    // with <style> is parsed into <head> and never serialized, so it looked
    // stripped while DOMPurify's default allow-list was in fact keeping it (it
    // arrives via the SVG tag set). Move it after any element and it survived
    // into the article body of every published page. Both positions now assert.
    expect(sanitizeArticleHtml("<style>body{background:url(x)}</style><p>x</p>")).not.toMatch(/<style/i);
    expect(sanitizeArticleHtml("<p>x</p><style>body{background:url(x)}</style>")).not.toMatch(/<style/i);
    expect(sanitizeArticleHtml("<h2>a</h2><style>a{}</style><p>x</p>")).not.toMatch(/<style/i);
  });

  it("drops the CONTENT of a removed tag, not just the tag", () => {
    // KEEP_CONTENT unwraps a forbidden element by default, and passing
    // FORBID_CONTENTS REPLACES DOMPurify's default set rather than extending it.
    // Get that wrong and a removed <style> leaves its CSS behind as visible
    // article text, and a removed <form> leaves a live password field.
    expect(sanitizeArticleHtml("<p>x</p><style>body{color:red}</style>")).toBe("<p>x</p>");
    expect(sanitizeArticleHtml("<p>x</p><svg><script>alert(1)</script></svg>")).toBe("<p>x</p>");
    expect(sanitizeArticleHtml('<p>x</p><form action="//evil.test"><input name="pw"><button>go</button></form>')).toBe("<p>x</p>");
    expect(sanitizeArticleHtml('<p>x</p><button onclick="x()">go</button>')).toBe("<p>x</p>");
    expect(sanitizeArticleHtml("<p>x</p><textarea>t</textarea>")).toBe("<p>x</p>");
  });

  it("strips tags our editor can never emit but DOMPurify allows by default", () => {
    for (const html of [
      '<p>x</p><form action="//evil.test"><input name="p"></form>',
      "<p>x</p><input name='pw'>",
      "<p>x</p><svg><desc>d</desc></svg>",
      "<p>x</p><math><mtext>m</mtext></math>",
      "<p>x</p><template><p>t</p></template>",
      "<p>x</p><select><option>o</option></select>",
    ]) {
      const out = sanitizeArticleHtml(html);
      expect(out, html).not.toMatch(/<(form|input|button|select|textarea|option|svg|math|template|style)/i);
    }
  });

  it("keeps the full editor surface untouched", () => {
    // Guards against the FORBID_* lists over-reaching.
    const html =
      "<h2>H</h2><h3>h</h3><p><strong>b</strong><em>i</em><u>u</u><s>s</s><code>c</code></p>" +
      "<blockquote><p>q</p></blockquote><ul><li>x</li></ul><ol><li>y</li></ol>" +
      "<pre><code>z</code></pre><hr>" +
      '<figure data-rv-figure=""><img src="https://x.test/a.jpg" alt="A" width="16" height="9" loading="lazy" decoding="async"><figcaption>C <strong>b</strong> <a href="/x">l</a></figcaption></figure>' +
      '<div data-youtube-video=""><iframe src="https://www.youtube-nocookie.com/embed/x" allowfullscreen frameborder="0"></iframe></div>';
    const out = sanitizeArticleHtml(html);
    for (const tag of ["h2", "h3", "strong", "em", "u", "s", "code", "blockquote", "ul", "ol", "li", "pre", "hr", "figure", "figcaption", "img", "iframe"]) {
      expect(out, tag).toMatch(new RegExp(`<${tag}[ >]`));
    }
    expect(out).toMatch(/data-rv-figure/);
    expect(out).toMatch(/data-youtube-video/);
    expect(out).toMatch(/loading="lazy"/);
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
