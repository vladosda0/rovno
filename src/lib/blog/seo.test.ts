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
