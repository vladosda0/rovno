import DOMPurify from "dompurify";

// Sanitizes HTML produced by the Office parsers (mammoth/SheetJS) from untrusted
// file content, before it is injected via dangerouslySetInnerHTML.
//
// Guarantees:
//   - No scripts / event handlers (DOMPurify defaults).
//   - No inline `style` (FORBID_ATTR) and no <style>/<link> tags (FORBID_TAGS) —
//     closes the `url()` / @import data-exfil paths; the preview wrapper styles
//     tables via Tailwind classes instead.
//   - No external resource fetches: <img src> / <source src> must be data: URIs
//     (mammoth inlines images as data URIs), and links are forced to
//     rel="noopener noreferrer" target="_blank". This keeps the
//     "no document data leaves the browser to a third party" guarantee robust
//     even if the upstream renderer changes what markup it emits.
//
// Returns "" when the input sanitizes to nothing, so callers can treat empty as
// "no inline preview" rather than rendering an empty box.

const HOOK = "afterSanitizeAttributes";

function hardenNode(node: Element): void {
  // Block external resource URLs; only inline data: URIs are allowed.
  for (const attr of ["src", "srcset"]) {
    const value = node.getAttribute(attr);
    if (value && !value.trim().toLowerCase().startsWith("data:")) {
      node.removeAttribute(attr);
    }
  }
  // Neutralize link targets: open in a new tab with no opener access.
  if (node.tagName === "A" && node.hasAttribute("href")) {
    node.setAttribute("rel", "noopener noreferrer");
    node.setAttribute("target", "_blank");
  }
}

export function sanitizeOfficeHtml(rawHtml: string): string {
  // Scope the hook to this call so it can't affect other DOMPurify use sites.
  DOMPurify.addHook(HOOK, hardenNode);
  try {
    const clean = DOMPurify.sanitize(rawHtml, {
      FORBID_ATTR: ["style"],
      // Also drop <style>/<link>: the only markup DOMPurify would otherwise keep
      // that can fetch external resources (@import / url()). Closes the last gap
      // in the "no external fetch" guarantee.
      FORBID_TAGS: ["style", "link"],
    });
    return clean.trim();
  } finally {
    DOMPurify.removeHook(HOOK);
  }
}
