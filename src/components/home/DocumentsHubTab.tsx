import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  DocumentsLeftNav,
  VALID_LEAVES,
  DEFAULT_LEAF,
  type LeafSlug,
} from "@/components/home/documents-hub/DocumentsLeftNav";
import { MobileSectionNav } from "@/components/home/documents-hub/MobileSectionNav";
import { MultiStepUploadModal } from "@/components/upload/MultiStepUploadModal";
import type { UploadType } from "@/components/upload/types";
import { leafForUploadResult } from "@/components/upload/upload-destination";

const MyAllDocsLeaf = lazy(() =>
  import("@/components/home/documents-hub/leaves/MyAllDocsLeaf").then((m) => ({ default: m.MyAllDocsLeaf })),
);
const MyNotesView = lazy(() =>
  import("@/components/home/documents-hub/leaves/MyNotesView").then((m) => ({ default: m.MyNotesView })),
);
const MyMediaView = lazy(() =>
  import("@/components/home/documents-hub/leaves/MyMediaView").then((m) => ({ default: m.MyMediaView })),
);
const OrgAllDocsView = lazy(() =>
  import("@/components/home/documents-hub/leaves/OrgAllDocsView").then((m) => ({ default: m.OrgAllDocsView })),
);
const OrgProjectsView = lazy(() =>
  import("@/components/home/documents-hub/leaves/OrgProjectsView").then((m) => ({ default: m.OrgProjectsView })),
);
const OrgMediaView = lazy(() =>
  import("@/components/home/documents-hub/leaves/OrgMediaView").then((m) => ({ default: m.OrgMediaView })),
);
const OrgEstimatesView = lazy(() =>
  import("@/components/home/documents-hub/leaves/OrgEstimatesView").then((m) => ({ default: m.OrgEstimatesView })),
);
const OrgCatalogsView = lazy(() =>
  import("@/components/home/documents-hub/leaves/OrgCatalogsView").then((m) => ({ default: m.OrgCatalogsView })),
);
const OrgContractorCardView = lazy(() =>
  import("@/components/home/documents-hub/leaves/OrgContractorCardView").then((m) => ({ default: m.OrgContractorCardView })),
);
const CatalogsTab = lazy(() =>
  import("@/components/home/CatalogsTab").then((m) => ({ default: m.CatalogsTab })),
);
const EstimateTemplatesTab = lazy(() =>
  import("@/components/home/EstimateTemplatesTab").then((m) => ({ default: m.EstimateTemplatesTab })),
);
const KnowledgeBaseTab = lazy(() =>
  import("@/components/home/KnowledgeBaseTab").then((m) => ({ default: m.KnowledgeBaseTab })),
);
const DocumentTemplatesTab = lazy(() =>
  import("@/components/home/DocumentTemplatesTab").then((m) => ({ default: m.DocumentTemplatesTab })),
);

const LEAF_RENDERERS: Record<LeafSlug, React.ComponentType> = {
  "my-all": MyAllDocsLeaf,
  "my-notes": MyNotesView,
  "my-media": MyMediaView,
  "org-all": OrgAllDocsView,
  "org-projects": OrgProjectsView,
  "org-media": OrgMediaView,
  "org-estimates": OrgEstimatesView,
  "org-catalogs": OrgCatalogsView,
  "org-contractor-card": OrgContractorCardView,
  catalogs: CatalogsTab,
  estimates: EstimateTemplatesTab,
  "knowledge-base": KnowledgeBaseTab,
  "document-templates": DocumentTemplatesTab,
};

const SUB_TAB_PARAM = "docTab";

/** Upload type to pre-select when opening the modal from a given leaf's CTA. */
function presetForLeaf(slug: string): UploadType {
  if (slug === "org-estimates" || slug === "estimates") return "estimate_template";
  if (slug === "catalogs" || slug === "org-catalogs") return "catalog";
  if (slug === "org-contractor-card") return "visitka";
  return "document";
}

function ctaLabelForLeaf(slug: string): string {
  if (slug === "org-estimates" || slug === "estimates") return "home.documentsHub.cta.createTemplate";
  if (slug === "catalogs" || slug === "org-catalogs") return "home.documentsHub.cta.addCatalog";
  if (slug === "org-contractor-card") return "home.documentsHub.cta.createVisitka";
  return "home.documentsHub.cta.addDocument";
}

export function DocumentsHubTab() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeLeaf, setActiveLeaf] = useState<LeafSlug>(() => {
    const param = searchParams.get(SUB_TAB_PARAM);
    return param && VALID_LEAVES.has(param) ? (param as LeafSlug) : DEFAULT_LEAF;
  });
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    const param = searchParams.get(SUB_TAB_PARAM);
    const valid = param && VALID_LEAVES.has(param);
    const next = valid ? (param as LeafSlug) : DEFAULT_LEAF;
    if (next !== activeLeaf) setActiveLeaf(next);
    if (param && !valid) {
      setSearchParams(
        (current) => {
          const stripped = new URLSearchParams(current);
          stripped.delete(SUB_TAB_PARAM);
          return stripped;
        },
        { replace: true },
      );
    }
  }, [searchParams, activeLeaf, setSearchParams]);

  const handleSelect = useCallback(
    (slug: LeafSlug) => {
      setActiveLeaf(slug);
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (slug === DEFAULT_LEAF) next.delete(SUB_TAB_PARAM);
        else next.set(SUB_TAB_PARAM, slug);
        return next;
      });
    },
    [setSearchParams],
  );

  const ActiveSection = LEAF_RENDERERS[activeLeaf] ?? MyAllDocsLeaf;
  const ctaLabel = t(ctaLabelForLeaf(activeLeaf));
  const presetType = presetForLeaf(activeLeaf);

  const handleCtaClick = () => setUploadOpen(true);

  const ctaButtonDesktop = (
    <Button className="w-full justify-start gap-2" size="default" onClick={handleCtaClick}>
      <Plus className="h-4 w-4" />
      {ctaLabel}
    </Button>
  );

  // Mobile FAB: round button fixed at the bottom-right of the viewport. Hidden
  // on desktop where the inline left-nav CTA covers the same action.
  const ctaFabMobile = (
    <Button
      className="md:hidden fixed bottom-4 right-4 z-30 h-14 w-14 rounded-full shadow-lg"
      size="icon"
      onClick={handleCtaClick}
      aria-label={ctaLabel}
    >
      <Plus className="h-6 w-6" />
    </Button>
  );

  const fallback = (
    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      {t("home.tab.loading")}
    </div>
  );

  return (
    <div className="flex flex-col md:flex-row md:gap-0">
      {/* Desktop left nav. Hidden on mobile in favor of MobileSectionNav. */}
      <aside
        className="hidden md:block bg-card/40 md:sticky md:w-64 md:shrink-0 md:self-start md:h-[calc(100svh-3rem-var(--demo-banner-h,0px))] md:border-r md:border-border md:overflow-y-auto px-3 pt-3 pb-4 sm:px-4"
        style={{ top: "calc(3rem + var(--demo-banner-h, 0px))" }}
      >
        <DocumentsLeftNav
          activeSlug={activeLeaf}
          onSelect={handleSelect}
          cta={ctaButtonDesktop}
        />
      </aside>
      <main className="min-w-0 flex-1 px-4 pt-3 pb-20 sm:px-6 md:pb-6 space-y-3">
        <MobileSectionNav activeLeaf={activeLeaf} onSelect={handleSelect} />
        <Suspense fallback={fallback}>
          <ActiveSection />
        </Suspense>
      </main>

      <MultiStepUploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        presetType={presetType}
        onComplete={(result) => {
          // After upload, jump to the leaf where the file landed.
          const leaf = leafForUploadResult(result);
          if (leaf && VALID_LEAVES.has(leaf)) handleSelect(leaf as LeafSlug);
        }}
      />
      {ctaFabMobile}
    </div>
  );
}
