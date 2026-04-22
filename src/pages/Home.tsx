import { useState, useEffect, Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  LayoutDashboard, FolderOpen, CheckSquare, FileText,
  Package, Warehouse, TrendingUp, Users,
} from "lucide-react";

const OverviewTab = lazy(() =>
  import("@/components/home/OverviewTab").then((module) => ({ default: module.OverviewTab })),
);
const ProjectsTab = lazy(() =>
  import("@/components/home/ProjectsTab").then((module) => ({ default: module.ProjectsTab })),
);
const TasksTab = lazy(() =>
  import("@/components/home/TasksTab").then((module) => ({ default: module.TasksTab })),
);
const DocumentsTab = lazy(() =>
  import("@/components/home/DocumentsTab").then((module) => ({ default: module.DocumentsTab })),
);
const ProcurementTab = lazy(() =>
  import("@/components/home/ProcurementTab").then((module) => ({ default: module.ProcurementTab })),
);
const InventoryTab = lazy(() =>
  import("@/components/home/InventoryTab").then((module) => ({ default: module.InventoryTab })),
);
const FinanceTab = lazy(() =>
  import("@/components/home/FinanceTab").then((module) => ({ default: module.FinanceTab })),
);
const ResourcesTab = lazy(() =>
  import("@/components/home/ResourcesTab").then((module) => ({ default: module.ResourcesTab })),
);

const TABS = [
  { value: "overview", labelKey: "home.tabs.overview", icon: LayoutDashboard },
  { value: "projects", labelKey: "home.tabs.projects", icon: FolderOpen },
  { value: "tasks", labelKey: "home.tabs.tasks", icon: CheckSquare },
  { value: "documents", labelKey: "home.tabs.documents", icon: FileText },
  { value: "procurement", labelKey: "home.tabs.procurement", icon: Package },
  { value: "inventory", labelKey: "home.tabs.inventory", icon: Warehouse },
  { value: "finance", labelKey: "home.tabs.finance", icon: TrendingUp },
  { value: "resources", labelKey: "home.tabs.resources", icon: Users },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const VALID_TABS = new Set<string>(TABS.map((t) => t.value));

export default function Home() {
  const { t } = useTranslation();
  const tabFallback = (
    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      {t("home.tab.loading")}
    </div>
  );
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    const param = searchParams.get("tab");
    return param && VALID_TABS.has(param) ? (param as TabValue) : "overview";
  });

  useEffect(() => {
    const param = searchParams.get("tab");
    if (param && VALID_TABS.has(param) && param !== activeTab) {
      setActiveTab(param as TabValue);
    }
  }, [searchParams, activeTab]);

  function handleTabChange(value: string) {
    setActiveTab(value as TabValue);
    if (value === "overview") {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: value }, { replace: true });
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-h2 text-foreground">{t("home.title")}</h1>
        <p className="text-body-sm text-muted-foreground mt-1">
          {t("home.subtitle")}
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-0.5 bg-transparent p-0 sm:mb-6">
          {TABS.map((tab) => (
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

        <TabsContent value="overview" className="mt-0">
          {activeTab === "overview" && (
            <Suspense fallback={tabFallback}>
              <OverviewTab />
            </Suspense>
          )}
        </TabsContent>
        <TabsContent value="projects" className="mt-0">
          {activeTab === "projects" && (
            <Suspense fallback={tabFallback}>
              <ProjectsTab />
            </Suspense>
          )}
        </TabsContent>
        <TabsContent value="tasks" className="mt-0">
          {activeTab === "tasks" && (
            <Suspense fallback={tabFallback}>
              <TasksTab />
            </Suspense>
          )}
        </TabsContent>
        <TabsContent value="documents" className="mt-0">
          {activeTab === "documents" && (
            <Suspense fallback={tabFallback}>
              <DocumentsTab />
            </Suspense>
          )}
        </TabsContent>
        <TabsContent value="procurement" className="mt-0">
          {activeTab === "procurement" && (
            <Suspense fallback={tabFallback}>
              <ProcurementTab />
            </Suspense>
          )}
        </TabsContent>
        <TabsContent value="inventory" className="mt-0">
          {activeTab === "inventory" && (
            <Suspense fallback={tabFallback}>
              <InventoryTab />
            </Suspense>
          )}
        </TabsContent>
        <TabsContent value="finance" className="mt-0">
          {activeTab === "finance" && (
            <Suspense fallback={tabFallback}>
              <FinanceTab />
            </Suspense>
          )}
        </TabsContent>
        <TabsContent value="resources" className="mt-0">
          {activeTab === "resources" && (
            <Suspense fallback={tabFallback}>
              <ResourcesTab />
            </Suspense>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
