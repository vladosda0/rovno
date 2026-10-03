import {
  attemptRecoveryReload,
  type PreloadErrorHandlerOptions,
} from "@/lib/observability/preload-recovery";

/**
 * Recovery for a stylesheet that loaded successfully but is not CSS.
 *
 * When the host answers a missing `/assets/*.css` with the SPA fallback (200,
 * `text/html`), the browser fires `load`, not `error`, so `vite:preloadError`
 * never reports it and the page renders unstyled. See
 * docs/observability/alert-runbook.md § A4 for the host behaviour.
 *
 * The trigger is a sheet that parsed to zero rules. That alone is only a
 * suspect, because a legitimately empty CSS chunk looks the same, so each
 * suspect is confirmed by re-reading the response's `content-type`, and only
 * a non-CSS type reloads. Anything inconclusive declines: reloading on a guess
 * is worse than the unstyled page.
 *
 * Not handled on purpose: a stylesheet that fires `error`. Lazy-chunk CSS
 * already reaches `vite:preloadError`, and a second reload path for a network
 * error would reload offline users for something that is not this failure.
 */

/** Our own build output. External stylesheets (fonts, widgets) are not ours to judge. */
const ASSET_PATH_PREFIX = "/assets/";

export interface StylesheetGuardOptions extends PreloadErrorHandlerOptions {
  /** Injected so tests need no network and no jsdom CSS parser. */
  fetchImpl?: typeof fetch;
}

/**
 * A same-origin stylesheet emitted by our build.
 *
 * Same-origin matters twice: it is what makes `cssRules` readable at all, and
 * it keeps us from reloading the app because someone else's CDN had a bad day.
 */
function isOwnAssetStylesheet(link: HTMLLinkElement): boolean {
  // Lowercased because `rel` is case-insensitive in HTML; Vite emits lowercase,
  // but the stylesheets in index.html and the prerendered pages are not all ours.
  if (!link.rel.toLowerCase().split(/\s+/).includes("stylesheet")) return false;
  try {
    const url = new URL(link.href, window.location.href);
    return (
      url.origin === window.location.origin && url.pathname.startsWith(ASSET_PATH_PREFIX)
    );
  } catch {
    return false;
  }
}

/**
 * How many rules the browser actually parsed, or null when it cannot be known.
 *
 * Null covers both "not parsed yet" (no sheet) and "not allowed to look"
 * (`cssRules` throws on a cross-origin sheet). Both are inconclusive, and this
 * function must never report zero for either — a null that read as 0 would
 * reload the page on a stylesheet that is perfectly fine.
 */
function parsedRuleCount(link: HTMLLinkElement): number | null {
  const sheet = link.sheet;
  if (!sheet) return null;
  try {
    return sheet.cssRules.length;
  } catch {
    return null;
  }
}

/**
 * The response's content-type, lowercased, or null when it cannot be read.
 *
 * `force-cache` so the confirm normally costs no network at all: the browser
 * has just fetched this exact URL for the link. It also means we inspect the
 * response the link actually used rather than whatever a fresh request would
 * return, which is the honest question here.
 */
async function readContentType(
  href: string,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  try {
    const response = await fetchImpl(href, { cache: "force-cache" });
    return (response.headers.get("content-type") ?? "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Judge one stylesheet and, if it is confirmed non-CSS, spend the window's
 * reload. Resolves to true only when a reload was actually triggered.
 */
export async function inspectStylesheet(
  link: HTMLLinkElement,
  options: StylesheetGuardOptions,
): Promise<boolean> {
  if (!isOwnAssetStylesheet(link)) return false;

  const ruleCount = parsedRuleCount(link);
  if (ruleCount === null || ruleCount > 0) return false;

  const contentType = await readContentType(link.href, options.fetchImpl ?? fetch);
  // Inconclusive, or a genuinely empty stylesheet. Either way, not our bug.
  if (contentType === null || contentType.includes("text/css")) return false;

  return attemptRecoveryReload(
    "stylesheet",
    `Stylesheet ${link.href} loaded but parsed to 0 rules and was served as ` +
      `"${contentType || "no content-type"}"`,
    options,
  );
}

/**
 * Watch for our own stylesheets and check each one once: the links already in
 * the document, and the ones Vite's preload helper appends to `<head>` for a
 * lazy route.
 *
 * The observer watches `document.head` WITHOUT `subtree`: observing the whole
 * document for `childList` would fire on every React commit.
 *
 * Returns a teardown for tests. In the app it is installed once and never removed.
 */
export function installStylesheetGuard(options: StylesheetGuardOptions): () => void {
  if (typeof window === "undefined" || typeof MutationObserver === "undefined") {
    return () => {};
  }

  const seen = new WeakSet<HTMLLinkElement>();

  const check = (link: HTMLLinkElement): void => {
    if (!isOwnAssetStylesheet(link) || seen.has(link)) return;
    seen.add(link);
    // `inspectStylesheet` swallows its own failures; this is the belt-and-braces
    // that keeps a surprise from surfacing as an unhandled rejection.
    const run = () => void inspectStylesheet(link, options).catch(() => {});
    if (link.sheet) {
      run(); // already parsed: `load` has fired and will not fire again
    } else {
      link.addEventListener("load", run, { once: true });
    }
  };

  document
    .querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]')
    .forEach(check);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLLinkElement) check(node);
      }
    }
  });
  observer.observe(document.head, { childList: true });

  return () => observer.disconnect();
}
