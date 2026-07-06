// Type surface for the shared plain-ESM sanitizer config (sanitizeConfig.mjs).
// Kept deliberately structural so any DOMPurify-shaped instance (the browser
// singleton from "dompurify", or a jsdom-backed instance in Node) satisfies it.

export interface DomPurifyLike {
  sanitize(html: string, options?: Record<string, unknown>): string;
  addHook(
    entryPoint: string,
    hookFunction: (node: unknown, data: { tagName: string }) => void,
  ): void;
  __rvArticleIframeHook?: boolean;
}

export declare const ALLOWED_IFRAME_HOSTS: Set<string>;
export declare const ARTICLE_PURIFY_OPTIONS: {
  ADD_TAGS: string[];
  ADD_ATTR: string[];
};
export declare function installArticleIframeHook(purify: DomPurifyLike): void;
export declare function sanitizeArticleHtmlWith(
  purify: DomPurifyLike,
  html: string,
): string;
