import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronLeft, Loader2, Plus, Search } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useCanonicalStagesWithWorks,
  type ConstructorStage,
} from "@/hooks/use-canonical-stages-with-works";
import { useApplyTemplateStages, type StageApplySelection } from "@/hooks/use-apply-template-stages";
import { useAddLibraryWork, type AddWorkRequest } from "@/hooks/use-add-library-work";
import { useCanonicalCatalog, type CatalogResource } from "@/hooks/use-canonical-catalog";
import { useEstimateV2ProjectSync } from "@/hooks/use-estimate-v2-data";

type ConstructorTab = "estimates" | "catalog";

interface EstimateConstructorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  estimateVersionId: string | null;
  /**
   * Whether server-side apply/add is available (supabase workspace mode). When false the
   * Apply/Add button stays disabled and the library RPCs are not issued; when true a null
   * estimateVersionId is bootstrapped on apply.
   */
  canApply: boolean;
  profileId: string;
  /**
   * Contextual target. A `workId` opens "add resources to this work" (Каталоги tab); a
   * `stageId` without a workId opens "add works to this stage"; omitted = apply whole
   * template stages (the original flow).
   */
  target?: { stageId?: string; workId?: string } | null;
  /** Initial tab; defaults to "catalog" in add-resource mode, else "estimates". */
  initialTab?: ConstructorTab;
  /** Adds a catalog leaf as a resource line on the target work (client-side). Add-resource mode. */
  onAddCatalogResource?: (resource: CatalogResource) => void;
}

const EMPTY_CONSTRUCTOR_STAGES: ConstructorStage[] = [];

export function EstimateConstructor({
  open,
  onOpenChange,
  projectId,
  estimateVersionId,
  canApply,
  profileId,
  target,
  initialTab,
  onAddCatalogResource,
}: EstimateConstructorProps) {
  const { t } = useTranslation();

  const addResourceMode = Boolean(target?.workId);
  const addWorkMode = Boolean(target?.stageId) && !target?.workId;
  const defaultTab: ConstructorTab = initialTab ?? (addResourceMode ? "catalog" : "estimates");

  const [tab, setTab] = useState<ConstructorTab>(defaultTab);
  const [filter, setFilter] = useState("");
  // Checked works keyed by stage. A stage counts as selected when its set is non-empty.
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Whether a work's resource list is expanded (add-work mode only), keyed by templateWorkId.
  const [expandedWorks, setExpandedWorks] = useState<Record<string, boolean>>({});
  // Deselected resource line ids per work (add-work mode); default empty = all included.
  const [uncheckedResources, setUncheckedResources] = useState<Record<string, Set<string>>>({});
  const [catalogSubcategory, setCatalogSubcategory] = useState<string | null>(null);

  // Reset transient UI to the contextual default each time the sheet opens.
  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? (addResourceMode ? "catalog" : "estimates"));
    setFilter("");
    setSelected({});
    setExpanded({});
    setExpandedWorks({});
    setUncheckedResources({});
    setCatalogSubcategory(null);
  }, [open, initialTab, addResourceMode]);

  // The canonical RPCs are a Supabase-only feature; gate on canApply (supabase mode) so the
  // Constructor never hits a session-less client in demo/local. The template tree is only
  // needed for the estimates tab (apply-stages / add-work), the catalog only for add-resource.
  const treeQuery = useCanonicalStagesWithWorks(open && canApply && !addResourceMode);
  const catalogQuery = useCanonicalCatalog(
    catalogSubcategory,
    open && canApply && addResourceMode && tab === "catalog",
  );

  const { applyStages, isApplying } = useApplyTemplateStages(projectId, estimateVersionId, profileId);
  const { addWorks, isAdding } = useAddLibraryWork(projectId, estimateVersionId, profileId);
  // Guard: don't mutate while an autosave is pending/in-flight — its prune could race the
  // server-side apply/add (the flush in the hooks is the real fix; this is belt-and-suspenders).
  const sync = useEstimateV2ProjectSync(projectId);
  const isSaving = sync.draftSaveStatus === "pending" || sync.draftSaveStatus === "saving";

  const stages = treeQuery.data?.stages ?? EMPTY_CONSTRUCTOR_STAGES;

  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return stages;
    return stages
      .map((stage) => ({
        ...stage,
        works: stage.works.filter((work) => work.title.toLowerCase().includes(query)),
      }))
      .filter((stage) => stage.title.toLowerCase().includes(query) || stage.works.length > 0);
  }, [stages, filter]);

  const selectedStageCount = Object.values(selected).filter((set) => set.size > 0).length;
  const selectedWorkCount = Object.values(selected).reduce((sum, set) => sum + set.size, 0);

  const stageAllChecked = (stage: ConstructorStage) =>
    stage.works.length > 0 && (selected[stage.templateStageId]?.size ?? 0) === stage.works.length;
  const stageSomeChecked = (stage: ConstructorStage) =>
    (selected[stage.templateStageId]?.size ?? 0) > 0 && !stageAllChecked(stage);

  // Toggling a work (or whole stage) resets that work's per-resource selection, so
  // re-checking a work always starts with its full default resource set included.
  const clearResourceSelection = (workIds: string[]) => {
    setUncheckedResources((prev) => {
      if (!workIds.some((id) => prev[id])) return prev;
      const next = { ...prev };
      for (const id of workIds) delete next[id];
      return next;
    });
  };

  const toggleStage = (stage: ConstructorStage, checked: boolean) => {
    setSelected((prev) => ({
      ...prev,
      [stage.templateStageId]: checked
        ? new Set(stage.works.map((work) => work.templateWorkId))
        : new Set(),
    }));
    clearResourceSelection(stage.works.map((work) => work.templateWorkId));
  };

  const toggleWork = (stageId: string, workId: string) => {
    setSelected((prev) => {
      const set = new Set(prev[stageId] ?? []);
      if (set.has(workId)) set.delete(workId);
      else set.add(workId);
      return { ...prev, [stageId]: set };
    });
    clearResourceSelection([workId]);
  };

  const toggleWorkExpanded = (workId: string) => {
    setExpandedWorks((prev) => ({ ...prev, [workId]: !(prev[workId] ?? false) }));
  };

  const toggleResource = (workId: string, lineId: string) => {
    setUncheckedResources((prev) => {
      const set = new Set(prev[workId] ?? []);
      if (set.has(lineId)) set.delete(lineId);
      else set.add(lineId);
      return { ...prev, [workId]: set };
    });
  };

  const handleApply = async () => {
    const selections: StageApplySelection[] = [];
    for (const stage of stages) {
      const checkedWorks = selected[stage.templateStageId];
      if (!checkedWorks || checkedWorks.size === 0) continue;
      const orderedTemplateWorkIds = stage.works.map((work) => work.templateWorkId);
      const uncheckedTemplateWorkIds = orderedTemplateWorkIds.filter(
        (templateWorkId) => !checkedWorks.has(templateWorkId),
      );
      selections.push({
        templateStageId: stage.templateStageId,
        stageTitle: stage.title,
        orderedTemplateWorkIds,
        uncheckedTemplateWorkIds,
      });
    }
    await applyStages(selections);
    setSelected({});
  };

  const handleAddWorks = async () => {
    if (!target?.stageId) return;
    const requests: AddWorkRequest[] = [];
    for (const stage of stages) {
      const checked = selected[stage.templateStageId];
      if (!checked) continue;
      for (const work of stage.works) {
        if (!checked.has(work.templateWorkId)) continue;
        const unchecked = uncheckedResources[work.templateWorkId];
        // Only the work's own resource line ids (guards against any stale selection).
        const excludedResourceLineIds = unchecked
          ? work.resourceLines.filter((line) => unchecked.has(line.id)).map((line) => line.id)
          : [];
        requests.push({ templateWorkId: work.templateWorkId, excludedResourceLineIds });
      }
    }
    if (requests.length === 0) return;
    await addWorks(target.stageId, requests);
    setSelected({});
    setUncheckedResources({});
  };

  const catalog = catalogQuery.data;
  const titleKey = addResourceMode
    ? "estimate.constructor.titleAddResource"
    : addWorkMode
      ? "estimate.constructor.titleAddWork"
      : "estimate.constructor.title";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle className="text-base">{t(titleKey)}</SheetTitle>
          <SheetDescription className="sr-only">{t(titleKey)}</SheetDescription>
        </SheetHeader>

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as ConstructorTab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="px-4 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="estimates" className="flex-1" disabled={addResourceMode}>
                {t("estimate.constructor.tabs.estimates")}
              </TabsTrigger>
              <TabsTrigger
                value="catalog"
                className="flex-1"
                disabled={!addResourceMode}
                title={!addResourceMode ? t("estimate.constructor.catalogNeedsWork") : undefined}
              >
                {t("estimate.constructor.tabs.catalog")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="estimates" className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex">
            <div className="p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t("estimate.constructor.searchPlaceholder")}
                  className="h-8 pl-8"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {treeQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("estimate.constructor.loading")}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {t("estimate.constructor.noResults")}
                </div>
              ) : (
                filtered.map((stage) => {
                  const isOpen = expanded[stage.templateStageId] ?? false;
                  return (
                    <Collapsible
                      key={stage.templateStageId}
                      open={isOpen}
                      onOpenChange={(value) =>
                        setExpanded((prev) => ({ ...prev, [stage.templateStageId]: value }))
                      }
                      className="border-b border-border/60 last:border-b-0"
                    >
                      <div className="flex items-start gap-2 py-2">
                        <Checkbox
                          className="mt-0.5"
                          checked={
                            stageAllChecked(stage)
                              ? true
                              : stageSomeChecked(stage)
                                ? "indeterminate"
                                : false
                          }
                          onCheckedChange={(value) => toggleStage(stage, value === true)}
                          aria-label={stage.title}
                        />
                        <CollapsibleTrigger asChild>
                          <button type="button" className="flex min-w-0 flex-1 items-start gap-1 text-left">
                            <ChevronDown
                              className={cn(
                                "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                                isOpen && "rotate-180",
                              )}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium leading-snug">{stage.title}</span>
                              <span className="block text-xs text-muted-foreground">
                                {t("estimate.constructor.stageMeta", {
                                  works: stage.workCount,
                                  resources: stage.resourceCount,
                                })}
                              </span>
                            </span>
                          </button>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent className="pb-2 pl-6">
                        {stage.works.map((work) => {
                          const workChecked =
                            selected[stage.templateStageId]?.has(work.templateWorkId) ?? false;
                          // In add-work mode, works with resources expand so the user can see
                          // and deselect the resources that come with them.
                          const resourceExpandable = addWorkMode && work.resourceLines.length > 0;
                          if (!resourceExpandable) {
                            return (
                              <label key={work.templateWorkId} className="flex items-start gap-2 py-1">
                                <Checkbox
                                  className="mt-0.5"
                                  checked={workChecked}
                                  onCheckedChange={() => toggleWork(stage.templateStageId, work.templateWorkId)}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-sm leading-snug">{work.title}</span>
                                  {work.resourceCount > 0 && (
                                    <span className="block text-xs text-muted-foreground">
                                      {t("estimate.constructor.workMeta", { resources: work.resourceCount })}
                                    </span>
                                  )}
                                </span>
                              </label>
                            );
                          }
                          const workOpen = expandedWorks[work.templateWorkId] ?? false;
                          const unchecked = uncheckedResources[work.templateWorkId];
                          return (
                            <div key={work.templateWorkId} className="py-1">
                              <div className="flex items-start gap-2">
                                <Checkbox
                                  className="mt-0.5"
                                  checked={workChecked}
                                  onCheckedChange={() => toggleWork(stage.templateStageId, work.templateWorkId)}
                                  aria-label={work.title}
                                />
                                <button
                                  type="button"
                                  onClick={() => toggleWorkExpanded(work.templateWorkId)}
                                  className="flex min-w-0 flex-1 items-start gap-1 text-left"
                                  aria-expanded={workOpen}
                                >
                                  <ChevronDown
                                    className={cn(
                                      "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                                      workOpen && "rotate-180",
                                    )}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm leading-snug">{work.title}</span>
                                    <span className="block text-xs text-muted-foreground">
                                      {t("estimate.constructor.workMeta", { resources: work.resourceCount })}
                                    </span>
                                  </span>
                                </button>
                              </div>
                              {workOpen && (
                                <div className="mt-1 flex flex-col gap-0.5 pl-[1.625rem]">
                                  {work.resourceLines.map((line) => {
                                    const resourceChecked = workChecked && !(unchecked?.has(line.id) ?? false);
                                    const meta = [line.unitDisplay].filter(Boolean).join(" · ");
                                    return (
                                      <label
                                        key={line.id}
                                        className={cn(
                                          "flex items-start gap-2 py-0.5",
                                          !workChecked && "opacity-50",
                                        )}
                                      >
                                        <Checkbox
                                          className="mt-0.5 h-3.5 w-3.5"
                                          checked={resourceChecked}
                                          disabled={!workChecked}
                                          onCheckedChange={() => toggleResource(work.templateWorkId, line.id)}
                                          aria-label={line.title}
                                        />
                                        <span className="min-w-0 flex-1">
                                          <span className="block break-words text-xs leading-snug">
                                            {line.title}
                                          </span>
                                          {meta && (
                                            <span className="block text-[11px] text-muted-foreground">{meta}</span>
                                          )}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })
              )}
            </div>

            <SheetFooter className="border-t border-border p-3 sm:flex-col">
              {addWorkMode ? (
                <Button
                  className="w-full"
                  disabled={selectedWorkCount === 0 || isAdding || isSaving || !canApply}
                  onClick={handleAddWorks}
                >
                  {isAdding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("estimate.constructor.addWorkButton", { count: selectedWorkCount })}
                </Button>
              ) : (
                <Button
                  className="w-full"
                  disabled={selectedWorkCount === 0 || isApplying || isSaving || !canApply}
                  onClick={handleApply}
                >
                  {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t("estimate.constructor.applyButton", {
                    stages: selectedStageCount,
                    works: selectedWorkCount,
                  })}
                </Button>
              )}
            </SheetFooter>
          </TabsContent>

          <TabsContent value="catalog" className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex">
            <p className="px-4 pt-3 text-xs text-muted-foreground">
              {t("estimate.constructor.catalogHint")}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {catalogQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("estimate.constructor.catalogLoading")}
                </div>
              ) : catalog?.mode === "drill" ? (
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => setCatalogSubcategory(null)}
                    className="mb-1 flex items-center gap-1 self-start rounded-sm px-1 py-0.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    {t("estimate.constructor.catalogBack")}
                  </button>
                  <p className="px-1 text-sm font-medium">{catalog.subcategory}</p>
                  {catalog.resources.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {t("estimate.constructor.catalogEmpty")}
                    </p>
                  ) : (
                    catalog.resources.map((resource) => (
                      <button
                        key={resource.id}
                        type="button"
                        onClick={() => onAddCatalogResource?.(resource)}
                        className="flex items-start gap-2 rounded-sm px-1 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                      >
                        <Plus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm leading-snug">{resource.name}</span>
                          <span className="block text-xs text-muted-foreground">
                            {[resource.unitDisplay, resource.rovnoSku].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : catalog && catalog.groups.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {catalog.groups.map((group) => (
                    <div key={group.group} className="flex flex-col gap-0.5">
                      <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.group}
                      </p>
                      {group.subcategories.map((sub) => (
                        <button
                          key={sub.subcategory}
                          type="button"
                          onClick={() => setCatalogSubcategory(sub.subcategory)}
                          className="flex items-center justify-between gap-2 rounded-sm px-1 py-1.5 text-left hover:bg-accent hover:text-accent-foreground"
                        >
                          <span className="min-w-0 flex-1 break-words text-sm leading-snug">
                            {sub.subcategory}
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {sub.leafCount}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {t("estimate.constructor.catalogEmpty")}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
