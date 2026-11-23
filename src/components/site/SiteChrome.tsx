// The new header and footer around pages whose body keeps its current look
// until slice 2 (blog, knowledge base). Each sits in its own .rv-site scope so
// the prototype's element rules never reach the page body.
import type { ReactNode } from "react";
import "./site.css";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import type { SiteCta } from "./site-links";

export function SiteChrome({ cta, children }: { cta: SiteCta; children: ReactNode }) {
  return (
    <>
      <div className="rv-site rv-site--chrome">
        <div className="landing-shell landing-shell--chrome">
          <SiteHeader cta={cta} />
        </div>
      </div>
      {children}
      <div className="rv-site rv-site--chrome">
        <div className="landing-shell landing-shell--chrome">
          <SiteFooter />
        </div>
      </div>
    </>
  );
}
