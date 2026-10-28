// Type surface for the knowledge-base prerender helpers (kbPrerenderConfig.mjs).

export type KbTranslate = (key: string, vars?: Record<string, unknown>) => string;

export declare const SITE_ORIGIN: string;
export declare const KB_DOC_DATA_ID: string;
export declare function isSafeSlug(slug: unknown): boolean;
export declare function escapeHtml(value: unknown): string;
export declare function createTranslator(dict: Record<string, string>): KbTranslate;
export interface KbPrerenderFullText {
  /** kb_clauses rows of the document, in reading order. */
  clauses?: Array<Record<string, unknown>>;
  /** The SP switch (R-10). */
  spFullText?: boolean;
}
export declare function kbFullTextHtml(
  doc: import("./kbConfig.mjs").KbDocumentShape,
  clauses: import("./kbFullText.mjs").KbClause[],
  t: KbTranslate,
): string;
export declare function kbDocumentRootHtml(row: Record<string, unknown>, t: KbTranslate, fullText?: KbPrerenderFullText): string;
export declare function stripCanonicalTags(html: string): string;
export declare function kbPageHtml(
  template: string,
  row: Record<string, unknown>,
  t: KbTranslate,
  cssAssets?: string[],
  fullText?: KbPrerenderFullText,
): string;
export declare function kbSitemapUrls(rows: Array<Record<string, unknown>>, today: string): string[];
export declare function mergeIntoSitemap(xml: string | null | undefined, lines: string[]): string;
export declare const SITE_NAME: string;
export declare function fallbackShellWithoutKbPages(indexHtml: string, outcome: { pagesWritten: number; fetchFailed: boolean }): string | null;

export declare function kbBreadcrumbsHtml(trail: Array<{ name: string; path: string }>): string;
export declare function withKbHead(
  template: string,
  options: {
    title: string;
    description: string;
    canonicalPath: string;
    ogType?: string;
    jsonLd?: Record<string, unknown> | null;
    robots?: string | null;
    cssAssets?: string[];
  },
): string;
export declare function kbIndexRootHtml(counts: Record<string, number>, t: KbTranslate, solutionsCount?: number): string;
export declare function kbIndexPageHtml(
  template: string,
  counts: Record<string, number>,
  t: KbTranslate,
  cssAssets?: string[],
  solutionsCount?: number,
): string;
export declare function kbFolderRootHtml(
  folder: string,
  docs: import("./kbConfig.mjs").KbDocumentShape[],
  t: KbTranslate,
  options?: { page?: number; pages?: number; total?: number; spFullText?: boolean },
): string;
export declare function kbFolderPageHtml(
  template: string,
  folder: string,
  rows: Array<Record<string, unknown>>,
  t: KbTranslate,
  options?: { page?: number; pages?: number; total?: number; spFullText?: boolean; cssAssets?: string[] },
): string;
export declare function kbHubSitemapUrls(paths: string[], today: string): string[];
export declare const KB_RESERVED_SLUGS: Set<string>;
export declare function sortKbRows<T extends Record<string, unknown>>(rows: T[]): T[];
export declare function documentsCountText(t: KbTranslate, count: number): string;

export declare const KB_SOLUTION_DATA_ID: string;
export declare function kbSolutionCardHtml(solution: import("./kbSolutions.mjs").KbSolution, t: KbTranslate): string;
export declare function kbSolutionRootHtml(row: Record<string, unknown>, t: KbTranslate): string;
export declare function kbSolutionPageHtml(template: string, row: Record<string, unknown>, t: KbTranslate, cssAssets?: string[]): string;
export declare function kbSolutionsRootHtml(rows: Array<Record<string, unknown>>, t: KbTranslate): string;
export declare function kbSolutionsPageHtml(template: string, rows: Array<Record<string, unknown>>, t: KbTranslate, cssAssets?: string[]): string;
export declare function kbSolutionPages(
  template: string,
  rows: Array<Record<string, unknown>>,
  t: KbTranslate,
  cssAssets?: string[],
): Array<{ path: string; html: string }>;
export declare function kbUsableSolutionRows<T extends Record<string, unknown>>(rows: T[]): T[];
export declare function kbSolutionSitemapUrls(rows: Array<Record<string, unknown>>, today: string): string[];
