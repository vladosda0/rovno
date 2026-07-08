import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDocumentHead } from "./seo";

function getMeta(attr: "name" | "property", key: string): string | null {
  return document.head.querySelector(`meta[${attr}="${key}"]`)?.getAttribute("content") ?? null;
}

afterEach(() => {
  // Each test unmounts its hook (renderHook cleanup runs in afterEach via
  // testing-library auto-cleanup), so the head should already be restored.
  document.head.querySelectorAll("[data-rv-seo]").forEach((el) => el.remove());
  document.getElementById("rv-jsonld")?.remove();
});

describe("useDocumentHead", () => {
  it("sets title, description, canonical and og tags", () => {
    const { unmount } = renderHook(() =>
      useDocumentHead({
        title: "Как вести смету — Блог Ровно",
        description: "Разбор типовых ошибок в смете.",
        canonicalPath: "/blog/kak-vesti-smetu/",
        ogType: "article",
        ogImage: "https://cdn.example/cover.jpg",
      }),
    );

    expect(document.title).toBe("Как вести смету — Блог Ровно");
    expect(getMeta("name", "description")).toBe("Разбор типовых ошибок в смете.");
    expect(getMeta("property", "og:type")).toBe("article");
    expect(getMeta("property", "og:image")).toBe("https://cdn.example/cover.jpg");
    expect(getMeta("name", "twitter:card")).toBe("summary_large_image");
    expect(
      document.head.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ).toBe("https://rovno.ai/blog/kak-vesti-smetu/");
    expect(getMeta("property", "og:url")).toBe("https://rovno.ai/blog/kak-vesti-smetu/");

    unmount();
  });

  it("restores previous title and removes created tags on unmount", () => {
    const initialTitle = document.title;

    const { unmount } = renderHook(() =>
      useDocumentHead({
        title: "Временный заголовок",
        description: "x",
        canonicalPath: "/blog/",
      }),
    );
    expect(document.title).toBe("Временный заголовок");

    unmount();
    expect(document.title).toBe(initialTitle);
    expect(document.head.querySelector('link[rel="canonical"]')).toBeNull();
    expect(getMeta("property", "og:url")).toBeNull();
  });

  it("updates existing tags in place and restores their content", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "Статическое описание");
    document.head.appendChild(meta);

    const { unmount } = renderHook(() =>
      useDocumentHead({ title: "T", description: "Новое описание" }),
    );

    expect(getMeta("name", "description")).toBe("Новое описание");
    expect(document.head.querySelectorAll('meta[name="description"]').length).toBe(1);

    unmount();
    expect(getMeta("name", "description")).toBe("Статическое описание");
    meta.remove();
  });

  it("writes JSON-LD into a single #rv-jsonld script", () => {
    const { unmount } = renderHook(() =>
      useDocumentHead({
        title: "T",
        jsonLd: { "@context": "https://schema.org", "@type": "Article", headline: "T" },
      }),
    );

    const script = document.getElementById("rv-jsonld");
    expect(script).not.toBeNull();
    expect(JSON.parse(script!.textContent ?? "{}")["@type"]).toBe("Article");

    unmount();
    expect(document.getElementById("rv-jsonld")).toBeNull();
  });

  it("does nothing when options are null", () => {
    const before = document.head.innerHTML;
    const { unmount } = renderHook(() => useDocumentHead(null));
    expect(document.head.innerHTML).toBe(before);
    unmount();
  });
});

describe("prerendered head tags do not leak across a client-side navigation", () => {
  /** Simulate booting on a PRERENDERED page: the static head already has these. */
  function seedPrerenderedHead(robots: string | null, jsonLd: unknown | null) {
    if (robots) {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "robots");
      meta.setAttribute("content", robots);
      document.head.appendChild(meta);
    }
    if (jsonLd) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = "rv-jsonld";
      script.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
  }

  afterEach(() => {
    document.head.querySelector('meta[name="robots"]')?.remove();
    document.getElementById("rv-jsonld")?.remove();
  });

  it("a page that sets no robots REMOVES a prerendered noindex", () => {
    // Land on a prerendered thin tag hub (static `noindex, follow`), then navigate
    // to an article. Restoring the original on unmount left the article noindex,
    // and so did every page after it for the rest of the session.
    seedPrerenderedHead("noindex, follow", null);
    const { unmount } = renderHook(() => useDocumentHead({ title: "Статья" }));
    expect(getMeta("name", "robots")).toBeNull();
    unmount();
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("a page that DOES set robots still wins", () => {
    seedPrerenderedHead("index, follow", null);
    renderHook(() => useDocumentHead({ title: "Черновик", robots: "noindex, nofollow" }));
    expect(getMeta("name", "robots")).toBe("noindex, nofollow");
  });

  it("a page with no JSON-LD REMOVES a prerendered #rv-jsonld", () => {
    // Prerendered article carries Article+BreadcrumbList+FAQPage; a thin tag hub
    // (jsonLd: null) must not keep declaring the article's structured data.
    seedPrerenderedHead(null, [{ "@type": "Article" }, { "@type": "FAQPage" }]);
    const { unmount } = renderHook(() => useDocumentHead({ title: "#тег", jsonLd: null }));
    expect(document.getElementById("rv-jsonld")).toBeNull();
    unmount();
    expect(document.getElementById("rv-jsonld")).toBeNull();
  });

  it("a page with JSON-LD overwrites the prerendered one", () => {
    seedPrerenderedHead(null, [{ "@type": "Article" }]);
    renderHook(() => useDocumentHead({ title: "#тег", jsonLd: [{ "@type": "CollectionPage" }] }));
    const payload = JSON.parse(document.getElementById("rv-jsonld")!.textContent!);
    expect(payload).toEqual({ "@type": "CollectionPage" });
  });
});
