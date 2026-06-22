import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Loader2, Search } from "lucide-react";

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
import { useEstimateV2ProjectSync } from "@/hooks/use-estimate-v2-data";

interface EstimateConstructorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  estimateVersionId: string | null;
  profileId: string;
}

const EMPTY_CONSTRUCTOR_STAGES: ConstructorStage[] = [];

export function EstimateConstructor({
  open,
  onOpenChange,
  projectId,
  estimateVersionId,
  profileId,
}: EstimateConstructorProps) {
  const { t } = useTranslation();
  const treeQuery = useCanonicalStagesWithWorks(open);
  const { applyStages, isApplying } = useApplyTemplateStages(projectId, estimateVersionId, profileId);
  // Guard: don't apply while an autosave is pending/in-flight — its prune could
  // race the server-side apply (the flush in the hook is the real fix; this is belt-and-suspenders).
  const sync = useEstimateV2ProjectSync(projectId);
  const isSaving = sync.draftSaveStatus === "pending" || sync.draftSaveStatus === "saving";

  const [filter, setFilter] = useState("");
  // Checked works keyed by stage. A stage counts as selected when its set is non-empty.
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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

  const toggleStage = (stage: ConstructorStage, checked: boolean) => {
    setSelected((prev) => ({
      ...prev,
      [stage.templateStageId]: checked
        ? new Set(stage.works.map((work) => work.templateWorkId))
        : new Set(),
    }));
  };

  const toggleWork = (stageId: string, workId: string) => {
    setSelected((prev) => {
      const set = new Set(prev[stageId] ?? []);
      if (set.has(workId)) set.delete(workId);
      else set.add(workId);
      return { ...prev, [stageId]: set };
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle className="text-base">{t("estimate.constructor.title")}</SheetTitle>
          <SheetDescription className="sr-only">{t("estimate.constructor.title")}</SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="estimates" className="flex min-h-0 flex-1 flex-col">
          <div className="px-4 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="estimates" className="flex-1">
                {t("estimate.constructor.tabs.estimates")}
              </TabsTrigger>
              <TabsTrigger value="catalog" className="flex-1" disabled title={t("estimate.resourceModal.soon")}>
                {t("estimate.constructor.tabs.catalog")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="estimates" className="mt-0 flex min-h-0 flex-1 flex-col">
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
                        {stage.works.map((work) => (
                          <label key={work.templateWorkId} className="flex items-start gap-2 py-1">
                            <Checkbox
                              className="mt-0.5"
                              checked={selected[stage.templateStageId]?.has(work.templateWorkId) ?? false}
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
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })
              )}
            </div>

            <SheetFooter className="border-t border-border p-3 sm:flex-col">
              {!estimateVersionId && (
                <p className="mb-1 text-xs text-muted-foreground">{t("estimate.constructor.noEstimate")}</p>
              )}
              <Button
                className="w-full"
                disabled={selectedWorkCount === 0 || isApplying || isSaving || !estimateVersionId}
                onClick={handleApply}
              >
                {isApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {t("estimate.constructor.applyButton", {
                  stages: selectedStageCount,
                  works: selectedWorkCount,
                })}
              </Button>
            </SheetFooter>
          </TabsContent>

          <TabsContent value="catalog" className="mt-0 flex-1 p-6 text-center text-sm text-muted-foreground">
            {t("estimate.resourceModal.soon")}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
