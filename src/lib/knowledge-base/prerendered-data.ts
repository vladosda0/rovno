// Reads the document inlined by scripts/prerender-kb.mjs into
// <script type="application/json" id="__KB_DOC_DATA__"> on /baza/<slug>/.
// Used as React Query initialData so the SPA paints the same document with no
// fetch flash; on a client-side navigation the tag is absent and the hook fetches.

import { normalizeKbRow } from "./kbConfig.mjs";
import type { KbDocument } from "./api";

export const KB_DOC_DATA_ID = "__KB_DOC_DATA__";

export function readPrerenderedKbDocument(slug: string): KbDocument | undefined {
  const el = document.getElementById(KB_DOC_DATA_ID);
  if (!el || el.tagName !== "SCRIPT") return undefined;
  try {
    const row = JSON.parse(el.textContent ?? "") as Record<string, unknown>;
    return row && row.slug === slug ? normalizeKbRow(row) : undefined;
  } catch {
    return undefined;
  }
}
