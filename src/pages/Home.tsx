import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  LayoutDashboard, FolderOpen, CheckSquare, FileText,
  Package, Warehouse, TrendingUp, Users,
} from "lucide-react";
import { OverviewTab } from "@/components/home/OverviewTab";
import { ProjectsTab } from "@/components/home/ProjectsTab";
import { TasksTab } from "@/components/home/TasksTab";
import { DocumentsTab } from "@/components/home/DocumentsTab";
import { ProcurementTab } from "@/components/home/ProcurementTab";
import { InventoryTab } from "@/components/home/InventoryTab";
import { FinanceTab } from "@/components/home/FinanceTab";
import { ResourcesTab } from "@/components/home/ResourcesTab";

const TABS = [
  { value: "overview", label: "Overview", icon: LayoutDashboard },
  { value: "projects", label: "Projects", icon: FolderOpen },
  { value: "tasks", label: "Tasks", icon: CheckSquare },
  { value: "documents", label: "Documents", icon: FileText },
  { value: "procurement", label: "Procurement", icon: Package },
  { value: "inventory", label: "Inventory", icon: Warehouse },
  { value: "finance", label: "Finance", icon: TrendingUp },
  { value: "resources", label: "Resources", icon: Users },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const VALID_TABS = new Set<string>(TABS.map((t) => t.value));

export default function Home() {
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
  }, [searchParams]);

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
        <h1 className="text-h2 text-foreground">Home</h1>
        <p className="text-body-sm text-muted-foreground mt-1">
          Your workspace — projects, tasks, documents, and more.
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
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="overview" className="mt-0"><OverviewTab /></TabsContent>
        <TabsContent value="projects" className="mt-0"><ProjectsTab /></TabsContent>
        <TabsContent value="tasks" className="mt-0"><TasksTab /></TabsContent>
        <TabsContent value="documents" className="mt-0"><DocumentsTab /></TabsContent>
        <TabsContent value="procurement" className="mt-0"><ProcurementTab /></TabsContent>
        <TabsContent value="inventory" className="mt-0"><InventoryTab /></TabsContent>
        <TabsContent value="finance" className="mt-0"><FinanceTab /></TabsContent>
        <TabsContent value="resources" className="mt-0"><ResourcesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
