// Type surface for kbArticleRecord.mjs (docs-library 9.9).

import type { KbTranslate } from "./kbConfig.mjs";

export interface KbArticleRef {
  unit: "st" | "gl" | "rz";
  /** The key the code is found by: «НК РФ», «218-ФЗ», «№2300-1». */
  code: string;
  /** The code as the reason line names it: «НК РФ», «Закон РФ №2300-1». */
  codeLabel: string;
  /** Anchors to try in the code's text, in order. */
  candidates: string[];
}

export type KbArticleResolution =
  | { kind: "open"; slug: string; anchor: string; ref: KbArticleRef }
  | { kind: "reason"; why: "codeMissing" | "notFound" | "ambiguous"; codeLabel: string; ref: KbArticleRef };

export declare function parseKbArticleRef(designation: string | null | undefined): KbArticleRef | null;
export declare function kbCodeKeys(designation: string | null | undefined): string[];
export declare function matchKbCodes<T extends { designation: string | null }>(code: string, docs: readonly T[] | null | undefined): T[];
export declare function kbCodeKey(designation: string | null | undefined): string | null;
export declare function pickKbCode<T extends { designation: string | null }>(code: string, docs: readonly T[] | null | undefined): T | null;
export declare function resolveKbArticleRecord(
  record: { designation: string | null; textUnavailableReason: string | null; folder?: string } | null | undefined,
  codes: readonly { slug: string; designation: string | null }[] | null | undefined,
  codeAnchors: Iterable<string> | null | undefined,
): KbArticleResolution | null;
export declare function kbArticleReason(
  resolution: { kind: string; why?: string; codeLabel?: string } | null | undefined,
  t: KbTranslate,
): string | null;
