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
import { useActiveOrg, useUserOrganizations } from "@/hooks/use-orgs";
import { UploadDocumentDialog } from "@/components/home/UploadDocumentDialog";

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

function isMyOrOrgAll(slug: string): boolean {
  return slug === "my-all" || slug === "org-all";
}

function ctaForLeaf(slug: string): { labelKey: string; tooltipKey?: string; mode: "upload" | "disabled" } {
  if (isMyOrOrgAll(slug) || slug === "my-notes" || slug === "my-media" || slug === "org-media") {
    return { labelKey: "home.documentsHub.cta.addDocument", mode: "upload" };
  }
  if (slug === "org-estimates" || slug === "estimates") {
    return {
      labelKey: "home.documentsHub.cta.createTemplate",
      tooltipKey: "home.documentsHub.cta.createTemplateDisabled",
      mode: "disabled",
    };
  }
  if (slug === "catalogs" || slug === "org-catalogs") {
    return {
      labelKey: "home.documentsHub.cta.addCatalog",
      tooltipKey: "home.documentsHub.cta.addCatalogDisabled",
      mode: "disabled",
    };
  }
  if (slug === "org-contractor-card") {
    return {
      labelKey: "home.documentsHub.cta.createVisitka",
      tooltipKey: "home.documentsHub.cta.createVisitkaDisabled",
      mode: "disabled",
    };
  }
  return { labelKey: "home.documentsHub.cta.addDocument", mode: "upload" };
}

export function DocumentsHubTab() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeOrg = useActiveOrg();
  const { data: orgs } = useUserOrganizations();
  const userCanManageAnyOrg = (orgs ?? []).some((o) => o.role === "owner" || o.role === "admin");

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
  const cta = ctaForLeaf(activeLeaf);

  // Hide org-only create-template CTA from users who cannot manage any org.
  const showCta = (() => {
    if (cta.mode === "upload") return true;
    if (cta.labelKey === "home.documentsHub.cta.createTemplate") {
      return userCanManageAnyOrg;
    }
    return true;
  })();

  const handleCtaClick = () => {
    if (cta.mode === "upload") setUploadOpen(true);
  };

  const ctaButtonDesktop = showCta ? (
    <Button
      className="w-full justify-start gap-2"
      size="default"
      onClick={handleCtaClick}
      disabled={cta.mode === "disabled"}
      title={cta.tooltipKey ? t(cta.tooltipKey) : undefined}
    >
      <Plus className="h-4 w-4" />
      {t(cta.labelKey)}
    </Button>
  ) : null;

  // Mobile FAB: round button fixed at the bottom-right of the viewport. Hidden
  // on desktop where the inline left-nav CTA covers the same action.
  const ctaFabMobile = showCta && cta.mode !== "disabled" ? (
    <Button
      className="md:hidden fixed bottom-4 right-4 z-30 h-14 w-14 rounded-full shadow-lg"
      size="icon"
      onClick={handleCtaClick}
      aria-label={t(cta.labelKey)}
    >
      <Plus className="h-6 w-6" />
    </Button>
  ) : null;

  const fallback = (
    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      {t("home.tab.loading")}
    </div>
  );

  const stickyTop = "calc(3rem + var(--env-banner-h, 0px))";

  return (
    <div className="flex flex-col md:flex-row md:gap-0">
      {/* Desktop left nav. Hidden on mobile in favor of MobileSectionNav. */}
      <aside
        className="hidden md:block bg-card/40 md:sticky md:w-64 md:shrink-0 md:self-start md:h-[calc(100svh-3rem-var(--env-banner-h,0px))] md:border-r md:border-border md:overflow-y-auto px-3 pt-3 pb-4 sm:px-4"
        style={{ top: stickyTop }}
      >
        <DocumentsLeftNav
          activeSlug={activeLeaf}
          onSelect={handleSelect}
          cta={ctaButtonDesktop ?? undefined}
        />
      </aside>
      <main className="min-w-0 flex-1 px-4 pt-3 pb-20 sm:px-6 md:pb-6 space-y-3">
        <MobileSectionNav activeLeaf={activeLeaf} onSelect={handleSelect} />
        <Suspense fallback={fallback}>
          <ActiveSection />
        </Suspense>
      </main>

      <UploadDocumentDialog open={uploadOpen} onOpenChange={setUploadOpen} />
      {ctaFabMobile}
    </div>
  );
}
