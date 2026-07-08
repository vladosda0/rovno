// Type surface for the shared plain-ESM heading-anchor pass (anchorsConfig.mjs).

export interface TocEntry {
  id: string;
  text: string;
  level: number;
}

/** Document-like: only `body` is touched. Satisfied by DOM Document and jsdom. */
export interface ParsedHtmlDocument {
  body: Element;
}

export declare const MIN_TOC_ENTRIES: number;
export declare function annotateHeadings(root: Element): TocEntry[];
export declare function tocHtml(toc: TocEntry[]): string;
export declare function annotateArticleHtml(
  html: string,
  parseHtml: (html: string) => ParsedHtmlDocument,
): { html: string; toc: TocEntry[] };
