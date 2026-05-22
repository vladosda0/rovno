import { useState } from "react";
import type { SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FileStack } from "lucide-react";
import {
  useEstimateTemplates,
  useEstimateTemplateDetail,
  type EstimateTemplateSummary,
} from "@/hooks/use-estimate-templates";

interface TemplateCardProps {
  template: EstimateTemplateSummary;
  onOpen: () => void;
}

/** System-canonical templates get a friendlier display title and short tagline
 * regardless of what the DB seed currently stores. Once the seed migration is
 * updated upstream, this override becomes a no-op. */
function applySystemRename(template: EstimateTemplateSummary, t: TFunction): {
  displayTitle: string;
  displayDescription: string | null;
} {
  if (template.ownerKind === "system") {
    return {
      displayTitle: t("home.estimateTemplates.systemCanonical.title"),
      displayDescription: t("home.estimateTemplates.systemCanonical.description"),
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
          <h3 className="line-clamp-2 text-body font-semibold text-foreground">{displayTitle}</h3>
          <span className="text-caption text-muted-foreground shrink-0">
            {t("home.estimateTemplates.card.stageCount", { count: template.stageCount })}
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

function TemplateDetailDialog({ templateId, open, onOpenChange }: TemplateDetailDialogProps) {
  const { t } = useTranslation();
  const { data, isPending, isError } = useEstimateTemplateDetail(open ? templateId : null);
  const displayedTitle = data
    ? (data.ownerKind === "system" ? t("home.estimateTemplates.systemCanonical.title") : data.title)
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>
            {displayedTitle ?? (isPending ? t("home.estimateTemplates.detail.loading") : t("home.estimateTemplates.detail.title"))}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {data?.description ?? t("home.estimateTemplates.detail.descriptionFallback")}
          </DialogDescription>
          {data && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-caption text-muted-foreground">
                {t("home.estimateTemplates.card.stageCount", { count: data.stages.length })}
              </span>
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {isPending && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, idx) => (
                <Skeleton key={idx} className="h-16 w-full" />
              ))}
            </div>
          )}
          {isError && (
            <p className="text-body-sm text-destructive">{t("home.estimateTemplates.detail.error")}</p>
          )}
          {data && (
            <>
              {data.description && (
                <p className="text-body-sm text-muted-foreground whitespace-pre-wrap">
                  {data.description}
                </p>
              )}
              <ol className="space-y-3">
                {data.stages.map((stage, index) => (
                  <li
                    key={stage.id}
                    className="rounded-panel border border-border bg-card p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-caption font-medium text-accent">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <h4 className="text-body-sm font-medium text-foreground">{stage.title}</h4>
                          {stage.scopeTag && (
                            <Badge variant="secondary" className="text-[10px]">
                              {stage.scopeTag}
                            </Badge>
                          )}
                        </div>
                        {stage.description && (
                          <p className="text-caption text-muted-foreground whitespace-pre-wrap">
                            {stage.description}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground">
                          {t("home.estimateTemplates.detail.works", { count: stage.workCount })}
                          {", "}
                          {t("home.estimateTemplates.detail.resources", { count: stage.resourceCount })}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </>
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
        <h2 className="text-h3 text-foreground">{t("home.estimateTemplates.title")}</h2>
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
            <TemplateCard key={template.id} template={template} onOpen={() => openTemplate(template.id)} />
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
