// Marketing landing: the new site from the designer's PR #337 (epic
// site-redesign, slice 1). The page itself is src/components/site/SiteLanding,
// the same tree the build renders to HTML for crawlers
// (src/ssr/public-pages.tsx, scripts/prerender-public.mjs). This wrapper adds
// what only the browser has: the auth-aware calls to action, the three latest
// articles, the head for in-app navigation and the funnel goals.
//
// No language switcher and no hreflang: the English version is a separate
// task (rovno#387), and /?lang=en shows this Russian page.
import { useEffect } from "react";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { usePublishedBlogPosts } from "@/hooks/use-blog";
import { trackEvent, trackEventOncePerSession } from "@/lib/analytics";
import { useDocumentHead } from "@/lib/blog/seo";
import { SiteLanding } from "@/components/site/SiteLanding";
import { publicRouteHead } from "@/components/site/site-data";
import type { SiteCta } from "@/components/site/site-links";

const HEAD = publicRouteHead("/")!;

export default function Landing() {
  const { status } = useRuntimeAuth();
  const signedIn = status === "authenticated";
  const cta: SiteCta = {
    startPath: signedIn ? "/home" : "/auth/signup",
    loginPath: signedIn ? "/home" : "/auth/login",
    signedIn,
  };
  const { data: posts } = usePublishedBlogPosts(3);

  useDocumentHead({ title: HEAD.title, description: HEAD.description, canonicalPath: "/", ogImage: "https://rovno.ai/og-image.png" });

  // Signup-funnel step 1 (observability v1).
  useEffect(() => {
    trackEvent("landing_view");
  }, []);

  // «Тарифы» seen: once per session, when the section scrolls into view.
  useEffect(() => {
    const section = document.getElementById("pricing");
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        trackEventOncePerSession("pricing_page_viewed");
        observer.disconnect();
      }
    });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <SiteLanding
      cta={cta}
      posts={posts ?? []}
      onPlanClick={(code) => {
        if (code !== "free") trackEvent("billing_plan_selected", { plan: code });
      }}
    />
  );
}
