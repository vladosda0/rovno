import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Lock } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectDataGateState } from "@/lib/project-data-gate";

function DefaultLoading() {
  return (
    <div className="space-y-3" data-testid="data-gate-loading">
      <Skeleton className="h-16 rounded-card" />
      <Skeleton className="h-16 rounded-card" />
      <Skeleton className="h-16 rounded-card" />
    </div>
  );
}

function DefaultSyncing() {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center justify-center gap-2 py-sp-5 text-body-sm text-muted-foreground"
      data-testid="data-gate-syncing"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      {t("projectData.syncing")}
    </div>
  );
}

function DefaultRedacted() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={Lock}
      title={t("projectData.redacted.title")}
      description={t("projectData.redacted.description")}
    />
  );
}

interface DataGateProps {
  state: ProjectDataGateState;
  /** Rendered for "ready". */
  children: ReactNode;
  /** Rendered for "empty" — the page's own EmptyState. */
  empty: ReactNode;
  loading?: ReactNode;
  syncing?: ReactNode;
  redacted?: ReactNode;
}

/**
 * Branches a domain list between honest render states so an empty list is
 * only ever shown when the data is truly empty — never while loading, hidden
 * by permissions, or waiting out an estimate projection.
 */
export function DataGate({ state, children, empty, loading, syncing, redacted }: DataGateProps) {
  switch (state) {
    case "loading":
      return <>{loading ?? <DefaultLoading />}</>;
    case "syncing":
      return <>{syncing ?? <DefaultSyncing />}</>;
    case "redacted":
      return <>{redacted ?? <DefaultRedacted />}</>;
    case "empty":
      return <>{empty}</>;
    case "ready":
    default:
      return <>{children}</>;
  }
}
