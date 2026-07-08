// Visible breadcrumb trail for an article page.
//
// The BreadcrumbList JSON-LD has existed since the blog shipped, but nothing on
// the page showed it. Google expects the two to agree, and treats unmatched
// markup as less trustworthy — so both are built from articleBreadcrumbTrail().

import { Link } from "react-router-dom";
import type { BreadcrumbEntry } from "@/lib/blog/jsonld";

export function Breadcrumbs({ trail }: { trail: BreadcrumbEntry[] }) {
  if (trail.length === 0) return null;
  const last = trail.length - 1;

  return (
    <nav className="rv-breadcrumbs" aria-label="Навигация по разделам">
      <ol>
        {trail.map((entry, index) =>
          index === last ? (
            // The current page is not a link, and carries aria-current.
            <li key={entry.path}>
              <span aria-current="page">{entry.name}</span>
            </li>
          ) : (
            <li key={entry.path}>
              <Link to={entry.path}>{entry.name}</Link>
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}
