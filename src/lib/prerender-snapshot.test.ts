import { beforeEach, describe, expect, it } from "vitest";
import {
  capturePrerenderSnapshot,
  prerenderedHtmlFor,
  resetPrerenderSnapshot,
} from "@/lib/prerender-snapshot";

describe("prerender snapshot (site-redesign 1.2)", () => {
  beforeEach(() => {
    resetPrerenderSnapshot();
    document.body.innerHTML = "";
  });

  it("keeps the ready markup of the page it was built for, to paint while the route chunk loads", () => {
    document.body.innerHTML =
      '<div id="root"><div data-prerendered-route="/offer/"><h1>Публичная оферта</h1></div><!--/rv-prerendered--></div>';
    capturePrerenderSnapshot(document, "/offer/");
    expect(prerenderedHtmlFor("/offer")).toBe("<h1>Публичная оферта</h1>");
    expect(prerenderedHtmlFor("/offer/")).toBe("<h1>Публичная оферта</h1>");
  });

  it("never paints it on another address (the landing markup in the SPA fallback)", () => {
    document.body.innerHTML = '<div id="root"><div data-prerendered-route="/"><h1>Лендинг</h1></div></div>';
    capturePrerenderSnapshot(document);
    expect(prerenderedHtmlFor("/")).toBe("<h1>Лендинг</h1>");
    expect(prerenderedHtmlFor("/home")).toBeNull();
    expect(prerenderedHtmlFor("/auth/login")).toBeNull();
  });

  it("keeps nothing when the document was opened on another address (review round 2)", () => {
    document.body.innerHTML = '<div id="root"><div data-prerendered-route="/"><h1>Лендинг</h1></div></div>';
    capturePrerenderSnapshot(document, "/auth/login");
    expect(prerenderedHtmlFor("/")).toBeNull();
    capturePrerenderSnapshot(document, "/");
    expect(prerenderedHtmlFor("/")).toBe("<h1>Лендинг</h1>");
  });

  it("is empty when the document has no ready markup", () => {
    document.body.innerHTML = '<div id="root"></div>';
    capturePrerenderSnapshot(document);
    expect(prerenderedHtmlFor("/")).toBeNull();
  });
});
