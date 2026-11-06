// Type surface for the knowledge-base search helpers (kbSeo.mjs).

import type { KbDocumentShape, KbFolder, KbTranslate } from "./kbConfig.mjs";
import type { KbClause, KbTextLabel } from "./kbFullText.mjs";
import type { KbSolution } from "./kbSolutions.mjs";

export interface KbCrumb {
  name: string;
  path: string;
}

export interface KbIndexItem {
  folder: KbFolder;
  name: string;
  description: string;
  count: number;
  path: string;
}

export interface KbFolderItem {
  path: string;
  name: string;
  note: string | null;
  label: KbTextLabel | null;
  host: string | null;
}

type Json = Record<string, unknown>;

export declare const SITE_ORIGIN: string;
export declare const KB_SITE_SECTION: string;
export declare const KB_INDEX_PATH: string;
export declare const KB_FOLDER_PAGE_SIZE: number;
export declare const STAGING_ROBOTS_TXT: string;
export declare function kbFolderPath(folder: string, page?: number): string;
export declare function kbFolderPageCount(total: number): number;
export declare function kbBreadcrumbTrail(t: KbTranslate, options?: { folder?: KbFolder | null; doc?: KbDocumentShape | null }): KbCrumb[];
export declare function kbDocumentTitle(doc: KbDocumentShape, options?: { spFullText?: boolean }): string;
export declare function kbDocumentDescription(
  doc: KbDocumentShape,
  t: KbTranslate,
  options?: { spFullText?: boolean; firstText?: string | null },
): string;
export declare function kbFirstText(clauses: KbClause[] | null | undefined): string | null;
export declare function kbDocumentJsonLd(
  doc: KbDocumentShape,
  t: KbTranslate,
  options?: { clauses?: KbClause[]; spFullText?: boolean; description?: string | null },
): Json;
export declare function kbIndexTitle(): string;
export declare function kbIndexDescription(total: number): string;
export declare function kbFolderTitle(folder: KbFolder, t: KbTranslate, page?: number): string;
export declare function kbFolderDescription(folder: KbFolder, t: KbTranslate, total: number): string;
export declare function kbCollectionJsonLd(
  t: KbTranslate,
  options: {
    folder?: KbFolder | null;
    page?: number;
    items?: Array<{ path: string; name: string }>;
    name: string;
    description: string;
    path?: string | null;
    trail?: KbCrumb[] | null;
  },
): Json;
export declare function kbIndexItems(counts: Partial<Record<KbFolder, number>> | null | undefined, t: KbTranslate): KbIndexItem[];
export declare function kbFolderItem(doc: KbDocumentShape, t: KbTranslate, options?: { spFullText?: boolean }): KbFolderItem;
export declare function isStagingBackend(supabaseUrl: unknown): boolean;
export declare function kbLlmsSection(
  counts: Partial<Record<KbFolder, number>>,
  t: KbTranslate,
  fullTextDocs?: KbDocumentShape[],
  solutions?: KbSolution[],
): string;
export declare function documentsCountText(t: KbTranslate, count: number): string;
export declare function solutionsCountText(t: KbTranslate, count: number): string;

export interface KbSolutionsIndexItem {
  name: string;
  description: string;
  count: number;
  path: string;
}
export declare function kbSolutionsTrail(t: KbTranslate, solution?: KbSolution | null): KbCrumb[];
export declare function kbSolutionsIndexItem(count: number, t: KbTranslate): KbSolutionsIndexItem | null;
export declare function kbSolutionsTitle(): string;
export declare function kbSolutionsDescription(t: KbTranslate, count: number): string;
export declare function kbSolutionsItems(solutions: KbSolution[]): Array<{ path: string; name: string }>;
export declare function kbSolutionsJsonLd(t: KbTranslate, solutions: KbSolution[]): Json;
export declare function kbSolutionTitle(solution: KbSolution): string;
export declare function kbSolutionDescription(solution: KbSolution): string;
export declare function kbSolutionJsonLd(solution: KbSolution, t: KbTranslate): Json;

export declare function kbChangesTrail(t: KbTranslate): KbCrumb[];
export declare function kbChangesTitle(t: KbTranslate): string;
export declare function kbChangesDescription(t: KbTranslate): string;
export declare function kbChangesJsonLd(t: KbTranslate): Json;
