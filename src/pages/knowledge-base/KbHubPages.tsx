// Public hubs of the knowledge base: rovno.ai/baza/ (every folder) and
// /baza/razdel/<folder>/[<page>/] (the folder's documents as links). Built like
// the blog's tag hub (BlogTagPage): blog chrome, breadcrumbs that match the
// BreadcrumbList markup, CollectionPage JSON-LD. Prerendered by
// scripts/prerender-kb.mjs, so a crawler reaches every document page through
// links, not only through the sitemap.

import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BlogShell } from "@/components/blog/BlogShell";
import { Breadcrumbs } from "@/components/blog/Breadcrumbs";
import { KbLabelBadge } from "@/components/knowledge-base/KbTextLabel";
import { useDocumentHead } from "@/lib/blog/seo";
import { useKbDocumentPage, useKbFolderCounts, useKbSolutions, useKbSpFullText } from "@/hooks/use-knowledge-base";
import { KB_FOLDERS, type KbFolder } from "@/lib/knowledge-base/kbConfig.mjs";
import {
  KB_FOLDER_PAGE_SIZE,
  KB_INDEX_PATH,
  kbBreadcrumbTrail,
  kbCollectionJsonLd,
  kbFolderDescription,
  kbFolderItem,
  kbFolderPageCount,
  kbFolderPath,
  kbFolderTitle,
  kbIndexDescription,
  kbIndexItems,
  kbIndexTitle,
  kbSolutionsIndexItem,
  solutionsCountText,
} from "@/lib/knowledge-base/kbSeo.mjs";

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

export function KbIndexPage() {
  const t = useTr();
  const counts = useKbFolderCounts();
  // «Решения» leads the list while a card is published (slice 4, frame 1).
  const solutions = useKbSolutions();
  const solutionsItem = kbSolutionsIndexItem(solutions.data?.length ?? 0, t);
  const items = kbIndexItems(counts.data, t);
  const total = items.reduce((n, i) => n + i.count, 0);
  const title = kbIndexTitle();
  const description = kbIndexDescription(total);

  useDocumentHead({
    title,
    description,
    canonicalPath: KB_INDEX_PATH,
    ogType: "website",
    jsonLd: counts.data
      ? kbCollectionJsonLd(t, { items: solutionsItem ? [solutionsItem, ...items] : items, name: title, description })
      : null,
  });

  return (
    <BlogShell>
      <section className="rv-section rv-kb-hub" style={{ padding: "64px 48px 96px" }}>
        <Breadcrumbs trail={kbBreadcrumbTrail(t)} />
        <h1 style={H1}>{t("home.knowledgeBase.title")}</h1>
        <p style={LEAD}>
          {t(solutionsItem ? "home.knowledgeBase.subtitleWithSolutions" : "home.knowledgeBase.subtitle")} {total > 0 && t("home.knowledgeBase.public.total", { count: total })}
        </p>
        {counts.isLoading ? (
          <p style={MUTED}>{t("home.knowledgeBase.public.loading")}</p>
        ) : counts.isError ? (
          <p style={MUTED}>{t("home.knowledgeBase.loadError")}</p>
        ) : (
          <ul className="rv-kb-folders">
            {solutionsItem && (
              <li className="rv-kb-folder">
                <Link to={solutionsItem.path}>
                  <strong>{solutionsItem.name}</strong>
                </Link>
                <span>
                  {solutionsItem.description} · {solutionsCountText(t, solutionsItem.count)}
                </span>
              </li>
            )}
            {items.map((item) => (
              <li key={item.folder} className="rv-kb-folder">
                <Link to={item.path}>
                  <strong>{item.name}</strong>
                </Link>
                <span>
                  {item.description} · {t("home.knowledgeBase.documentsCount", { count: item.count })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </BlogShell>
  );
}

export function KbFolderPage() {
  const t = useTr();
  const params = useParams<{ folder: string; page?: string }>();
  const folder = (KB_FOLDERS as string[]).includes(params.folder ?? "") ? (params.folder as KbFolder) : null;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const sp = useKbSpFullText();
  const docs = useKbDocumentPage(
    { folder, search: "", page: page - 1, pageSize: KB_FOLDER_PAGE_SIZE },
    folder !== null,
  );
  const total = docs.data?.total ?? 0;
  const pages = kbFolderPageCount(total);
  const items = (docs.data?.rows ?? []).map((d) => kbFolderItem(d, t, { spFullText: sp.data }));
  const title = folder ? kbFolderTitle(folder, t, page) : t("home.knowledgeBase.public.notFoundTitle");
  const description = folder ? kbFolderDescription(folder, t, total) : "";

  useDocumentHead(
    folder
      ? {
          title,
          description,
          canonicalPath: kbFolderPath(folder, page),
          ogType: "website",
          jsonLd: docs.data ? kbCollectionJsonLd(t, { folder, page, items, name: title, description }) : null,
        }
      : { title, robots: "noindex, follow" },
  );

  if (!folder) {
    return (
      <BlogShell>
        <section className="rv-section" style={{ padding: "128px 48px", textAlign: "center", minHeight: "40vh" }}>
          <h1 style={{ ...H1, fontSize: 48 }}>{t("home.knowledgeBase.public.notFoundTitle")}</h1>
          <p style={MUTED}>
            <Link to={KB_INDEX_PATH}>{t("home.knowledgeBase.title")}</Link>
          </p>
        </section>
      </BlogShell>
    );
  }

  return (
    <BlogShell>
      <section className="rv-section rv-kb-hub" style={{ padding: "64px 48px 96px" }}>
        <Breadcrumbs trail={kbBreadcrumbTrail(t, { folder })} />
        <h1 style={H1}>{t(`home.knowledgeBase.folders.${folder}.title`)}</h1>
        <p style={LEAD}>
          {t(`home.knowledgeBase.folders.${folder}.description`)}
          {total > 0 && ` · ${t("home.knowledgeBase.documentsCount", { count: total })}`}
          {pages > 1 && ` · ${t("home.knowledgeBase.public.page", { page, pages })}`}
        </p>
        {docs.isLoading ? (
          <p style={MUTED}>{t("home.knowledgeBase.public.loading")}</p>
        ) : docs.isError ? (
          <p style={MUTED}>{t("home.knowledgeBase.loadError")}</p>
        ) : (
          <ul className="rv-kb-doc-list">
            {items.map((item) => (
              <li key={item.path} className="rv-kb-doc-item">
                <Link to={item.path}>{item.name}</Link>
                {(item.label || item.note) && (
                  <span>
                    {item.label && <KbLabelBadge kind={item.label.kind} text={item.label.text} />} {item.note}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {pages > 1 && (
          <nav className="rv-kb-pager" aria-label={t("home.knowledgeBase.public.pages")}>
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) =>
              p === page ? (
                <span key={p} aria-current="page">
                  {p}
                </span>
              ) : (
                <Link key={p} to={kbFolderPath(folder, p)}>
                  {p}
                </Link>
              ),
            )}
          </nav>
        )}
      </section>
    </BlogShell>
  );
}
