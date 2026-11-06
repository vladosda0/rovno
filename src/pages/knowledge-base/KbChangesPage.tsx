// Public «Что изменилось» — rovno.ai/baza/izmeneniya/ (docs-library slice 8,
// step 8.4, frame 5). The same lines as the in-app page, in the blog chrome, the
// documents and cards linking to their public pages. Prerendered by
// scripts/prerender-kb.mjs (kbChangesPageHtml) and listed in the sitemap.

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BlogShell } from "@/components/blog/BlogShell";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { KbChangesList } from "@/components/knowledge-base/KbChangesList";
import { useKbChanges } from "@/hooks/use-knowledge-base";
import { useDocumentHead } from "@/lib/blog/seo";
import { kbDocPath } from "@/lib/knowledge-base/kbConfig.mjs";
import { KB_CHANGES_PATH, kbChangeMonths } from "@/lib/knowledge-base/kbChanges.mjs";
import { kbSolutionPath } from "@/lib/knowledge-base/kbSolutions.mjs";
import { kbChangesDescription, kbChangesJsonLd, kbChangesTitle, kbChangesTrail } from "@/lib/knowledge-base/kbSeo.mjs";

const H1 = {
  fontFamily: "var(--font-display)", fontSize: 56, lineHeight: 1, letterSpacing: "-0.03em",
  color: "var(--rv-blue)", margin: "16px 0 0",
} as const;
const LEAD = { fontFamily: "var(--font-body)", fontSize: 18, color: "var(--rv-blue)", opacity: 0.8, marginTop: 12 } as const;
const MUTED = { fontFamily: "var(--font-body)", fontSize: 16, color: "var(--rv-blue)", opacity: 0.64 } as const;

export function KbChangesPublicPage() {
  const { t, i18n } = useTranslation();
  const tr = (key: string, vars?: Record<string, unknown>) => t(key, vars) as string;
  const feed = useKbChanges();
  const months = useMemo(
    () => kbChangeMonths(feed.data ?? [], (key, vars) => t(key, vars) as string, i18n.language),
    [feed.data, t, i18n.language],
  );

  useDocumentHead({
    title: kbChangesTitle(tr),
    description: kbChangesDescription(tr),
    canonicalPath: KB_CHANGES_PATH,
    ogType: "website",
    jsonLd: kbChangesJsonLd(tr),
  });

  return (
    <BlogShell>
      <section className="rv-section rv-kb-hub" style={{ padding: "64px 48px 96px" }}>
        <Breadcrumbs trail={kbChangesTrail(tr)} />
        <h1 style={H1}>{t("home.knowledgeBase.changes.guestTitle")}</h1>
        <p style={LEAD}>{t("home.knowledgeBase.changes.subtitle")}</p>
        <div style={{ marginTop: 24 }}>
          {feed.isLoading ? (
            <p style={MUTED}>{t("home.knowledgeBase.changes.loading")}</p>
          ) : feed.isError ? (
            <p style={MUTED}>{t("home.knowledgeBase.loadError")}</p>
          ) : months.length === 0 ? (
            <p style={MUTED}>{t("home.knowledgeBase.changes.empty")}</p>
          ) : (
            <KbChangesList months={months} docTo={kbDocPath} solutionTo={kbSolutionPath} headingLevel={2} />
          )}
        </div>
      </section>
    </BlogShell>
  );
}
