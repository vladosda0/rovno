// Public knowledge-base document page — rovno.ai/baza/:slug/ (docs-library 1.5).
//
// Works for a guest without login, in the blog's public chrome (site header, no
// app menu). Prerendered at build time by scripts/prerender-kb.mjs for crawlers;
// the SPA reads the inlined row as initialData. The facts and source buttons are
// the same as in the in-app document window (kbConfig.buildKbDocumentView).

import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BlogShell } from "@/components/blog/BlogShell";
import { useDocumentHead } from "@/lib/blog/seo";
import { useKbDocument } from "@/hooks/use-knowledge-base";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { useKbDocumentView } from "@/components/knowledge-base/kb-view";
import { readPrerenderedKbDocument } from "@/lib/knowledge-base/prerendered-data";
import { kbDocPath, kbPageDescription, kbPageTitle } from "@/lib/knowledge-base/kbConfig.mjs";

/** Sign-up, the same target as the landing and blog CTA for a guest (useLandingCta). */
const SIGN_UP_PATH = "/auth/signup";

const textStyle = { fontFamily: "var(--font-body)", color: "var(--rv-blue)" } as const;

export default function KbDocumentPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  // useMemo keyed on slug, not useState: the element is reused across a :slug change
  // (same trap BlogPostPage documents).
  const initialDoc = useMemo(() => (slug ? readPrerenderedKbDocument(slug) : undefined), [slug]);
  const { data: doc, isLoading, isError, refetch, isFetching } = useKbDocument(slug, initialDoc);
  const view = useKbDocumentView(doc ?? null);
  // «Спросить Шурика» is for guests only (step 1.6): a signed-in user gets it with
  // slice 4, when Shurik answers from the base. Hidden while auth is still loading.
  const { status: authStatus } = useRuntimeAuth();
  const showAskShurik = authStatus === "guest";

  useDocumentHead(
    doc
      ? {
          title: kbPageTitle(doc),
          description: kbPageDescription(doc),
          canonicalPath: kbDocPath(doc.slug),
          ogType: "article",
        }
      : null,
  );

  if (isLoading) {
    return (
      <BlogShell>
        <section className="rv-section" style={{ padding: "96px 48px", minHeight: "40vh" }}>
          <p style={{ ...textStyle, fontSize: 16, opacity: 0.64 }}>{t("home.knowledgeBase.public.loading")}</p>
        </section>
      </BlogShell>
    );
  }

  // A failed read is not a missing document: say so, and offer a retry.
  if (isError && !doc) {
    return (
      <BlogShell>
        <section
          className="rv-section"
          style={{ padding: "128px 48px", display: "flex", flexDirection: "column", gap: 24, alignItems: "center", textAlign: "center", minHeight: "40vh" }}
        >
          <p style={{ ...textStyle, fontSize: 18, margin: 0 }}>{t("home.knowledgeBase.loadError")}</p>
          <button type="button" className="rv-btn rv-btn--secondary" onClick={() => void refetch()} disabled={isFetching}>
            {t("common.retry")}
          </button>
        </section>
      </BlogShell>
    );
  }

  if (!doc || !view) {
    return (
      <BlogShell>
        <section
          className="rv-section"
          style={{ padding: "128px 48px", display: "flex", flexDirection: "column", gap: 24, alignItems: "center", textAlign: "center", minHeight: "40vh" }}
        >
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 48, lineHeight: 1, color: "var(--rv-blue)", margin: 0 }}>
            {t("home.knowledgeBase.public.notFoundTitle")}
          </h1>
          <p style={{ ...textStyle, fontSize: 16, opacity: 0.72, margin: 0 }}>{t("home.knowledgeBase.public.notFoundBody")}</p>
        </section>
      </BlogShell>
    );
  }

  return (
    <BlogShell>
      <article className="rv-kb-doc">
        <section className="rv-section" style={{ padding: "64px 48px 96px" }}>
          <nav className="rv-breadcrumbs" aria-label="Навигация по разделам">
            <ol>
              <li>
                <span>{t("home.knowledgeBase.title")}</span>
              </li>
              <li>
                <span aria-current="page">{t(`home.knowledgeBase.folders.${doc.folder}.title`)}</span>
              </li>
            </ol>
          </nav>
          <header className="rv-article-header">
            <h1 className="rv-article-title">{view.heading}</h1>
            {doc.category && <p className="rv-article-subtitle">{doc.category}</p>}
          </header>

          {view.rows.length > 0 && (
            <dl className="rv-kb-facts">
              {view.rows.map((row) => (
                <div key={row.key} className="rv-kb-facts__row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {view.showFullTextLater && (
            <p style={{ ...textStyle, fontSize: 16, opacity: 0.72 }}>{t("home.knowledgeBase.fullTextLater")}</p>
          )}

          <div className="rv-kb-actions">
            {view.buttons.map((button, index) => (
              <a
                key={button.href}
                className={index === 0 ? "rv-btn rv-btn--primary" : "rv-btn rv-btn--secondary"}
                href={button.href}
                target="_blank"
                rel="noopener noreferrer"
              >
                {button.label}
              </a>
            ))}
            {showAskShurik && (
              <Link className="rv-btn rv-btn--secondary rv-kb-ask" to={SIGN_UP_PATH}>
                {t("home.knowledgeBase.askShurik")}
              </Link>
            )}
          </div>
        </section>
      </article>
    </BlogShell>
  );
}
