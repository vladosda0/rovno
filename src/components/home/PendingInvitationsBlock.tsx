import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { MailPlus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useProjects, useWorkspaceMode } from "@/hooks/use-mock-data";
import * as store from "@/data/store";
import { getWorkspaceSource, type WorkspaceProjectInvite } from "@/data/workspace-source";
import { acceptProjectInvite } from "@/lib/accept-project-invite";

interface PendingInviteItem {
  invite: WorkspaceProjectInvite;
  projectTitle: string;
}

export function PendingInvitationsBlock() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const mode = useWorkspaceMode();
  const projects = useProjects();
  const [acceptingInviteId, setAcceptingInviteId] = useState<string | null>(null);

  const pendingInvitesQuery = useQuery({
    queryKey: ["home", "pending-invites", mode.kind === "supabase" ? mode.profileId : mode.kind],
    queryFn: async (): Promise<PendingInviteItem[]> => {
      const source = await getWorkspaceSource(mode.kind === "supabase" ? mode : undefined);
      const allProjects = await source.getProjects();
      const inviteRows = await Promise.all(
        allProjects.map(async (project) => {
          const invites = await source.getProjectInvites(project.id);
          return invites
            .filter((invite) => invite.status === "pending")
            .map((invite) => ({ invite, projectTitle: project.title }));
        }),
      );
      return inviteRows.flat();
    },
    enabled: mode.kind === "supabase",
    staleTime: 30_000,
  });

  const fallbackPendingInvites = useMemo<PendingInviteItem[]>(() => {
    if (mode.kind === "supabase") {
      return [];
    }

    return projects.flatMap((project) =>
      store
        .getProjectInvites(project.id)
        .filter((invite) => invite.status === "pending")
        .map((invite) => ({ invite, projectTitle: project.title })),
    );
  }, [mode.kind, projects]);

  const pendingInvites = mode.kind === "supabase"
    ? (pendingInvitesQuery.data ?? [])
    : fallbackPendingInvites;

  async function handleAccept(invite: WorkspaceProjectInvite) {
    setAcceptingInviteId(invite.id);
    try {
      const result = await acceptProjectInvite(invite.invite_token);
      if (!result.ok) {
        toast({
          title: "Invite acceptance failed",
          description: result.error.message,
          variant: "destructive",
        });
        return;
      }

      toast({ title: "Invite accepted" });
      navigate(`/project/${result.invite.project_id}/dashboard`);
    } finally {
      setAcceptingInviteId(null);
      void pendingInvitesQuery.refetch();
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <h3 className="mb-3 flex items-center gap-2 text-body font-semibold text-foreground sm:mb-4">
          <MailPlus className="h-4 w-4 text-accent" /> Pending invitations
        </h3>
        {pendingInvites.length === 0 ? (
          <p className="text-caption text-muted-foreground py-2">
            No pending invitations.
          </p>
        ) : (
          <div className="space-y-2">
            {pendingInvites.map(({ invite, projectTitle }) => (
              <div
                key={invite.id}
                className="flex flex-col gap-2 rounded-lg border border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-foreground truncate">{projectTitle}</p>
                  <p className="text-caption text-muted-foreground truncate">
                    {invite.email} · {invite.role}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => void handleAccept(invite)}
                  disabled={acceptingInviteId === invite.id}
                >
                  {acceptingInviteId === invite.id ? "Accepting..." : "Accept"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
