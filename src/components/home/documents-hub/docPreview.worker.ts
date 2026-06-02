// Off-main-thread parser for Office document previews (docx via mammoth, xlsx
// via SheetJS). Runs in a Web Worker so that:
//   1. parsing untrusted org-shared files can't freeze/OOM the main thread
//      (xlsx/docx are zip-compressed XML that can decompress to huge sheets), and
//   2. any prototype pollution from a crafted workbook is contained to the
//      worker realm and cannot corrupt the page's Object.prototype.
// The worker returns RAW HTML; the main thread runs it through DOMPurify
// (sanitize-office-html.ts) before injecting — DOMPurify needs a DOM, which a
// worker lacks, so sanitization stays on the main thread.

import mammoth from "mammoth";
import * as XLSX from "xlsx";

export type DocPreviewKind = "docx" | "xlsx";

export interface DocPreviewRequest {
  kind: DocPreviewKind;
  buffer: ArrayBuffer;
}

export type DocPreviewResponse =
  | { ok: true; html: string; truncated: boolean }
  | { ok: false };

// Caps to bound output size regardless of input (a small compressed file can
// expand to an enormous sheet). These bound the generated HTML, not just the
// input bytes.
const MAX_SHEETS = 20;
const MAX_ROWS = 2000;
const MAX_COLS = 100;
const MAX_HTML_CHARS = 2_000_000;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function xlsxToHtml(buffer: ArrayBuffer): { html: string; truncated: boolean } {
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheetNames = wb.SheetNames.slice(0, MAX_SHEETS);
  let truncated = wb.SheetNames.length > MAX_SHEETS;
  const parts: string[] = [];
  let total = 0;

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;

    // Clamp the rendered range so a 1M-row sheet doesn't build a giant string.
    let renderWs = ws;
    if (ws["!ref"]) {
      const range = XLSX.utils.decode_range(ws["!ref"]);
      if (range.e.r - range.s.r >= MAX_ROWS || range.e.c - range.s.c >= MAX_COLS) {
        truncated = true;
      }
      range.e.r = Math.min(range.e.r, range.s.r + MAX_ROWS - 1);
      range.e.c = Math.min(range.e.c, range.s.c + MAX_COLS - 1);
      renderWs = { ...ws, "!ref": XLSX.utils.encode_range(range) };
    }

    const sheetHtml = `<h4>${escapeHtml(name)}</h4>${XLSX.utils.sheet_to_html(renderWs)}`;
    if (total + sheetHtml.length > MAX_HTML_CHARS) {
      // Fill up to the cap with a partial slice rather than dropping the sheet
      // outright; DOMPurify on the main thread repairs the mid-tag cut. Matches
      // docxToHtml so a single oversized sheet still previews instead of vanishing.
      const remaining = MAX_HTML_CHARS - total;
      if (remaining > 0) parts.push(sheetHtml.slice(0, remaining));
      truncated = true;
      break;
    }
    parts.push(sheetHtml);
    total += sheetHtml.length;
  }

  return { html: parts.join(""), truncated };
}

async function docxToHtml(buffer: ArrayBuffer): Promise<{ html: string; truncated: boolean }> {
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  if (result.value.length > MAX_HTML_CHARS) {
    return { html: result.value.slice(0, MAX_HTML_CHARS), truncated: true };
  }
  return { html: result.value, truncated: false };
}

self.onmessage = async (event: MessageEvent<DocPreviewRequest>) => {
  const { kind, buffer } = event.data;
  try {
    const { html, truncated } = kind === "docx"
      ? await docxToHtml(buffer)
      : xlsxToHtml(buffer);
    const response: DocPreviewResponse = { ok: true, html, truncated };
    (self as unknown as Worker).postMessage(response);
  } catch {
    const response: DocPreviewResponse = { ok: false };
    (self as unknown as Worker).postMessage(response);
  }
};
