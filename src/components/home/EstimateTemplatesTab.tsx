import { Fragment, useEffect, useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileStack,
} from "lucide-react";
import {
  useEstimateTemplates,
  useEstimateTemplateDetail,
  type EstimateTemplateSummary,
} from "@/hooks/use-estimate-templates";
import { ResourceTypeBadge } from "@/components/estimate-v2/ResourceTypeBadge";
import type { ResourceLineType } from "@/types/estimate-v2";

interface TemplateCardProps {
  template: EstimateTemplateSummary;
  onOpen: () => void;
}

/** System-canonical templates get a friendlier display title and short tagline
 * regardless of what the DB seed currently stores. Once the seed migration is
 * updated upstream, this override becomes a no-op. */
function applySystemRename(
  template: EstimateTemplateSummary,
  t: TFunction,
): {
  displayTitle: string;
  displayDescription: string | null;
} {
  if (template.ownerKind === "system") {
    return {
      displayTitle: t("home.estimateTemplates.systemCanonical.title"),
      displayDescription: t(
        "home.estimateTemplates.systemCanonical.description",
      ),
    };
  }
  return {
    displayTitle: template.title,
    displayDescription: template.description ?? null,
  };
}

function TemplateCard({ template, onOpen }: TemplateCardProps) {
  const { t } = useTranslation();
  const [coverFailed, setCoverFailed] = useState(false);
  const showCoverImage = Boolean(template.coverImageUrl) && !coverFailed;
  function handleCoverError(event: SyntheticEvent<HTMLImageElement>) {
    event.currentTarget.style.display = "none";
    setCoverFailed(true);
  }
  const { displayTitle, displayDescription } = applySystemRename(template, t);
  const isSystem = template.ownerKind === "system";
  return (
    <Card
      className="flex flex-col overflow-hidden transition hover:border-accent/50 hover:shadow-md cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <div
        className="h-40 w-full bg-gradient-to-br from-accent/25 via-accent/10 to-accent/5 flex items-center justify-center"
        aria-hidden="true"
      >
        {showCoverImage ? (
          <img
            src={template.coverImageUrl ?? undefined}
            alt=""
            className="h-full w-full object-cover"
            onError={handleCoverError}
          />
        ) : isSystem ? (
          <img src="/logo.svg" alt="" className="h-16 w-auto opacity-90" />
        ) : (
          <FileStack className="h-10 w-10 text-accent" strokeWidth={1.5} />
        )}
      </div>
      <CardContent className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-body font-semibold text-foreground">
            {displayTitle}
          </h3>
          <span className="text-caption text-muted-foreground shrink-0">
            {t("home.estimateTemplates.card.stageCount", {
              count: template.stageCount,
            })}
          </span>
        </div>
        {displayDescription && (
          <p className="text-caption text-muted-foreground whitespace-pre-line">
            {displayDescription}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface TemplateDetailDialogProps {
  templateId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function TemplateDetailDialog({
  templateId,
  open,
  onOpenChange,
}: TemplateDetailDialogProps) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useEstimateTemplateDetail(
    open ? templateId : null,
  );
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [expandedWorks, setExpandedWorks] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) {
      setSelectedStageId(null);
      setExpandedWorks(new Set());
    }
  }, [open]);
  const toggleWork = (id: string) =>
    setExpandedWorks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectedStage =
    data?.stages.find((s) => s.id === selectedStageId) ?? null;
  const displayedTitle = data
    ? data.ownerKind === "system"
      ? t("home.estimateTemplates.systemCanonical.title")
      : data.title
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="space-y-0 border-b border-border px-6 py-4">
          {selectedStage ? (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setSelectedStageId(null)}
                aria-label="Назад"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0">
                <DialogTitle className="truncate text-h3">
                  {selectedStage.title}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {selectedStage.description ?? selectedStage.title}
                </DialogDescription>
              </div>
            </div>
          ) : (
            <>
              <DialogTitle className="text-h3">
                {displayedTitle ??
                  (isPending
                    ? t("home.estimateTemplates.detail.loading")
                    : t("home.estimateTemplates.detail.title"))}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {data?.description ??
                  t("home.estimateTemplates.detail.descriptionFallback")}
              </DialogDescription>
              {data && (
                <span className="pt-1 text-caption text-muted-foreground">
                  {t("home.estimateTemplates.card.stageCount", {
                    count: data.stages.length,
                  })}
                </span>
              )}
            </>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isPending && (
            <div className="space-y-2.5">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-14 w-full rounded-card" />
              ))}
            </div>
          )}
          {isError && (
            <p className="text-body-sm text-destructive">
              {t("home.estimateTemplates.detail.error")}
            </p>
          )}

          {data && !selectedStage && (
            <div className="space-y-4">
              {data.ownerKind === "system" ? (
                <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-muted/30 px-6 py-7 text-center">
                  <img
                    src="/logo.svg"
                    alt={t("nav.appName")}
                    className="h-11 w-auto"
                  />
                  <p className="max-w-2xl text-body-sm leading-relaxed text-muted-foreground">
                    {t("home.estimateTemplates.systemCanonical.intro")}
                  </p>
                  <p className="max-w-2xl text-caption text-muted-foreground">
                    {t("home.estimateTemplates.systemCanonical.quantitiesNote")}
                  </p>
                </div>
              ) : (
                data.description && (
                  <p className="text-body text-muted-foreground whitespace-pre-wrap">
                    {data.description}
                  </p>
                )
              )}
              <ol className="space-y-2">
                {data.stages.map((stage, index) => (
                  <li key={stage.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedStageId(stage.id)}
                      className="group flex w-full items-center gap-4 rounded-card border border-border bg-card px-4 py-3.5 text-left transition-colors hover:border-foreground/20 hover:bg-muted/40"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-body-sm font-semibold tabular-nums text-accent">
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body font-semibold text-foreground">
                          {stage.title}
                        </span>
                        <span className="mt-0.5 block text-caption text-muted-foreground">
                          {t("home.estimateTemplates.detail.works", {
                            count: stage.workCount,
                          })}
                          {" · "}
                          {t("home.estimateTemplates.detail.resources", {
                            count: stage.resourceCount,
                          })}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {data && selectedStage && (
            <div className="space-y-5">
              {selectedStage.description && (
                <p className="text-body text-muted-foreground whitespace-pre-wrap">
                  {selectedStage.description}
                </p>
              )}
              <ul className="space-y-2">
                {selectedStage.works.map((work, wIndex) => {
                  const isOpen = expandedWorks.has(work.id);
                  return (
                    <li
                      key={work.id}
                      className="overflow-hidden rounded-card border border-border bg-card"
                    >
                      <button
                        type="button"
                        onClick={() => toggleWork(work.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                      >
                        <span className="w-7 shrink-0 text-body-sm font-medium tabular-nums text-muted-foreground">
                          {wIndex + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-body-sm font-semibold text-foreground">
                            {work.title}
                          </span>
                          {work.description && !isOpen && (
                            <span className="block truncate text-caption text-muted-foreground">
                              {work.description}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-caption tabular-nums text-muted-foreground">
                          {work.resourceLines.length}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>
                      {isOpen && (
                        <div className="border-t border-border bg-muted/20 px-4 py-3.5">
                          {work.description && (
                            <p className="mb-3 text-caption text-muted-foreground whitespace-pre-wrap">
                              {work.description}
                            </p>
                          )}
                          {work.resourceLines.length > 0 ? (
                            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-2.5">
                              {work.resourceLines.map((line) => (
                                <Fragment key={line.id}>
                                  <ResourceTypeBadge
                                    type={line.resourceType as ResourceLineType}
                                    iconOnly
                                  />
                                  <span className="min-w-0 truncate text-body-sm text-foreground">
                                    {line.title}
                                  </span>
                                  <span className="justify-self-end text-body-sm tabular-nums text-foreground">
                                    {line.qtyDefault}
                                  </span>
                                  <span className="text-body-sm text-muted-foreground">
                                    {line.unitDisplay ?? ""}
                                  </span>
                                </Fragment>
                              ))}
                            </div>
                          ) : (
                            <p className="text-caption text-muted-foreground">
                              {"—"}
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-5 py-4 gap-2 sm:gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="inline-block">
                <Button disabled>
                  {t("home.estimateTemplates.detail.applyButton")}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t("home.estimateTemplates.detail.applyDisabledTooltip")}
            </TooltipContent>
          </Tooltip>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("home.estimateTemplates.detail.closeButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EstimateTemplatesTab() {
  const { t } = useTranslation();
  const { data, isPending, isError } = useEstimateTemplates();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  function openTemplate(id: string) {
    setSelectedId(id);
    setDetailOpen(true);
  }

  function handleDetailOpenChange(open: boolean) {
    setDetailOpen(open);
    if (!open) setSelectedId(null);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-h3 text-foreground">
          {t("home.estimateTemplates.title")}
        </h2>
        <p className="text-caption text-muted-foreground mt-0.5">
          {t("home.estimateTemplates.subtitle")}
        </p>
      </div>

      {isPending && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-48 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-8 text-center text-body-sm text-destructive">
            {t("home.estimateTemplates.loadError")}
          </CardContent>
        </Card>
      )}

      {!isPending && !isError && (data?.length ?? 0) === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-caption text-muted-foreground">
            {t("home.estimateTemplates.empty")}
          </CardContent>
        </Card>
      )}

      {!isPending && !isError && (data?.length ?? 0) > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              onOpen={() => openTemplate(template.id)}
            />
          ))}
        </div>
      )}

      <TemplateDetailDialog
        templateId={selectedId}
        open={detailOpen}
        onOpenChange={handleDetailOpenChange}
      />
    </div>
  );
}
