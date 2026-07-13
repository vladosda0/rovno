import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Loader2, Lock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EstimateV2ProjectSyncDomainState } from "@/data/estimate-v2-store";
import { useEstimateV2Project, useEstimateV2ProjectionCapability } from "@/hooks/use-estimate-v2-data";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { cn } from "@/lib/utils";

const DOMAIN_LABEL_KEYS = {
  tasks: "projectSync.domain.tasks",
  procurement: "projectSync.domain.procurement",
  hr: "projectSync.domain.hr",
} as const;

type DomainKey = keyof typeof DOMAIN_LABEL_KEYS;

type AggregateKind = "blocked" | "error" | "syncing" | "skipped" | "behind" | "synced";

function domainRowState(
  domain: EstimateV2ProjectSyncDomainState,
  estimateRevision: string | null,
): { labelKey: string; tone: "ok" | "busy" | "warn" | "error" } {
  if (domain.status === "error") return { labelKey: "projectSync.state.error", tone: "error" };
  if (domain.status === "syncing") return { labelKey: "projectSync.state.syncing", tone: "busy" };
  if (domain.status === "skipped" && domain.skipReason === "permission") {
    return { labelKey: "projectSync.state.skippedPermission", tone: "warn" };
  }
  if (domain.status === "skipped") return { labelKey: "projectSync.state.skipped", tone: "warn" };
  if (domain.projectedRevision !== estimateRevision) {
    return { labelKey: "projectSync.state.behind", tone: "warn" };
  }
  return { labelKey: "projectSync.state.synced", tone: "ok" };
}

/**
 * Per-project aggregate sync chip: draft-save + the three domain projections
 * (Задачи / Снабжение / HR) in one place, with a per-domain detail popover.
 * Surfaces projection failures on WHATEVER page the user is on — previously an
 * error was only visible after navigating to the affected domain tab.
 *
 * Rendered only for sessions whose sync state is meaningful (the projector, or
 * an editor blocked by finance visibility). Readers never project, so their
 * local revision bookkeeping says nothing worth showing.
 */
export function ProjectSyncIndicator({ projectId }: { projectId: string }) {
  const { t } = useTranslation();
  const mode = useWorkspaceMode();
  const view = useEstimateV2Project(projectId);
  const sync = view.sync;
  const capability = useEstimateV2ProjectionCapability(projectId);

  const aggregate: AggregateKind = useMemo(() => {
    if (capability === "blocked_permission" || sync.draftSaveStatus === "blocked_permission") {
      return "blocked";
    }
    const domains = Object.values(sync.domains);
    if (
      sync.draftSaveStatus === "error"
      || sync.draftSaveStatus === "conflict"
      || domains.some((domain) => domain.status === "error")
    ) {
      return "error";
    }
    if (
      sync.draftSaveStatus === "pending"
      || sync.draftSaveStatus === "saving"
      || domains.some((domain) => domain.status === "syncing")
    ) {
      return "syncing";
    }
    // "skipped" is a settled outcome (nothing to project / no permission), not
    // pending work — a spinner here would promise progress that never comes.
    if (domains.some((domain) => domain.status === "skipped")) {
      return "skipped";
    }
    if (domains.some((domain) => domain.projectedRevision !== sync.estimateRevision)) {
      return "behind";
    }
    return "synced";
  }, [capability, sync]);

  if (
    mode.kind !== "supabase"
    || !projectId
    || view.project.estimateStatus === "planning"
    || capability === "reader"
  ) {
    return null;
  }

  const chip = {
    blocked: {
      icon: <Lock className="h-3.5 w-3.5" aria-hidden />,
      label: t("projectSync.chip.blocked"),
      className: "border-warning/40 bg-warning/10 text-warning",
    },
    error: {
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
      label: t("projectSync.chip.error"),
      className: "border-destructive/40 bg-destructive/10 text-destructive",
    },
    syncing: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
      label: t("projectSync.chip.syncing"),
      className: "border-border bg-background/95 text-muted-foreground",
    },
    skipped: {
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden />,
      label: t("projectSync.chip.skipped"),
      className: "border-warning/40 bg-warning/10 text-warning",
    },
    behind: {
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />,
      label: t("projectSync.chip.behind"),
      className: "border-warning/40 bg-warning/10 text-warning",
    },
    synced: {
      icon: <Check className="h-3.5 w-3.5" aria-hidden />,
      label: t("projectSync.chip.synced"),
      className: "border-border bg-background/95 text-muted-foreground",
    },
  }[aggregate];

  return (
    // Stacked above the FeedbackWidget button (fixed bottom-20/md:bottom-4 right-4,
    // h-11) and below sticky action bars (z-30, matching the feedback button).
    <div className="pointer-events-none fixed bottom-[8.5rem] right-4 z-30 md:bottom-16" data-testid="project-sync-indicator">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur transition-colors",
              chip.className,
            )}
            aria-label={t("projectSync.popover.title")}
          >
            {chip.icon}
            {chip.label}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" side="top" className="w-80">
          <div className="space-y-3">
            <p className="text-body-sm font-medium text-foreground">{t("projectSync.popover.title")}</p>
            {aggregate === "blocked" && (
              <p className="text-body-sm text-muted-foreground">{t("projectSync.popover.blockedHint")}</p>
            )}
            <ul className="space-y-2">
              {(Object.keys(DOMAIN_LABEL_KEYS) as DomainKey[]).map((key) => {
                const domain = sync.domains[key];
                const row = domainRowState(domain, sync.estimateRevision);
                return (
                  <li key={key} className="flex items-start justify-between gap-3 text-body-sm">
                    <span className="text-foreground">{t(DOMAIN_LABEL_KEYS[key])}</span>
                    <span
                      className={cn(
                        "text-right",
                        row.tone === "error" && "text-destructive",
                        row.tone === "warn" && "text-warning",
                        row.tone === "busy" && "text-muted-foreground",
                        row.tone === "ok" && "text-muted-foreground",
                      )}
                    >
                      {t(row.labelKey)}
                      {row.tone === "error" && domain.lastError && (
                        <span className="mt-0.5 block max-w-[180px] break-words text-[11px] text-muted-foreground">
                          {domain.lastError}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            {sync.draftSaveStatus === "error" && sync.draftSaveLastError && (
              <p className="text-[11px] text-destructive">{sync.draftSaveLastError}</p>
            )}
            {sync.draftSaveStatus === "conflict" && (
              <p className="text-[11px] text-warning">{t("estimate.sync.conflict")}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
