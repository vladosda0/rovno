// «Документы → База знаний» (epic docs-library, slice 1, step 1.4).
//
// Assembled from the same parts as «Документы организации» (OrgAllDocsView):
// SectionChrome with search and «Сбросить фильтры», FolderTile per registry
// folder, a folder entry with «Назад», FileTile per document and the standard
// document window. Differences, all from the approved mockup v3: no date filter
// (the documents have no upload date), paging is server-side (≈7k rows), and a
// document has no file, so the tile carries a source arrow instead of «Скачать».

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronLeft, FileText, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionChrome } from "@/components/home/documents-hub/SectionChrome";
import { FileTile, FolderTile, TileGrid } from "@/components/home/documents-hub/tiles";
import { EmptyState } from "@/components/home/documents-hub/EmptyState";
import { KbDocumentDialog } from "@/components/knowledge-base/KbDocumentDialog";
import { KbReadingPage } from "@/components/knowledge-base/KbReadingPage";
import { KbLabelBadge } from "@/components/knowledge-base/KbTextLabel";
import { kbSourceButtons, openKbSource } from "@/components/knowledge-base/kb-view";
import { useDebounce } from "@/hooks/use-debounce";
import { useKbDocumentPage, useKbFolderCounts, useKbSpFullText } from "@/hooks/use-knowledge-base";
import type { KbDocument } from "@/lib/knowledge-base/api";
import { KB_FOLDERS, KB_PAGE_SIZE, displayTitle, formatKbDate, type KbFolder } from "@/lib/knowledge-base/kbConfig.mjs";
import { kbFullTextReadable, kbTextLabel } from "@/lib/knowledge-base/kbFullText.mjs";

/** The reading page's address inside «Документы» (slice 2). */
export const KB_READ_PARAM = "kbDoc";

const SEARCH_DEBOUNCE_MS = 300;

export function KnowledgeBaseTab() {
  const { t } = useTranslation();
  const [folder, setFolderState] = useState<KbFolder | null>(null);
  const [search, setSearchState] = useState("");
  const [page, setPage] = useState(0);
  const [openDoc, setOpenDoc] = useState<KbDocument | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const readingSlug = searchParams.get(KB_READ_PARAM);
  const sp = useKbSpFullText();

  function setReading(slug: string | null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (slug) next.set(KB_READ_PARAM, slug);
      else next.delete(KB_READ_PARAM);
      return next;
    });
  }

  const debouncedSearch = useDebounce(search.trim(), SEARCH_DEBOUNCE_MS);
  const searching = debouncedSearch !== "";
  const listing = folder !== null || searching;

  // A new folder or a new query starts from the first page (in the handler, not
  // an effect, so no render ever asks for page N of the new scope).
  function setFolder(next: KbFolder | null) {
    setFolderState(next);
    setPage(0);
  }
  function setSearch(next: string) {
    setSearchState(next);
    setPage(0);
  }

  const counts = useKbFolderCounts();
  const docs = useKbDocumentPage(
    { folder, search: debouncedSearch, page, pageSize: KB_PAGE_SIZE },
    listing,
  );

  const visibleFolders = useMemo(
    () => KB_FOLDERS.filter((f) => (counts.data?.[f] ?? 0) > 0),
    [counts.data],
  );

  const folderTitle = (f: KbFolder) => t(`home.knowledgeBase.folders.${f}.title`);
  const rows = listing ? docs.data?.rows ?? [] : [];
  const total = listing ? docs.data?.total ?? 0 : 0;
  // From the root a hit names its folder; inside a folder that is implied.
  const showFolderOnTile = folder === null;

  function tileSecondLine(doc: KbDocument): string | null {
    if (!showFolderOnTile) return doc.edition;
    return doc.edition ? `${folderTitle(doc.folder)} · ${doc.edition}` : folderTitle(doc.folder);
  }

  function reset() {
    setSearch("");
  }

  function tileMeta(doc: KbDocument) {
    if (!kbFullTextReadable(doc, sp.data)) return null;
    const label = kbTextLabel(doc, (key, vars) => t(key, vars) as string);
    return label ? <KbLabelBadge kind={label.kind} text={label.text} /> : null;
  }

  const loadFailed = listing ? docs.isError : counts.isError;
  const loading = listing ? docs.isLoading : counts.isLoading;

  if (readingSlug) {
    return <KbReadingPage slug={readingSlug} onBack={() => setReading(null)} />;
  }

  return (
    <>
      <SectionChrome
        title={folder ? folderTitle(folder) : t("home.knowledgeBase.title")}
        subtitle={folder ? undefined : t("home.knowledgeBase.subtitle")}
        search={search}
        onSearchChange={setSearch}
        pageSize={KB_PAGE_SIZE}
        page={page}
        onPageChange={setPage}
        totalAfterFilter={total}
        isFilterActive={search !== ""}
        onReset={reset}
        headerExtra={
          folder ? (
            <Button variant="ghost" size="sm" onClick={() => setFolder(null)}>
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              {t("home.documentsHub.folders.backToAll")}
            </Button>
          ) : null
        }
      >
        {loadFailed ? (
          <EmptyState icon={BookOpen} title={t("home.knowledgeBase.title")} body={t("home.knowledgeBase.loadError")} />
        ) : loading ? (
          <p className="text-body-sm text-muted-foreground">{t("home.tab.loading")}</p>
        ) : !listing && visibleFolders.length === 0 ? (
          <EmptyState icon={BookOpen} title={t("home.knowledgeBase.emptyBase")} />
        ) : !listing ? (
          <TileGrid>
            {visibleFolders.map((f) => (
              <FolderTile
                key={f}
                title={folderTitle(f)}
                icon={BookOpen}
                count={counts.data?.[f] ?? 0}
                filesLabel={t("home.knowledgeBase.documentsCount", { count: counts.data?.[f] ?? 0 })}
                description={t(`home.knowledgeBase.folders.${f}.description`)}
                onClick={() => setFolder(f)}
              />
            ))}
          </TileGrid>
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title={t("home.knowledgeBase.searchEmpty")} />
        ) : (
          <TileGrid>
            {rows.map((doc) => {
              const firstSource = kbSourceButtons(doc, t)[0];
              const checked = formatKbDate(doc.lastCheckedAt);
              return (
                <FileTile
                  key={doc.docId}
                  title={displayTitle(doc)}
                  description={tileSecondLine(doc)}
                  icon={FileText}
                  dateAdded={checked ? t("home.knowledgeBase.checkedOn", { date: checked }) : null}
                  meta={tileMeta(doc)}
                  onClick={() => setOpenDoc(doc)}
                  onView={() => setOpenDoc(doc)}
                  viewLabel={t("home.knowledgeBase.viewDocument")}
                  onOpenExternal={firstSource ? () => openKbSource(firstSource.href) : undefined}
                  openExternalLabel={firstSource?.label}
                  downloadLabel=""
                />
              );
            })}
          </TileGrid>
        )}
      </SectionChrome>

      <KbDocumentDialog
        open={openDoc !== null}
        onOpenChange={(open) => {
          if (!open) setOpenDoc(null);
        }}
        doc={openDoc}
        onRead={(doc) => {
          setOpenDoc(null);
          setReading(doc.slug);
        }}
      />
    </>
  );
}
