import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { useEvents } from "@/hooks/use-mock-data";
import { getUserById } from "@/data/store";
import { usePermission, seamCanViewSensitiveDetail } from "@/lib/permissions";
import { getActivityDisplayDetail } from "@/lib/activity-display";
import { getEventGroupTimestampMs } from "@/lib/event-activity-timestamp";
import { EmptyState } from "@/components/EmptyState";
import {
  Activity,
  Calculator,
  CheckCircle2,
  GitBranch,
  MessageSquare,
  Plus,
  ShoppingCart,
  Users,
  XCircle,
} from "lucide-react";

const typeIcons: Record<string, typeof Activity> = {
  task_created: Plus,
  task_updated: Activity,
  task_completed: CheckCircle2,
  task_moved: GitBranch,
  "estimate.version_submitted": Calculator,
  "estimate.version_approved": CheckCircle2,
  "estimate.status_changed": Activity,
  "estimate.tax_changed": Calculator,
  "estimate.discount_changed": Calculator,
  "estimate.dependency_added": GitBranch,
  "estimate.dependency_removed": XCircle,
  "estimate.viewer_regime_set": Users,
  "estimate.project_mode_set": Activity,
  comment_added: MessageSquare,
  procurement_created: ShoppingCart,
};

export default function ProjectActivity() {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  const events = useEvents(projectId);
  const perm = usePermission(projectId);
  const redactionCtx = { canViewFinanceDetail: seamCanViewSensitiveDetail(perm.seam) };
  const { t, i18n } = useTranslation();

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { year: "numeric", month: "numeric", day: "numeric" }),
    [i18n.language],
  );

  if (events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title={t("activity.empty.title")}
        description={t("activity.empty.description")}
      />
    );
  }

  return (
    <div className="p-sp-3">
      <h2 className="text-h3 text-foreground mb-sp-2">{t("activity.heading")}</h2>
      <div className="space-y-3">
        {events.map((evt) => {
          const actor = getUserById(evt.actor_id);
          const detail = getActivityDisplayDetail(evt, redactionCtx);
          const Icon = typeIcons[evt.type] ?? Activity;
          return (
            <div key={evt.id} className="flex items-start gap-3 glass rounded-card p-sp-2">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-body-sm">
                  <span className="font-medium text-foreground">{actor?.name ?? t("common.unknown")}</span>
                  <span className="text-muted-foreground"> {evt.type.replace(/[._]/g, " ")}</span>
                </p>
                {detail ? <p className="text-caption text-muted-foreground truncate">{detail}</p> : null}
              </div>
              <span className="text-caption text-muted-foreground whitespace-nowrap">
                {dateFormatter.format(new Date(getEventGroupTimestampMs(evt)))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
