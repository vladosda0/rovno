import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Package, FileStack, BookOpen, FileType2 } from "lucide-react";

const MyDocumentsTab = lazy(() =>
  import("@/components/home/MyDocumentsTab").then((module) => ({ default: module.MyDocumentsTab })),
);
const CatalogsTab = lazy(() =>
  import("@/components/home/CatalogsTab").then((module) => ({ default: module.CatalogsTab })),
);
const EstimateTemplatesTab = lazy(() =>
  import("@/components/home/EstimateTemplatesTab").then((module) => ({ default: module.EstimateTemplatesTab })),
);
const KnowledgeBaseTab = lazy(() =>
  import("@/components/home/KnowledgeBaseTab").then((module) => ({ default: module.KnowledgeBaseTab })),
);
const DocumentTemplatesTab = lazy(() =>
  import("@/components/home/DocumentTemplatesTab").then((module) => ({ default: module.DocumentTemplatesTab })),
);

const SUB_TABS = [
  { value: "my-documents", labelKey: "home.tabs.myDocuments", icon: FileText },
  { value: "catalogs", labelKey: "home.tabs.catalogs", icon: Package },
  { value: "estimate-templates", labelKey: "home.tabs.estimateTemplates", icon: FileStack },
  { value: "knowledge-base", labelKey: "home.tabs.knowledgeBase", icon: BookOpen },
  { value: "document-templates", labelKey: "home.tabs.documentTemplates", icon: FileType2 },
] as const;

type SubTabValue = (typeof SUB_TABS)[number]["value"];
const VALID_SUB_TABS = new Set<string>(SUB_TABS.map((t) => t.value));
const DEFAULT_SUB_TAB: SubTabValue = "my-documents";
const SUB_TAB_PARAM = "docTab";

export function DocumentsHubTab() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeSubTab, setActiveSubTab] = useState<SubTabValue>(() => {
    const param = searchParams.get(SUB_TAB_PARAM);
    return param && VALID_SUB_TABS.has(param) ? (param as SubTabValue) : DEFAULT_SUB_TAB;
  });

  useEffect(() => {
    const param = searchParams.get(SUB_TAB_PARAM);
    const valid = param && VALID_SUB_TABS.has(param);
    const next = valid ? (param as SubTabValue) : DEFAULT_SUB_TAB;
    if (next !== activeSubTab) setActiveSubTab(next);
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
  }, [searchParams, activeSubTab, setSearchParams]);

  const handleSubTabChange = useCallback(
    (value: string) => {
      setActiveSubTab(value as SubTabValue);
      // Push (not replace) so browser Back/Forward navigates between sub-tabs.
      // Canonicalization of invalid values in the effect above keeps `replace`
      // because it is a URL repair, not user-initiated navigation.
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        if (value === DEFAULT_SUB_TAB) {
          next.delete(SUB_TAB_PARAM);
        } else {
          next.set(SUB_TAB_PARAM, value);
        }
        return next;
      });
    },
    [setSearchParams],
  );

  const fallback = (
    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      {t("home.tab.loading")}
    </div>
  );

  return (
    <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="space-y-4">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-0.5 bg-transparent p-0">
        {SUB_TABS.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="flex items-center gap-1.5 px-3 py-2 text-caption data-[state=active]:bg-accent/10 data-[state=active]:text-accent data-[state=active]:shadow-none rounded-lg"
          >
            <tab.icon className="h-3.5 w-3.5" />
            {t(tab.labelKey)}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="my-documents" className="mt-0">
        {activeSubTab === "my-documents" && (
          <Suspense fallback={fallback}>
            <MyDocumentsTab />
          </Suspense>
        )}
      </TabsContent>
      <TabsContent value="catalogs" className="mt-0">
        {activeSubTab === "catalogs" && (
          <Suspense fallback={fallback}>
            <CatalogsTab />
          </Suspense>
        )}
      </TabsContent>
      <TabsContent value="estimate-templates" className="mt-0">
        {activeSubTab === "estimate-templates" && (
          <Suspense fallback={fallback}>
            <EstimateTemplatesTab />
          </Suspense>
        )}
      </TabsContent>
      <TabsContent value="knowledge-base" className="mt-0">
        {activeSubTab === "knowledge-base" && (
          <Suspense fallback={fallback}>
            <KnowledgeBaseTab />
          </Suspense>
        )}
      </TabsContent>
      <TabsContent value="document-templates" className="mt-0">
        {activeSubTab === "document-templates" && (
          <Suspense fallback={fallback}>
            <DocumentTemplatesTab />
          </Suspense>
        )}
      </TabsContent>
    </Tabs>
  );
}
