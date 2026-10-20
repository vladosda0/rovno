// Type surface for the knowledge-base prerender helpers (kbPrerenderConfig.mjs).

export type KbTranslate = (key: string, vars?: Record<string, unknown>) => string;

export declare const SITE_ORIGIN: string;
export declare const KB_DOC_DATA_ID: string;
export declare function isSafeSlug(slug: unknown): boolean;
export declare function escapeHtml(value: unknown): string;
export declare function createTranslator(dict: Record<string, string>): KbTranslate;
export declare function kbDocumentRootHtml(row: Record<string, unknown>, t: KbTranslate): string;
export declare function stripCanonicalTags(html: string): string;
export declare function kbPageHtml(
  template: string,
  row: Record<string, unknown>,
  t: KbTranslate,
  cssAssets?: string[],
): string;
export declare function kbSitemapUrls(rows: Array<Record<string, unknown>>, today: string): string[];
export declare function mergeIntoSitemap(xml: string | null | undefined, lines: string[]): string;
export declare const SITE_NAME: string;
export declare function fallbackShellWithoutKbPages(indexHtml: string, outcome: { pagesWritten: number; fetchFailed: boolean }): string | null;
