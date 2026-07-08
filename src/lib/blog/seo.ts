// Per-page document <head> management (title / meta / canonical / JSON-LD).
//
// The app is a static-hosted SPA with a single index.html, so per-route SEO
// tags have to be managed at runtime. Two consumers rely on the exact
// mechanics here:
//  - JS-executing crawlers (Googlebot, Yandex rendering) read the updated
//    tags from the live DOM;
//  - the build-time prerenderer (scripts/prerender-blog.mjs) writes the SAME
//    tags statically into dist/blog/**/index.html — this hook then finds the
//    existing elements and updates them in place (no duplicates on hydrated
//    prerendered pages).
//
// Existing elements are updated and restored on unmount; elements this hook
// created are marked data-rv-seo and removed on unmount, so app routes keep
// the index.html defaults.

import { useEffect } from "react";

/** Primary public origin — canonical URLs always point here, including when
 * the site is served from the стройагент.рф mirror domain. */
export const SITE_ORIGIN = "https://rovno.ai";
export const SITE_NAME = "Ровно ИИ";

export interface ArticleHeadMeta {
  publishedTime: string;
  modifiedTime?: string;
  authorName?: string;
  tags?: string[];
}

export interface DocumentHeadOptions {
  title: string;
  description?: string | null;
  /** Path starting with "/" — combined with SITE_ORIGIN into the canonical URL. */
  canonicalPath?: string;
  ogType?: "website" | "article";
  ogImage?: string | null;
  article?: ArticleHeadMeta;
  /** e.g. "noindex, nofollow" for the admin surface. */
  robots?: string;
  jsonLd?: object | object[] | null;
}

const MANAGED_ATTR = "data-rv-seo";
const JSONLD_ID = "rv-jsonld";

type TagSelector = { kind: "meta"; attr: "name" | "property"; key: string } | { kind: "link"; rel: string };

interface AppliedTag {
  element: Element;
  created: boolean;
  originalContent: string | null;
}

function upsertTag(selector: TagSelector, value: string, applied: AppliedTag[]): void {
  let element: Element | null;
  if (selector.kind === "meta") {
    element = document.head.querySelector(`meta[${selector.attr}="${selector.key}"]`);
  } else {
    element = document.head.querySelector(`link[rel="${selector.rel}"]`);
  }

  if (element) {
    const attrName = selector.kind === "meta" ? "content" : "href";
    applied.push({ element, created: false, originalContent: element.getAttribute(attrName) });
    element.setAttribute(attrName, value);
    return;
  }

  if (selector.kind === "meta") {
    element = document.createElement("meta");
    element.setAttribute(selector.attr, selector.key);
    element.setAttribute("content", value);
  } else {
    element = document.createElement("link");
    element.setAttribute("rel", selector.rel);
    element.setAttribute("href", value);
  }
  element.setAttribute(MANAGED_ATTR, "1");
  document.head.appendChild(element);
  applied.push({ element, created: true, originalContent: null });
}

/** Apply head tags for the current page; restores previous state on unmount.
 * Pass null to leave the head untouched (e.g. while data is loading). */
export function useDocumentHead(options: DocumentHeadOptions | null): void {
  // Serialize for the dependency array: options is a fresh object every render.
  const serialized = options ? JSON.stringify(options) : null;

  useEffect(() => {
    if (!serialized) return;
    const opts = JSON.parse(serialized) as DocumentHeadOptions;

    const previousTitle = document.title;
    const applied: AppliedTag[] = [];

    document.title = opts.title;
    upsertTag({ kind: "meta", attr: "property", key: "og:title" }, opts.title, applied);

    if (opts.description) {
      upsertTag({ kind: "meta", attr: "name", key: "description" }, opts.description, applied);
      upsertTag({ kind: "meta", attr: "property", key: "og:description" }, opts.description, applied);
      upsertTag({ kind: "meta", attr: "name", key: "twitter:description" }, opts.description, applied);
    }

    upsertTag({ kind: "meta", attr: "property", key: "og:type" }, opts.ogType ?? "website", applied);
    upsertTag({ kind: "meta", attr: "property", key: "og:site_name" }, SITE_NAME, applied);
    upsertTag({ kind: "meta", attr: "name", key: "twitter:title" }, opts.title, applied);

    if (opts.canonicalPath) {
      const canonicalUrl = `${SITE_ORIGIN}${opts.canonicalPath}`;
      upsertTag({ kind: "link", rel: "canonical" }, canonicalUrl, applied);
      upsertTag({ kind: "meta", attr: "property", key: "og:url" }, canonicalUrl, applied);
    }

    if (opts.ogImage) {
      upsertTag({ kind: "meta", attr: "property", key: "og:image" }, opts.ogImage, applied);
      upsertTag({ kind: "meta", attr: "name", key: "twitter:card" }, "summary_large_image", applied);
      upsertTag({ kind: "meta", attr: "name", key: "twitter:image" }, opts.ogImage, applied);
    } else {
      upsertTag({ kind: "meta", attr: "name", key: "twitter:card" }, "summary", applied);
    }

    if (opts.article) {
      upsertTag(
        { kind: "meta", attr: "property", key: "article:published_time" },
        opts.article.publishedTime,
        applied,
      );
      if (opts.article.modifiedTime) {
        upsertTag(
          { kind: "meta", attr: "property", key: "article:modified_time" },
          opts.article.modifiedTime,
          applied,
        );
      }
      for (const tag of opts.article.tags ?? []) {
        // article:tag is repeatable — always create fresh managed elements.
        const el = document.createElement("meta");
        el.setAttribute("property", "article:tag");
        el.setAttribute("content", tag);
        el.setAttribute(MANAGED_ATTR, "1");
        document.head.appendChild(el);
        applied.push({ element: el, created: true, originalContent: null });
      }
    }

    // `robots` and the JSON-LD script are the two head tags a PRERENDERED page can
    // arrive with. For every other tag, "restore the original on unmount" is right:
    // the original came from index.html and is a sane default. For these two it is
    // actively wrong — the original belongs to the document we booted on, and after
    // a client-side navigation it describes a page that is no longer displayed.
    //
    // Concretely: land on a prerendered thin tag hub (static `noindex, follow`) and
    // click through to an article — the article's live head still said noindex, and
    // so did every page after it. Land on a prerendered article (static
    // Article+BreadcrumbList+FAQPage) and a thin hub kept declaring that article's
    // structured data alongside its own canonical.
    //
    // So when THIS page does not set them, remove them outright and do not restore.
    if (opts.robots) {
      upsertTag({ kind: "meta", attr: "name", key: "robots" }, opts.robots, applied);
    } else {
      document.head.querySelector('meta[name="robots"]')?.remove();
    }

    if (opts.jsonLd) {
      const payload = JSON.stringify(Array.isArray(opts.jsonLd) && opts.jsonLd.length === 1 ? opts.jsonLd[0] : opts.jsonLd);
      let jsonLdEl = document.getElementById(JSONLD_ID) as HTMLScriptElement | null;
      if (!jsonLdEl) {
        jsonLdEl = document.createElement("script");
        jsonLdEl.type = "application/ld+json";
        jsonLdEl.id = JSONLD_ID;
        document.head.appendChild(jsonLdEl);
      }
      jsonLdEl.textContent = payload;
    } else {
      document.getElementById(JSONLD_ID)?.remove();
    }

    return () => {
      document.title = previousTitle;
      for (const tag of applied) {
        // `robots` and the JSON-LD block are REMOVED on unmount, never restored — even
        // when this page created neither and merely overwrote a prerendered one.
        //
        // Removing them when the next page sets none (above) only half-closed the leak:
        // that branch lives in the NEXT page's effect, and only BlogIndex/BlogPostPage/
        // BlogTagPage call this hook. Navigate from a prerendered thin hub (static
        // `noindex, follow`) to the landing page and nothing ran to clear it, so `/`
        // carried noindex in the live DOM. index.html ships neither tag, so removing
        // them restores exactly the boot state. Everything else (canonical, og:*,
        // description) has a sane index.html default and IS restored.
        if (isRobotsMeta(tag.element)) {
          tag.element.remove();
        } else if (tag.created) {
          tag.element.remove();
        } else if (tag.originalContent !== null) {
          const attrName = tag.element.tagName === "LINK" ? "href" : "content";
          tag.element.setAttribute(attrName, tag.originalContent);
        }
      }
      document.getElementById(JSONLD_ID)?.remove();
    };
  }, [serialized]);
}

function isRobotsMeta(element: Element): boolean {
  return element.tagName === "META" && element.getAttribute("name") === "robots";
}
