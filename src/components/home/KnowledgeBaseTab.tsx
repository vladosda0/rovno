// «Документы → База знаний» (epic docs-library, slice 1, step 1.4).
//
// Assembled from the same parts as «Документы организации» (OrgAllDocsView):
// SectionChrome with search and «Сбросить фильтры», FolderTile per registry
// folder, a folder entry with «Назад», FileTile per document and the standard
// document window. Differences, all from the approved mockup v3: no date filter
// (the documents have no upload date), paging is server-side (≈7k rows), and a
// document has no file, so the tile carries a source arrow instead of «Скачать».
//
// Slice 4 (mockup v2 approved 22.10, frames 1-2): «Решения» is the first tile,
// with a green cover, and only while at least one card is published. Inside, the
// same folder view; the cards are few, so search and paging run in the browser.
// The header search at the root finds cards too and shows them first.
//
// Slice 8 (mockup v3 approved 05.11, frames 1-3): «Что изменилось» is the very
// first tile, with the «Новое» mark and this month's number, and opens its own
// page (?kbChanges=1); a document or a card opened from there comes back to it.

import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronLeft, FileText, History, Lightbulb, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionChrome } from "@/components/home/documents-hub/SectionChrome";
import { FileTile, FolderTile, TileGrid } from "@/components/home/documents-hub/tiles";
import { EmptyState } from "@/components/home/documents-hub/EmptyState";
import { NewFeatureBadge } from "@/components/ui/new-feature-badge";
import { KB_CHANGES_FEATURE, KbChangesView } from "@/components/knowledge-base/KbChangesView";
import { KbDocumentDialog } from "@/components/knowledge-base/KbDocumentDialog";
import { KbReadingPage } from "@/components/knowledge-base/KbReadingPage";
import { KbSolutionPage } from "@/components/knowledge-base/KbSolutionPage";
import { KbLabelBadge } from "@/components/knowledge-base/KbTextLabel";
import { kbSourceButtons, openKbSource } from "@/components/knowledge-base/kb-view";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useKbChangesMonthCount,
  useKbDocumentPage,
  useKbFolderCounts,
  useKbSolutions,
  useKbSpFullText,
} from "@/hooks/use-knowledge-base";
import type { KbDocument } from "@/lib/knowledge-base/api";
import { KB_FOLDERS, KB_PAGE_SIZE, displayTitle, formatKbDate, type KbFolder } from "@/lib/knowledge-base/kbConfig.mjs";
import { kbFullTextReadable, kbTextLabel } from "@/lib/knowledge-base/kbFullText.mjs";
import { kbChangesMonthLine } from "@/lib/knowledge-base/kbChanges.mjs";
import { kbMoscowToday } from "@/lib/knowledge-base/kbHistory.mjs";
import { kbSolutionCheckedDate, kbSolutionMatches, type KbSolution } from "@/lib/knowledge-base/kbSolutions.mjs";

/** The reading page's address inside «Документы» (slice 2). */
export const KB_READ_PARAM = "kbDoc";
/** A «Решения» card's address inside «Документы» (slice 4). */
export const KB_SOLUTION_PARAM = "kbSolution";
/** «Что изменилось» inside «Документы» (slice 8). */
export const KB_CHANGES_PARAM = "kbChanges";

const SEARCH_DEBOUNCE_MS = 300;

export function KnowledgeBaseTab() {
  const { t, i18n } = useTranslation();
  const [folder, setFolderState] = useState<KbFolder | null>(null);
  const [solutionsOpen, setSolutionsOpenState] = useState(false);
  const [search, setSearchState] = useState("");
  const [page, setPage] = useState(0);
  const [openDoc, setOpenDoc] = useState<KbDocument | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const readingSlug = searchParams.get(KB_READ_PARAM);
  const solutionSlug = searchParams.get(KB_SOLUTION_PARAM);
  const changesOpen = searchParams.has(KB_CHANGES_PARAM);
  const sp = useKbSpFullText();
  const changesCount = useKbChangesMonthCount();

  function setParam(param: string, slug: string | null) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (slug) next.set(param, slug);
      else next.delete(param);
      return next;
    });
  }
  const setReading = (slug: string | null) => setParam(KB_READ_PARAM, slug);
  const setSolution = (slug: string | null) => setParam(KB_SOLUTION_PARAM, slug);
  // A line of «Что изменилось» keeps the page in the address, so «Назад» returns to it.
  const withParam = (param: string, slug: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(param, slug);
    return { search: `?${next.toString()}` };
  };

  const debouncedSearch = useDebounce(search.trim(), SEARCH_DEBOUNCE_MS);
  const searching = debouncedSearch !== "";
  const listing = !solutionsOpen && (folder !== null || searching);

  // A new folder or a new query starts from the first page (in the handler, not
  // an effect, so no render ever asks for page N of the new scope).
  function setFolder(next: KbFolder | null) {
    setFolderState(next);
    setPage(0);
  }
  function setSolutionsOpen(next: boolean) {
    setSolutionsOpenState(next);
    setPage(0);
  }
  function setSearch(next: string) {
    setSearchState(next);
    setPage(0);
  }

  const counts = useKbFolderCounts();
  // A failed card read only hides the tile: the documents stay usable.
  const solutions = useKbSolutions();
  const allSolutions = useMemo(() => solutions.data ?? [], [solutions.data]);
  const hasSolutions = allSolutions.length > 0;
  const matchedSolutions = useMemo(
    () => allSolutions.filter((s) => kbSolutionMatches(s, solutionsOpen ? search : debouncedSearch)),
    [allSolutions, solutionsOpen, search, debouncedSearch],
  );
  const solutionsPage = matchedSolutions.slice(page * KB_PAGE_SIZE, (page + 1) * KB_PAGE_SIZE);
  // From the root, a search shows the matching cards first, on its first page.
  const rootSolutionHits = searching && folder === null && !solutionsOpen && page === 0 ? matchedSolutions : [];
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
  const total = solutionsOpen ? matchedSolutions.length : listing ? docs.data?.total ?? 0 : 0;
  // From the root a hit names its folder; inside a folder that is implied.
  const showFolderOnTile = folder === null;

  function tileSecondLine(doc: KbDocument): string | null {
    if (!showFolderOnTile) return doc.edition;
    return doc.edition ? `${folderTitle(doc.folder)} · ${doc.edition}` : folderTitle(doc.folder);
  }

  function reset() {
    setSearch("");
  }

  // A document with its full text opens straight on the reading page (slice 7,
  // frame 1a); records without a text keep the document window.
  function openTile(doc: KbDocument) {
    if (kbFullTextReadable(doc, sp.data)) setReading(doc.slug);
    else setOpenDoc(doc);
  }

  function tileMeta(doc: KbDocument) {
    if (!kbFullTextReadable(doc, sp.data)) return null;
    const label = kbTextLabel(doc, (key, vars) => t(key, vars) as string);
    return label ? <KbLabelBadge kind={label.kind} text={label.text} /> : null;
  }

  const loadFailed = solutionsOpen ? solutions.isError : listing ? docs.isError : counts.isError;
  // The root shows the folders as soon as the counts arrive; the «Решения» tile joins when the cards do.
  const loading = solutionsOpen
    ? solutions.isLoading
    : listing
      ? docs.isLoading
      : counts.isLoading || (visibleFolders.length === 0 && solutions.isLoading);

  function solutionTile(solution: KbSolution) {
    const checked = kbSolutionCheckedDate(solution);
    return (
      <FileTile
        key={`solution:${solution.slug}`}
        title={solution.title}
        description={solution.summary}
        icon={Lightbulb}
        iconColor="text-success"
        tone="success"
        meta={
          solution.recheckSince ? (
            <KbLabelBadge kind="checking" text={t("home.knowledgeBase.label.checking")} />
          ) : checked ? (
            <KbLabelBadge kind="verified" text={t("home.knowledgeBase.checkedOn", { date: checked })} />
          ) : null
        }
        onClick={() => setSolution(solution.slug)}
        viewLabel=""
        downloadLabel=""
      />
    );
  }

  if (readingSlug) {
    return <KbReadingPage slug={readingSlug} onBack={() => setReading(null)} />;
  }

  if (solutionSlug) {
    return (
      <KbSolutionPage
        slug={solutionSlug}
        onBack={() => {
          if (!changesOpen) setSolutionsOpen(true);
          setSolution(null);
        }}
      />
    );
  }

  if (changesOpen) {
    return (
      <KbChangesView
        onBack={() => setParam(KB_CHANGES_PARAM, null)}
        docTo={(slug) => withParam(KB_READ_PARAM, slug)}
        solutionTo={(slug) => withParam(KB_SOLUTION_PARAM, slug)}
      />
    );
  }

  const changesLine = kbChangesMonthLine(
    changesCount.data ?? 0,
    (key, vars) => t(key, vars) as string,
    i18n.language,
    kbMoscowToday(),
  );

  const title = solutionsOpen
    ? t("home.knowledgeBase.solutions.title")
    : folder
      ? folderTitle(folder)
      : t("home.knowledgeBase.title");
  const subtitle =
    folder || solutionsOpen
      ? undefined
      : t(hasSolutions ? "home.knowledgeBase.subtitleWithSolutions" : "home.knowledgeBase.subtitle");

  return (
    <>
      <SectionChrome
        title={title}
        subtitle={subtitle}
        search={search}
        onSearchChange={setSearch}
        pageSize={KB_PAGE_SIZE}
        page={page}
        onPageChange={setPage}
        totalAfterFilter={total}
        isFilterActive={search !== ""}
        onReset={reset}
        headerExtra={
          folder || solutionsOpen ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFolder(null);
                setSolutionsOpen(false);
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              {t("home.documentsHub.folders.backToAll")}
            </Button>
          ) : null
        }
      >
        {loadFailed ? (
          <EmptyState icon={BookOpen} title={t("home.knowledgeBase.title")} body={t("home.knowledgeBase.loadError")} />
        ) : loading ? (
          <p className="text-body-sm text-muted-foreground">
            {t(solutionsOpen ? "home.knowledgeBase.solutions.loadingList" : "home.tab.loading")}
          </p>
        ) : solutionsOpen ? (
          solutionsPage.length === 0 ? (
            <EmptyState icon={SearchX} title={t("home.knowledgeBase.solutions.searchEmpty")} />
          ) : (
            <TileGrid>{solutionsPage.map(solutionTile)}</TileGrid>
          )
        ) : !listing && visibleFolders.length === 0 && !hasSolutions ? (
          <EmptyState icon={BookOpen} title={t("home.knowledgeBase.emptyBase")} />
        ) : !listing ? (
          <TileGrid>
            {/* The subtitle sits in the count slot and the month line below it, as in frame 1. */}
            <FolderTile
              title={t("home.knowledgeBase.changes.title")}
              icon={History}
              count={changesCount.data ?? 0}
              filesLabel={t("home.knowledgeBase.changes.tileDescription")}
              description={changesLine}
              badge={<NewFeatureBadge featureId={KB_CHANGES_FEATURE} />}
              onClick={() => setParam(KB_CHANGES_PARAM, "1")}
            />
            {hasSolutions && (
              <FolderTile
                title={t("home.knowledgeBase.solutions.title")}
                icon={Lightbulb}
                tone="success"
                count={allSolutions.length}
                filesLabel={t("home.knowledgeBase.solutions.count", { count: allSolutions.length })}
                description={t("home.knowledgeBase.solutions.description")}
                onClick={() => setSolutionsOpen(true)}
              />
            )}
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
        ) : rows.length === 0 && rootSolutionHits.length === 0 ? (
          <EmptyState icon={SearchX} title={t("home.knowledgeBase.searchEmpty")} />
        ) : (
          <TileGrid>
            {rootSolutionHits.map(solutionTile)}
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
                  onClick={() => openTile(doc)}
                  onView={() => openTile(doc)}
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
