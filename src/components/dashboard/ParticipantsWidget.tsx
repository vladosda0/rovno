import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Users, ArrowRight } from "lucide-react";
import { getUserById } from "@/data/store";
import { cn } from "@/lib/utils";
import type { Member } from "@/types/entities";

interface Props {
  members: Member[];
  projectId: string;
  className?: string;
}

const ROLE_KEY_MAP: Record<string, string> = {
  owner: "participantsWidget.role.owner",
  co_owner: "participantsWidget.role.coOwner",
  viewer: "participantsWidget.role.viewer",
  contractor: "participantsWidget.role.contractor",
  client: "participantsWidget.role.client",
  manager: "participantsWidget.role.manager",
  worker: "participantsWidget.role.worker",
};

export function ParticipantsWidget({ members, projectId, className }: Props) {
  const { t } = useTranslation();
  const roleLabel = (role: Member["role"]) => {
    const key = ROLE_KEY_MAP[role as string];
    if (key) return t(key);
    return String(role).charAt(0).toUpperCase() + String(role).slice(1);
  };

  return (
    <div className={cn("glass rounded-card p-sp-2 h-full flex flex-col", className)}>
      <div className="flex items-center justify-between mb-sp-2">
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" /> {t("participantsWidget.title")}
        </h3>
        <Link to={`/project/${projectId}/participants`} className="text-caption text-accent hover:underline flex items-center gap-1">
          {t("participantsWidget.manage")} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-1.5 flex-1">
        {members.map((m) => {
          const user = getUserById(m.user_id);
          return (
            <div key={m.user_id} className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2">
              <div className="h-6 w-6 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-semibold text-accent">{user?.name?.charAt(0) ?? "?"}</span>
              </div>
              <span className="text-caption text-foreground flex-1 truncate">{user?.name ?? t("participantsWidget.unknown")}</span>
              <span className="text-[10px] text-muted-foreground">{roleLabel(m.role)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
