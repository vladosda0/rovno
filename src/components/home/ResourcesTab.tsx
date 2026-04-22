import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Users, AlertTriangle } from "lucide-react";
import * as store from "@/data/store";
import { allUsers } from "@/data/seed";

export function ResourcesTab() {
  const { t } = useTranslation();
  const allTasks = store.getAllTasks();

  const resources = useMemo(() => {
    const map: Record<string, { open: number; dueSoon: number }> = {};
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    for (const task of allTasks) {
      if (task.status === "done") continue;
      if (!map[task.assignee_id]) map[task.assignee_id] = { open: 0, dueSoon: 0 };
      map[task.assignee_id].open++;
      if (task.deadline && new Date(task.deadline).getTime() - now < sevenDays) {
        map[task.assignee_id].dueSoon++;
      }
    }

    return Object.entries(map)
      .map(([userId, counts]) => {
        const user = allUsers.find((u) => u.id === userId);
        return { userId, name: user?.name || userId, email: user?.email, ...counts };
      })
      .sort((a, b) => b.open - a.open);
  }, [allTasks]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-accent" />
        <h2 className="text-body font-semibold text-foreground">{t("resourcesTab.peopleWorkload")}</h2>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {resources.map((r) => {
              const initials = r.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <div key={r.userId} className="flex items-center gap-3 px-sp-3 py-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-caption bg-accent text-accent-foreground">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-foreground truncate">{r.name}</p>
                    {r.email && <p className="text-caption text-muted-foreground truncate">{r.email}</p>}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-center">
                      <p className="text-body-sm font-semibold text-foreground">{r.open}</p>
                      <p className="text-[10px] text-muted-foreground">{t("resourcesTab.open")}</p>
                    </div>
                    {r.dueSoon > 0 && (
                      <div className="text-center">
                        <p className="text-body-sm font-semibold text-warning flex items-center gap-0.5">
                          <AlertTriangle className="h-3 w-3" /> {r.dueSoon}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{t("resourcesTab.dueSoon")}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {resources.length === 0 && (
              <p className="text-caption text-muted-foreground py-8 text-center">{t("resourcesTab.empty")}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
