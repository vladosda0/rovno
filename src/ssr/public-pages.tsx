// Build-time renderer of the public pages (site-redesign 1.2).
//
// Crawlers that matter here (GPTBot, ClaudeBot, PerplexityBot, YandexBot
// without its JS beta) read raw HTML, and the site is a static SPA. So the
// SAME React components a person sees are rendered to a string at build time
// (`vite build --ssr`, see package.json) and scripts/prerender-public.mjs puts
// that markup into dist/<route>/index.html. No string-template twin to drift.
//
// Everything imported from here must be safe to evaluate in Node: no
// module-level window/document, no Supabase client, no i18n bootstrap.
import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";
import Offer from "@/pages/legal/Offer";
import Privacy from "@/pages/legal/Privacy";
import Refund from "@/pages/legal/Refund";
import Contacts from "@/pages/legal/Contacts";
import { SiteLanding } from "@/components/site/SiteLanding";
import type { SiteBlogPost } from "@/components/site/SiteSections";
import {
  publicRouteHead,
  publicRouteJsonLd,
  type PublicRouteHead,
} from "@/components/site/site-data";

export interface PublicPageData {
  /** Latest published blog posts for the landing feed (from dist/blog). */
  readonly posts?: readonly SiteBlogPost[];
}

export interface RenderedPublicPage {
  readonly head: PublicRouteHead;
  readonly jsonLd: Record<string, unknown>[];
  /** Ready markup for #root; "" when the route ships head tags only. */
  readonly rootHtml: string;
}

const PAGES: Partial<Record<PublicRouteHead["route"], ComponentType<PublicPageData>>> = {
  "/": ({ posts }) => <SiteLanding posts={posts} />,
  "/offer/": Offer,
  "/privacy/": Privacy,
  "/refund/": Refund,
  "/contacts/": Contacts,
};

export const PUBLIC_PAGE_ROUTES = ["/", "/offer/", "/privacy/", "/refund/", "/contacts/"] as const;

export function renderPublicPage(route: string, data: PublicPageData = {}): RenderedPublicPage {
  const head = publicRouteHead(route);
  if (!head) throw new Error(`renderPublicPage: unknown public route ${route}`);
  const Page = PAGES[head.route];
  const rootHtml = Page
    ? renderToString(
        <StaticRouter location={head.route}>
          <Page {...data} />
        </StaticRouter>,
      )
    : "";
  return { head, jsonLd: publicRouteJsonLd(head), rootHtml };
}
