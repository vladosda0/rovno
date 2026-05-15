import { Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { VALID_HOME_TABS } from "@/components/HomeTabs";

const OverviewTab = lazy(() =>
  import("@/components/home/OverviewTab").then((module) => ({ default: module.OverviewTab })),
);
const ProjectsTab = lazy(() =>
  import("@/components/home/ProjectsTab").then((module) => ({ default: module.ProjectsTab })),
);
const TasksTab = lazy(() =>
  import("@/components/home/TasksTab").then((module) => ({ default: module.TasksTab })),
);
const DocumentsHubTab = lazy(() =>
  import("@/components/home/DocumentsHubTab").then((module) => ({ default: module.DocumentsHubTab })),
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

const TAB_RENDERERS: Record<string, React.ComponentType> = {
  overview: OverviewTab,
  projects: ProjectsTab,
  tasks: TasksTab,
  documents: DocumentsHubTab,
  procurement: ProcurementTab,
  inventory: InventoryTab,
  finance: FinanceTab,
  resources: ResourcesTab,
};

export default function Home() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const param = searchParams.get("tab");
  const activeTab = param && VALID_HOME_TABS.has(param) ? param : "overview";
  const ActiveSection = TAB_RENDERERS[activeTab] ?? OverviewTab;

  // Documents hub renders edge-to-edge so the left nav can sit flush to the
  // viewport edge. Other sections keep the centered, padded container.
  const isDocumentsHub = activeTab === "documents";

  const fallback = (
    <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
      {t("home.tab.loading")}
    </div>
  );

  if (isDocumentsHub) {
    return (
      <Suspense fallback={fallback}>
        <ActiveSection />
      </Suspense>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <Suspense fallback={fallback}>
        <ActiveSection />
      </Suspense>
    </div>
  );
}
