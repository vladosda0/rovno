import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Check, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useUserOrganizations, useSetActiveOrg } from "@/hooks/use-orgs";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { CreateOrgDialog } from "@/components/orgs/CreateOrgDialog";
import { DeleteOrgDialog } from "@/components/orgs/DeleteOrgDialog";
import { toast } from "@/hooks/use-toast";
import type { OrgSummary } from "@/data/org-source";

const ROLE_LABEL_KEY: Record<OrgSummary["role"], string> = {
  owner: "home.org.role.owner",
  admin: "home.org.role.admin",
  member: "home.org.role.member",
};

const MAX_VISIBLE_ORGS = 3;

export function OrgBlock() {
  const { t } = useTranslation();
  const mode = useWorkspaceMode();
  const isSupabaseMode = mode.kind === "supabase";
  const { data: orgs, isPending } = useUserOrganizations();
  const setActiveMutation = useSetActiveOrg();
  const [createOpen, setCreateOpen] = useState(false);
  const [orgToDelete, setOrgToDelete] = useState<OrgSummary | null>(null);

  if (!isSupabaseMode) {
    return null;
  }

  if (isPending) {
    return (
      <Card className="mb-4 sm:mb-6">
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const orgList = orgs ?? [];

  if (orgList.length === 0) {
    return (
      <>
        <Card className="mb-4 sm:mb-6 border-dashed">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-md bg-accent/10 p-2 text-accent">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-body-sm font-semibold text-foreground">
                {t("home.org.cta.title")}
              </h3>
              <p className="text-caption text-muted-foreground">
                {t("home.org.cta.description")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              {t("home.org.cta.action")}
            </Button>
          </CardContent>
        </Card>
        <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
      </>
    );
  }

  const visible = orgList.slice(0, MAX_VISIBLE_ORGS);
  const overflow = Math.max(0, orgList.length - visible.length);

  async function handleActivate(org: OrgSummary) {
    if (org.isActiveContext || setActiveMutation.isPending) return;
    try {
      await setActiveMutation.mutateAsync(org.id);
    } catch (error) {
      toast({
        title: t("home.org.switchError"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  const isSingleOrg = orgList.length === 1;

  return (
    <>
      <Card className="mb-4 sm:mb-6">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-body-sm font-semibold text-foreground flex items-center gap-1.5">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              {t(isSingleOrg ? "home.org.headingSingle" : "home.org.heading")}
            </h3>
          </div>
          <ul className="divide-y divide-border">
            {visible.map((org) => (
              <li key={org.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                {isSingleOrg ? (
                  <div
                    aria-hidden="true"
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-border text-muted-foreground"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={t("home.org.makeActive")}
                    onClick={() => handleActivate(org)}
                    disabled={org.isActiveContext || setActiveMutation.isPending}
                    className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${
                      org.isActiveContext
                        ? "bg-accent border-accent text-accent-foreground"
                        : "border-border text-transparent hover:text-muted-foreground"
                    }`}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-body-sm font-medium text-foreground truncate">{org.name}</span>
                    {!isSingleOrg && org.isActiveContext && (
                      <Badge variant="secondary" className="text-[10px]">
                        {t("home.org.activeBadge")}
                      </Badge>
                    )}
                  </div>
                  <div className="text-caption text-muted-foreground flex items-center gap-2">
                    <span>{t(ROLE_LABEL_KEY[org.role])}</span>
                    <span>·</span>
                    <span>{t("home.org.memberCount", { count: org.memberCount })}</span>
                  </div>
                </div>
                {org.role === "owner" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => setOrgToDelete(org)}
                    title={t("home.org.deleteTooltip")}
                    aria-label={t("home.org.deleteTooltip")}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
            {overflow > 0 && (
              <li className="py-2 text-caption text-muted-foreground">
                +{overflow}
              </li>
            )}
          </ul>
        </CardContent>
      </Card>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
      {orgToDelete && (
        <DeleteOrgDialog
          open={true}
          onOpenChange={(o) => { if (!o) setOrgToDelete(null); }}
          orgId={orgToDelete.id}
          orgName={orgToDelete.name}
        />
      )}
    </>
  );
}
