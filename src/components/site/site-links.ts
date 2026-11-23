// Where the public site's calls to action lead. The landing is rendered at
// build time for a visitor who is not signed in; in the browser the page
// passes the auth-aware start path (useLandingCta).
export interface SiteCta {
  /** «Начать бесплатно»: /auth/signup, or /home when signed in. */
  readonly startPath: string;
  /** «Войти»: /auth/login, or /home when signed in. */
  readonly loginPath: string;
  readonly signedIn: boolean;
}

export const ANONYMOUS_CTA: SiteCta = { startPath: "/auth/signup", loginPath: "/auth/login", signedIn: false };

/** The demo is a linkable route that starts the sandboxed demo session (pages/Demo.tsx). */
export const DEMO_PATH = "/demo";

export const SITE_NAVIGATION: ReadonlyArray<{ label: string; href: string; anchor: string | null }> = [
  { label: "Возможности", href: "/#features", anchor: "features" },
  { label: "Для кого", href: "/#audience", anchor: "audience" },
  { label: "Тарифы", href: "/#pricing", anchor: "pricing" },
  { label: "FAQ", href: "/#faq", anchor: "faq" },
  { label: "Блог", href: "/blog/", anchor: null },
  { label: "База знаний", href: "/baza/", anchor: null },
];
