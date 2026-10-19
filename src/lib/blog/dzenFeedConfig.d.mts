// Type surface for the shared plain-ESM Dzen feed builder (dzenFeedConfig.mjs).

/** Document-like: only `body` is read. Satisfied by DOM Document and jsdom. */
export interface DzenParsedHtmlDocument {
  body: Element;
}

/** The post fields the Dzen feed reads. */
export interface DzenFeedPost {
  slug: string;
  title: string;
  excerpt?: string | null;
  cover_image_url?: string | null;
  published_at?: string | null;
}

export declare const DZEN_CATEGORIES: readonly string[];
export declare const DZEN_MAX_ITEMS: number;
export declare function escapeXml(value: unknown): string;
export declare function stripUtm(value: unknown, siteOrigin: string): string | null;
export declare function dzenImageType(src: unknown): string | null;
export declare function dzenArticleHtml(
  html: string,
  parseHtml: (html: string) => DzenParsedHtmlDocument,
  siteOrigin: string,
): string;
export declare function dzenItemXml(post: DzenFeedPost, bodyHtml: string, siteOrigin: string): string;
export declare function dzenFeedXml<P extends DzenFeedPost>(
  posts: P[],
  options: {
    siteOrigin: string;
    title: string;
    description: string;
    renderBody: (post: P) => string;
  },
): string;
