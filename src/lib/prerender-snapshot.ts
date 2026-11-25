// Ready markup that scripts/prerender-public.mjs put into #root (site-redesign
// 1.2). createRoot() replaces it on the first render, and the first render of
// a lazy route is its Suspense fallback, so without this the page would blink
// to «Загрузка…» between the static HTML and React. main.tsx captures the
// markup before rendering; the route fallback paints it back while the route
// chunk loads, and only on the address it was built for.

let snapshot: { route: string; html: string } | null = null;

function normalize(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** Only on the address the markup was built for: dist/index.html is also the
 * fallback of every app route, and a landing snapshot taken there would later
 * paint unstyled on an in-app navigation to "/" (review of PR #389). */
export function capturePrerenderSnapshot(
  doc: Document = document,
  pathname: string = typeof location === "undefined" ? "/" : location.pathname,
): void {
  const element = doc.querySelector<HTMLElement>("#root > [data-prerendered-route]");
  const route = element?.getAttribute("data-prerendered-route");
  snapshot =
    element && route && normalize(route) === normalize(pathname)
      ? { route: normalize(route), html: element.innerHTML }
      : null;
}

export function prerenderedHtmlFor(pathname: string): string | null {
  return snapshot && snapshot.route === normalize(pathname) ? snapshot.html : null;
}

export function resetPrerenderSnapshot(): void {
  snapshot = null;
}
