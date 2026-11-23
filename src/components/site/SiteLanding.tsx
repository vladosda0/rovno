// The new landing (site-redesign slice 1): the designer's page from PR #337
// with our plans, checked texts and real articles. One tree for the browser
// (pages/Landing.tsx) and for the build-time render crawlers read
// (src/ssr/public-pages.tsx).
import "./site.css";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import { SiteResources } from "./SiteResources";
import { SiteShurik } from "./SiteShurik";
import { SitePageMotion } from "./SitePageMotion";
import { SiteCursor } from "./SiteCursor";
import { SiteSmoothScroll } from "./SiteSmoothScroll";
import {
  SiteAudience,
  SiteBlog,
  SiteFaq,
  SiteFeatures,
  SiteFinalCta,
  SiteHero,
  SitePricing,
  SiteProblem,
  type SiteBlogPost,
  type SitePlanCode,
} from "./SiteSections";
import { ANONYMOUS_CTA, type SiteCta } from "./site-links";

export interface SiteLandingProps {
  cta?: SiteCta;
  posts?: readonly SiteBlogPost[];
  onPlanClick?: (code: SitePlanCode) => void;
}

export function SiteLanding({ cta = ANONYMOUS_CTA, posts = [], onPlanClick }: SiteLandingProps) {
  return (
    <div className="rv-site">
      <div className="landing-shell" id="top">
        <SitePageMotion />
        <SiteHeader cta={cta} />
        <main className="landing-page" id="main-content">
          <SiteHero cta={cta} />
          <SiteProblem />
          <SiteResources />
          <SiteFeatures />
          <SiteShurik cta={cta} />
          <SiteAudience />
          <SitePricing cta={cta} onPlanClick={onPlanClick} />
          <SiteFaq />
          <SiteBlog posts={posts} />
          <SiteFinalCta cta={cta} />
        </main>
        <SiteFooter />
      </div>
      <SiteCursor />
      <SiteSmoothScroll />
    </div>
  );
}
