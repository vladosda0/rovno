import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to the URL `#hash` target on every react-router navigation.
 *
 * BrowserRouter does not scroll to a hash on its own, and the app renders every
 * page client-side (lazy routes behind Suspense), so a link to `/#pricing` —
 * from the landing nav, the footer, a billing screen, Settings, the offer page,
 * anywhere — would otherwise land at the TOP of a freshly-mounted page instead
 * of the section. Before this existed, "Тарифы" from the blog top bar dumped you
 * at the top of the landing. This centralizes the behavior so every hash link
 * lands where it points, from any origin.
 *
 * Placed once inside <BrowserRouter> but outside <Routes> (same slot as
 * MetrikaPageviewTracker), so it stays mounted across route changes.
 *
 * NB: native in-article anchors on blog posts (raw <a href="#id"> inside the
 * rendered HTML) don't go through react-router, so this doesn't fire for them;
 * BlogPostPage keeps its own article-specific landing logic. A deep link like
 * `/blog/slug#heading` is handled by both and converges on the same element.
 */

// How long to keep chasing the target before giving up, and how often to check.
const WAIT_MS = 3000;
const POLL_MS = 50;

export function ScrollToHash(): null {
  const { pathname, hash, key } = useLocation();
  // Previous pathname distinguishes a same-page hash change (already on the
  // landing → animate smoothly, layout is settled) from a cross-page jump
  // (blog / app → a landing section → land instantly on a page still rendering).
  //
  // NB: this relies on the effect running once per navigation, which is correct
  // under the app's current (non-StrictMode) root. If <App> is ever wrapped in
  // <StrictMode>, its dev-only mount double-invoke would let the second run read
  // the pathname the first run just wrote and misclassify a hard load as
  // same-page — this decision would then need to move off a during-run-mutated
  // ref (e.g. gate on whether the target is already in the DOM).
  const prevPathname = useRef<string | null>(null);

  useEffect(() => {
    const from = prevPathname.current;
    prevPathname.current = pathname;

    if (!hash) return;

    // decodeURIComponent throws URIError on a malformed escape (e.g. "#50%").
    // An unguarded throw here would trip the RootErrorBoundary and blank the
    // app, so guard it. A bad hash is simply not a target.
    let id: string;
    try {
      id = decodeURIComponent(hash.slice(1));
    } catch {
      return;
    }
    // Ignore query-style fragments (`#access_token=…&…`, used by some auth
    // redirect flows) — they are never element ids, and chasing one would just
    // spin the wait loop for nothing.
    if (!id || /[=&]/.test(id)) return;

    // Same-page hash nav: the page is already rendered and laid out, so the
    // target is at its final position — one smooth scroll is all it needs.
    if (from === pathname) {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    // Cross-page jump. The destination is lazy (Suspense) and its layout settles
    // over several frames: the target element can be inserted BEFORE the sections
    // above it render, so it briefly sits at document-top (y≈0). Scrolling to it
    // once, the moment it appears, is therefore a no-op that leaves you at the
    // top. Instead, re-pin to it until its absolute position holds steady across
    // two checks (layout has settled), then stop.
    //
    // setTimeout (not requestAnimationFrame) is deliberate: rAF is fully paused
    // in a hidden/background tab, so an anchor opened in a background tab would
    // never scroll; setTimeout still fires (throttled) and scrollIntoView("auto")
    // works while hidden.
    let timer = 0;
    let cancelled = false;
    let lastTop: number | null = null;
    const startedAt = Date.now();

    const finish = () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("wheel", finish);
      window.removeEventListener("touchstart", finish);
      window.removeEventListener("keydown", finish);
    };

    const step = () => {
      if (cancelled) return;
      const el = document.getElementById(id);
      if (el) {
        const top = Math.round(el.getBoundingClientRect().top + window.scrollY);
        // block:"start" respects the sections' CSS `scroll-margin-top`
        // (landing.css), so the target clears the fixed nav.
        el.scrollIntoView({ behavior: "auto", block: "start" });
        if (top === lastTop) {
          // Position unchanged since the previous check → layout has settled.
          finish();
          return;
        }
        lastTop = top;
      }
      if (Date.now() - startedAt >= WAIT_MS) {
        finish();
        return;
      }
      timer = window.setTimeout(step, POLL_MS);
    };

    // Bail if the visitor scrolls or interacts while we're chasing the target,
    // so a late re-pin never yanks them away from where they chose to be. Covers
    // wheel, trackpad, touch and keyboard; a native-scrollbar drag emits no
    // cancellable DOM event, so in the brief settling window it is the one input
    // not caught — an acceptable edge, since the loop ends the moment layout
    // settles (usually within a few polls of the target appearing).
    window.addEventListener("wheel", finish, { passive: true });
    window.addEventListener("touchstart", finish, { passive: true });
    window.addEventListener("keydown", finish);

    step();

    return finish;
    // `key` is unique per history entry, so re-clicking the same hash link
    // (identical pathname + hash) still re-triggers the scroll.
  }, [pathname, hash, key]);

  return null;
}
