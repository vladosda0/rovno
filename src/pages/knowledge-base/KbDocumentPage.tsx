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
import { useKbClauses, useKbDocument, useKbSpFullText } from "@/hooks/use-knowledge-base";
import { useRuntimeAuth } from "@/hooks/use-runtime-auth";
import { useKbDocumentView } from "@/components/knowledge-base/kb-view";
import { readPrerenderedKbDocument } from "@/lib/knowledge-base/prerendered-data";
import { KbReader } from "@/components/knowledge-base/KbReader";
import { KbWatchButton } from "@/components/knowledge-base/KbWatchButton";
import { kbDocPath } from "@/lib/knowledge-base/kbConfig.mjs";
import {
  kbBreadcrumbTrail,
  kbDocumentDescription,
  kbDocumentJsonLd,
  kbDocumentTitle,
  kbFirstText,
} from "@/lib/knowledge-base/kbSeo.mjs";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";

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
  const sp = useKbSpFullText();
  const view = useKbDocumentView(doc ?? null, { spFullText: sp.data });
  // Slice 2: the full text under the card (frame 6). The SP switch off reads as
  // slice 1: no text, the «full text later» line, a #p-… link stays on the card.
  const clauses = useKbClauses(doc?.docId, !!view?.readable);
  // «Спросить Шурика» is for guests only (step 1.6): a signed-in user gets it with
  // slice 4, when Shurik answers from the base. Hidden while auth is still loading.
  const { status: authStatus } = useRuntimeAuth();
  const showAskShurik = authStatus === "guest";

  const tr = (key: string, vars?: Record<string, unknown>) => t(key, vars) as string;
  const clauseList = clauses.data ?? [];
  const description = doc
    ? kbDocumentDescription(doc, tr, { spFullText: sp.data, firstText: kbFirstText(clauseList) })
    : "";
  useDocumentHead(
    doc
      ? {
          title: kbDocumentTitle(doc, { spFullText: sp.data }),
          description,
          canonicalPath: kbDocPath(doc.slug),
          ogType: "article",
          jsonLd: kbDocumentJsonLd(doc, tr, { clauses: clauseList, spFullText: sp.data, description }),
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

  // A readable document: the reader carries the title, the site icon and the
  // label (slice 7); the facts and buttons above it are for records without a text.
  const readingHere = view.readable && !!clauses.data && clauses.data.length > 0;

  return (
    <BlogShell>
      <article className="rv-kb-doc">
        <section className="rv-section" style={{ padding: "64px 48px 96px" }}>
          <Breadcrumbs trail={kbBreadcrumbTrail(tr, { doc })} />
          {readingHere ? (
            <div className="rv-kb-reader">
              <KbReader
                doc={doc}
                clauses={clauses.data!}
                source={view.buttons[0] ?? null}
                variant="guest"
                headerExtra={
                  <>
                    {showAskShurik && (
                      <Link className="rv-btn rv-btn--primary rv-kb-ask" to={SIGN_UP_PATH}>
                        {t("home.knowledgeBase.askShurik")}
                      </Link>
                    )}
                    <KbWatchButton slug={doc.slug} appearance="site" />
                  </>
                }
              />
            </div>
          ) : (
            <>
          <header className="rv-article-header">
            <h1 className="rv-article-title">{view.heading}</h1>
            {doc.category && <p className="rv-article-subtitle">{doc.category}</p>}
          </header>
          {view.copyNotice && <p className="rv-kb-copy-notice">{view.copyNotice}</p>}

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
          {view.fullTextNote && <p style={{ ...textStyle, fontSize: 16, opacity: 0.72 }}>{view.fullTextNote}</p>}

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
              <Link className="rv-btn rv-btn--primary rv-kb-ask" to={SIGN_UP_PATH}>
                {t("home.knowledgeBase.askShurik")}
              </Link>
            )}
            <KbWatchButton slug={doc.slug} appearance="site" />
          </div>

            </>
          )}
        </section>
      </article>
    </BlogShell>
  );
}
