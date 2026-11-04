// Public «Решения» pages (docs-library slice 4, step 4.7, frame 6):
// rovno.ai/baza/resheniya/ (every published card as a link) and
// /baza/resheniya/<slug>/ (the card). Built like the document page and the
// folder hubs: blog chrome, breadcrumbs that match the BreadcrumbList markup,
// JSON-LD. Prerendered by scripts/prerender-kb.mjs with every case of the card
// in the HTML; the SPA reads the inlined card as initialData.

import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BlogShell } from "@/components/blog/BlogShell";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { KbLabelBadge } from "@/components/knowledge-base/KbTextLabel";
import { KbSolutionCard } from "@/components/knowledge-base/KbSolutionCard";
import { useDocumentHead } from "@/lib/blog/seo";
import { useKbSolution, useKbSolutions } from "@/hooks/use-knowledge-base";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { readPrerenderedKbSolution } from "@/lib/knowledge-base/prerendered-data";
import { kbDocPath } from "@/lib/knowledge-base/kbConfig.mjs";
import {
  KB_SOLUTIONS_PATH,
  kbSolutionCheckedDate,
  kbSolutionPath,
  type KbFactChip,
} from "@/lib/knowledge-base/kbSolutions.mjs";
import {
  KB_INDEX_PATH,
  kbSolutionDescription,
  kbSolutionJsonLd,
  kbSolutionTitle,
  kbSolutionsDescription,
  kbSolutionsJsonLd,
  kbSolutionsTitle,
  kbSolutionsTrail,
  solutionsCountText,
} from "@/lib/knowledge-base/kbSeo.mjs";

/** Sign-up, the same target as the document page's guest CTA (decision D6). */
const SIGN_UP_PATH = "/auth/signup";

const H1 = {
  fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1, letterSpacing: "-0.03em",
  color: "var(--rv-blue)", margin: "16px 0 0",
} as const;
const LEAD = { fontFamily: "var(--font-body)", fontSize: 18, color: "var(--rv-blue)", opacity: 0.8, marginTop: 12 } as const;
const MUTED = { fontFamily: "var(--font-body)", fontSize: 16, color: "var(--rv-blue)", opacity: 0.64 } as const;

function useTr() {
  const { t } = useTranslation();
  return (key: string, vars?: Record<string, unknown>) => t(key, vars) as string;
}

/** The guest document page on the clause: /baza/<doc>/#p-…  */
function guestClauseHref(chip: KbFactChip): string | null {
  if (!chip.docSlug) return null;
  return `${kbDocPath(chip.docSlug)}${chip.anchor ? `#${chip.anchor}` : ""}`;
}

function NotFound({ title, body }: { title: string; body: string }) {
  const t = useTr();
  return (
    <BlogShell>
      <section className="rv-section" style={{ padding: "128px 48px", textAlign: "center", minHeight: "40vh" }}>
        <h1 style={{ ...H1, fontSize: 48 }}>{title}</h1>
        <p style={MUTED}>{body}</p>
        <p style={MUTED}>
          <Link to={KB_INDEX_PATH}>{t("home.knowledgeBase.title")}</Link>
        </p>
      </section>
    </BlogShell>
  );
}

export function KbSolutionsPage() {
  const t = useTr();
  const query = useKbSolutions();
  const solutions = query.data ?? [];
  const title = kbSolutionsTitle();
  const description = kbSolutionsDescription(t, solutions.length);

  useDocumentHead(
    query.isLoading || solutions.length > 0
      ? {
          title,
          description,
          canonicalPath: KB_SOLUTIONS_PATH,
          ogType: "website",
          jsonLd: solutions.length ? kbSolutionsJsonLd(t, solutions) : null,
        }
      : // No published card: no folder (frame 1), and nothing to index.
        { title, robots: "noindex, follow" },
  );

  if (!query.isLoading && !query.isError && solutions.length === 0) {
    return <NotFound title={t("home.knowledgeBase.solutions.notFoundTitle")} body={t("home.knowledgeBase.public.notFoundBody")} />;
  }

  return (
    <BlogShell>
      <section className="rv-section rv-kb-hub" style={{ padding: "64px 48px 96px" }}>
        <Breadcrumbs trail={kbSolutionsTrail(t)} />
        <h1 style={H1}>{t("home.knowledgeBase.solutions.title")}</h1>
        <p style={LEAD}>
          {t("home.knowledgeBase.solutions.description")}
          {solutions.length > 0 && ` · ${solutionsCountText(t, solutions.length)}`}
        </p>
        {query.isLoading ? (
          <p style={MUTED}>{t("home.knowledgeBase.solutions.loadingList")}</p>
        ) : query.isError ? (
          <p style={MUTED}>{t("home.knowledgeBase.loadError")}</p>
        ) : (
          <ul className="rv-kb-doc-list">
            {solutions.map((s) => {
              const checked = kbSolutionCheckedDate(s);
              return (
                <li key={s.slug} className="rv-kb-doc-item">
                  <Link to={kbSolutionPath(s.slug)}>{s.title}</Link>
                  <span>
                    {s.recheckSince ? (
                      <KbLabelBadge kind="checking" text={t("home.knowledgeBase.label.checking")} />
                    ) : (
                      checked && <KbLabelBadge kind="verified" text={t("home.knowledgeBase.checkedOn", { date: checked })} />
                    )}{" "}
                    {s.summary}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </BlogShell>
  );
}

export function KbSolutionPublicPage() {
  const t = useTr();
  const { slug } = useParams<{ slug: string }>();
  // useMemo keyed on slug, not useState: the element is reused across a :slug change.
  const initial = useMemo(() => (slug ? readPrerenderedKbSolution(slug) : undefined), [slug]);
  const { data: solution, isLoading, isError } = useKbSolution(slug, initial);
  const { status: authStatus } = useRuntimeAuth();
  const showAskShurik = authStatus === "guest";

  useDocumentHead(
    solution
      ? {
          title: kbSolutionTitle(solution),
          description: kbSolutionDescription(solution),
          canonicalPath: kbSolutionPath(solution.slug),
          ogType: "article",
          jsonLd: kbSolutionJsonLd(solution, t),
        }
      : null,
  );

  if (isLoading) {
    return (
      <BlogShell>
        <section className="rv-section" style={{ padding: "96px 48px", minHeight: "40vh" }}>
          <p style={MUTED}>{t("home.knowledgeBase.solutions.loading")}</p>
        </section>
      </BlogShell>
    );
  }

  if (isError && !solution) {
    return <NotFound title={t("home.knowledgeBase.solutions.title")} body={t("home.knowledgeBase.loadError")} />;
  }

  if (!solution) {
    return <NotFound title={t("home.knowledgeBase.solutions.notFoundTitle")} body={t("home.knowledgeBase.public.notFoundBody")} />;
  }

  return (
    <BlogShell>
      <article className="rv-kb-doc rv-kb-solution">
        <section className="rv-section" style={{ padding: "64px 48px 96px" }}>
          <Breadcrumbs trail={kbSolutionsTrail(t, solution)} />
          <header className="rv-article-header">
            <h1 className="rv-article-title">{solution.title}</h1>
          </header>
          <KbSolutionCard
            solution={solution}
            clauseHref={guestClauseHref}
            headerExtra={
              showAskShurik ? (
                <div className="rv-kb-actions">
                  <Link className="rv-btn rv-btn--primary rv-kb-ask" to={SIGN_UP_PATH}>
                    {t("home.knowledgeBase.askShurik")}
                  </Link>
                </div>
              ) : null
            }
          />
        </section>
      </article>
    </BlogShell>
  );
}
