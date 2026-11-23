// Site header from the designer's prototype (PR #337, components/SiteHeader.tsx).
// Navigation is real links (the prototype used buttons), so crawlers and
// agents see the site's structure; «База знаний» added by the agent's decision
// 2026-11-23 (epic site-redesign, section 4).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SiteButtonLink } from "./SiteButton";
import { ANONYMOUS_CTA, DEMO_PATH, SITE_NAVIGATION, type SiteCta } from "./site-links";

export function SiteHeader({ cta = ANONYMOUS_CTA }: { cta?: SiteCta }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerLight, setHeaderLight] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  // Cream header over the blue panels (Шурик, final call to action).
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const panels = Array.from(document.querySelectorAll<HTMLElement>(".shurik-section,.final-cta"));
    let frame = 0;
    function update() {
      frame = 0;
      if (!header) return;
      const rect = header.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const light = panels.some((panel) => {
        const r = panel.getBoundingClientRect();
        return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
      });
      setHeaderLight((previous) => (previous === light ? previous : light));
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    panels.forEach((panel) => observer.observe(panel));
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    addEventListener("pageshow", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      removeEventListener("pageshow", schedule);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const background = Array.from(document.querySelectorAll<HTMLElement>("main,.landing-footer"));
    const inertBefore = background.map((element) => element.inert);
    background.forEach((element) => {
      element.inert = true;
    });
    function close() {
      setMenuOpen(false);
      menuButtonRef.current?.focus({ preventScroll: true });
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "Tab") {
        const controls = Array.from(
          document.querySelectorAll<HTMLElement>(".site-header a,.site-header button,#mobile-navigation a"),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    }
    function onOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !headerRef.current?.contains(event.target) &&
        !document.getElementById("mobile-navigation")?.contains(event.target)
      ) {
        close();
      }
    }
    function onResize() {
      if (innerWidth >= 744) close();
    }
    menuButtonRef.current?.focus({ preventScroll: true });
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onOutside);
    addEventListener("resize", onResize);
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      document.body.style.overflow = previousBodyOverflow;
      background.forEach((element, index) => {
        element.inert = inertBefore[index];
      });
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onOutside);
      removeEventListener("resize", onResize);
    };
  }, [menuOpen]);

  const light = headerLight && !menuOpen;
  const links = SITE_NAVIGATION.map((item) => (
    <a key={item.label} href={item.href} onClick={() => setMenuOpen(false)}>
      {item.label}
    </a>
  ));

  return (
    <>
      {menuOpen && <div className="mobile-header-placeholder" aria-hidden="true" />}
      <header className="site-header" data-menu-open={menuOpen} ref={headerRef} data-surface={light ? "light" : "blue"}>
        <div className="header-start">
          <button
            ref={menuButtonRef}
            type="button"
            className="menu-toggle"
            aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <img
              src={menuOpen ? "/site/hero/menu-close.svg" : light ? "/site/hero/menu-light.svg" : "/site/hero/menu.svg"}
              width="24"
              height="24"
              alt=""
            />
          </button>
          <a className="site-logo" href="/" aria-label="Ровно — на главную">
            <span className="logo-window">
              <img src="/site/hero/brand-mark.webp" width="192" height="192" alt="" />
            </span>
          </a>
        </div>
        <nav className="desktop-navigation" aria-label="Основная навигация">
          {links}
        </nav>
        <div className="header-actions">
          <SiteButtonLink variant={light ? "tertiary" : "secondary"} href={cta.loginPath}>
            {cta.signedIn ? "Мои проекты" : "Войти"}
          </SiteButtonLink>
          <SiteButtonLink variant={light ? "white" : "primary"} href={DEMO_PATH}>
            <span className="desktop-copy">Посмотреть демо</span>
            <span className="compact-copy">Демо</span>
          </SiteButtonLink>
        </div>
        {menuOpen &&
          createPortal(
            <div className="rv-site-portal mobile-menu-layer">
              <nav id="mobile-navigation" className="mobile-navigation" aria-label="Мобильная навигация">
                {links}
              </nav>
            </div>,
            document.body,
          )}
      </header>
    </>
  );
}
