// CookieConsentBanner — the one-time cookie notice (rovno#333).
//
// A narrow light card centred at the bottom: cookie icon, one sentence and the
// accent pill «Хорошо». No overlay and no focus grab: the page underneath stays
// usable. Metrika keeps running as it
// did (Vlad's decision 11.11, variant B); switching analytics off lives in
// «Настройки cookie», opened from the landing footer.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Cookie } from "lucide-react";
import { cn } from "@/lib/utils";
import { currentUrlCarriesAuthCredential } from "@/lib/analytics";
import {
  cookieConsentPending,
  getCookieConsentRevision,
  subscribeCookieConsent,
  writeCookieConsent,
} from "@/lib/cookie-consent";

/** Routes rendered inside AppLayout, where Shurik (left) and «Обратная связь» (right) float at the bottom. */
const APP_SHELL_PREFIXES = ["/home", "/demo", "/profile", "/settings", "/billing", "/blog/admin", "/project"];

export function isAppShellPath(pathname: string): boolean {
  return APP_SHELL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Auth landings whose address holds (or just held) a sign-in credential. */
const HIDDEN_PATHS: ReadonlySet<string> = new Set(["/auth/callback", "/auth/yandex/callback", "/auth/vk/callback"]);

const APPEAR_DELAY_MS = 600;
const EXIT_MS = 160;
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

type Phase = "waiting" | "shown" | "leaving" | "gone";

function usePending(): boolean {
  // The revision changes on every write, so subscribers re-read the pending flag.
  useSyncExternalStore(subscribeCookieConsent, getCookieConsentRevision, () => 0);
  return cookieConsentPending();
}

export function CookieConsentBanner() {
  const { t } = useTranslation();
  const { pathname, search, hash } = useLocation();
  const pending = usePending();
  const [phase, setPhase] = useState<Phase>("waiting");
  const cardRef = useRef<HTMLDivElement>(null);

  // search and hash are dependencies on purpose: the credential check reads window.location.
  const hiddenHere = useMemo(
    () => HIDDEN_PATHS.has(pathname) || currentUrlCarriesAuthCredential(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pathname, search, hash],
  );
  // The write behind «Хорошо» clears `pending` at once; "leaving" keeps the card
  // mounted for its 160 ms exit.
  const visible = (pending || phase === "leaving") && !hiddenHere && phase !== "gone";
  const inApp = isAppShellPath(pathname);

  useEffect(() => {
    if (!pending || hiddenHere || phase !== "waiting") return;
    const timer = window.setTimeout(() => setPhase("shown"), APPEAR_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending, hiddenHere, phase]);

  useEffect(() => {
    if (phase !== "leaving") return;
    const timer = window.setTimeout(() => setPhase("gone"), EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // On public pages the fixed card would cover the end of the page (the footer
  // links, «Настройки cookie» among them), so reserve its height while it shows.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!visible || inApp || !card) return;
    // The landing, the public blog and the knowledge base end on the dark landing
    // footer, which takes the room itself through --cookie-banner-h; body padding
    // there would show a light band under it.
    const onLanding =
      pathname === "/" || ["/blog", "/baza"].some((p) => pathname === p || pathname.startsWith(`${p}/`));
    const body = document.body;
    const root = document.documentElement;
    const previous = body.style.paddingBottom;
    const apply = () => {
      const room = `${card.offsetHeight + 24}px`;
      if (onLanding) root.style.setProperty("--cookie-banner-h", room);
      else body.style.paddingBottom = room;
    };
    apply();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    observer?.observe(card);
    return () => {
      observer?.disconnect();
      root.style.removeProperty("--cookie-banner-h");
      body.style.paddingBottom = previous;
    };
  }, [visible, inApp, pathname]);

  if (!visible) return null;

  const accept = () => {
    writeCookieConsent(true);
    setPhase("leaving");
  };

  const raised = phase === "shown";
  const motion: CSSProperties = {
    opacity: raised ? 1 : 0,
    transitionProperty: "opacity, transform",
    transitionDuration: phase === "leaving" ? `${EXIT_MS}ms` : "240ms",
    transitionTimingFunction: EASE_OUT,
    // Below md the card spans the width; above it is centred by translate.
    ["--ck-y" as string]: raised ? "0px" : phase === "leaving" ? "12px" : "24px",
  };

  return (
    <div
      ref={cardRef}
      role="region"
      aria-label={t("cookieConsent.regionLabel")}
      data-testid="cookie-consent-banner"
      aria-hidden={raised ? undefined : true}
      style={motion}
      className={cn(
        "fixed z-40 flex flex-wrap items-start gap-3 border border-border bg-card p-3.5 text-card-foreground",
        "rounded-panel shadow-[0_12px_32px_hsl(52_40%_4%/0.14),0_2px_6px_hsl(52_40%_4%/0.06)]",
        "left-3 right-3 bottom-[calc(12px+env(safe-area-inset-bottom))]",
        "[transform:translateY(var(--ck-y))] motion-reduce:[transform:none]",
        "md:left-1/2 md:right-auto md:bottom-4 md:w-max md:flex-nowrap md:items-center md:gap-3.5 md:p-2.5",
        "md:[transform:translate(-50%,var(--ck-y))] md:motion-reduce:[transform:translateX(-50%)]",
        inApp ? "md:max-w-[calc(100%-400px)]" : "md:max-w-[calc(100%-32px)]",
        !raised && "pointer-events-none",
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-accent/[0.12] text-accent md:h-9 md:w-9"
      >
        <Cookie className="h-5 w-5" />
      </span>
      <p className="m-0 min-w-0 flex-[1_1_200px] self-center text-[15px] leading-[22px] md:flex-[0_1_auto]">
        {t("cookieConsent.text")}
      </p>
      <button
        type="button"
        onClick={accept}
        tabIndex={raised ? undefined : -1}
        className={cn(
          "inline-flex h-11 flex-[1_1_100%] items-center justify-center rounded-pill bg-accent px-7 text-[15px] font-semibold text-accent-foreground",
          "transition-[transform,background-color] duration-150 ease-out hover:bg-accent/90 active:scale-[0.97]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          "md:h-10 md:flex-none",
        )}
      >
        {t("cookieConsent.ok")}
      </button>
    </div>
  );
}
