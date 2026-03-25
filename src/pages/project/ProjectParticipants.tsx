import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, MoreVertical, Shield, Eye, Wrench, Crown, Mail } from "lucide-react";
import { useCurrentUser, useProject, useProjectInvites, useWorkspaceMode } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import { addEvent, getUserById } from "@/data/store";
import {
  createWorkspaceProjectInvite,
  updateWorkspaceProjectInvite,
  updateWorkspaceProjectMemberRole,
  type WorkspaceProjectInvite,
} from "@/data/workspace-source";
import { workspaceQueryKeys } from "@/hooks/use-workspace-source";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import type { Member, MemberRole, AIAccess } from "@/types/entities";
import {
  getInviteAiAccessOptions,
  getInviteRoleOptions,
  getReassignRoleOptions,
} from "@/lib/participant-role-policy";

const roleIcons: Record<MemberRole, typeof Crown> = {
  owner: Crown,
  co_owner: Shield,
  contractor: Wrench,
  viewer: Eye,
};

const roleLabels: Record<MemberRole, string> = {
  owner: "Owner",
  co_owner: "Co-owner",
  contractor: "Contractor",
  viewer: "Viewer",
};

const aiLabels: Record<AIAccess, string> = {
  none: "No AI",
  consult_only: "Consult only",
  project_pool: "Project pool",
};

type ViewerRegime = "contractor" | "client" | "build_myself";
type RoleTarget =
  | { kind: "member"; userId: string }
  | { kind: "invite"; inviteId: string };

function resolveViewerRegime(
  role: MemberRole,
  projectMode: "contractor" | "build_myself",
): ViewerRegime | undefined {
  if (role !== "viewer") return undefined;
  return projectMode === "build_myself" ? "build_myself" : "client";
}

function inviteStatusLabel(status: WorkspaceProjectInvite["status"]) {
  if (status === "pending") return "Pending";
  if (status === "accepted") return "Accepted";
  if (status === "expired") return "Expired";
  return "Revoked";
}

function inviteStatusClassName(status: WorkspaceProjectInvite["status"]) {
  if (status === "pending") return "bg-info/10 text-info";
  if (status === "accepted") return "bg-success/10 text-success";
  if (status === "expired") return "bg-warning/10 text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

export default function ProjectParticipants() {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  const { project, members } = useProject(projectId);
  const invites = useProjectInvites(projectId);
  const perm = usePermission(projectId);
  const workspaceMode = useWorkspaceMode();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();

  const actorRole = perm.seam.membership?.role ?? "viewer";
  const actorAiAccess = perm.seam.membership?.ai_access ?? "none";
  const inviteRoleOptions = useMemo(() => getInviteRoleOptions(actorRole), [actorRole]);
  const inviteAiAccessOptions = useMemo(
    () => getInviteAiAccessOptions(actorAiAccess),
    [actorAiAccess],
  );

  const projectMode = project?.project_mode === "build_myself" ? "build_myself" : "contractor";
  const defaultViewerRegime = projectMode === "build_myself" ? "build_myself" : "client";
  const availableViewerRegimes = projectMode === "build_myself"
    ? (["build_myself", "contractor"] as const)
    : (["client", "contractor", "build_myself"] as const);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("contractor");
  const [inviteViewerRegime, setInviteViewerRegime] = useState<ViewerRegime>(defaultViewerRegime);
  const [inviteAI, setInviteAI] = useState<AIAccess>("consult_only");
  const [inviteLimit, setInviteLimit] = useState("50");

  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<RoleTarget | null>(null);
  const [newRole, setNewRole] = useState<MemberRole>("contractor");

  useEffect(() => {
    if (projectMode === "build_myself" && inviteViewerRegime === "client") {
      setInviteViewerRegime("build_myself");
    }
  }, [inviteViewerRegime, projectMode]);

  useEffect(() => {
    if (!inviteOpen) return;

    if (!inviteRoleOptions.includes(inviteRole)) {
      setInviteRole(inviteRoleOptions[0] ?? "contractor");
    }

    if (!inviteAiAccessOptions.includes(inviteAI)) {
      setInviteAI(inviteAiAccessOptions[0] ?? "none");
    }
  }, [
    inviteOpen,
    inviteRoleOptions,
    inviteRole,
    inviteAiAccessOptions,
    inviteAI,
  ]);

  const canInvite = perm.can("member.invite") && workspaceMode.kind !== "pending-supabase";
  const workspaceKey = workspaceMode.kind === "supabase" ? workspaceMode.profileId : workspaceMode.kind;
  const membersQueryKey = workspaceQueryKeys.projectMembers(workspaceKey, projectId);
  const invitesQueryKey = workspaceQueryKeys.projectInvites(workspaceKey, projectId);

  const roleTargetCurrentRole = useMemo(() => {
    if (!roleTarget) return null;
    if (roleTarget.kind === "member") {
      return members.find((m) => m.user_id === roleTarget.userId)?.role ?? null;
    }
    return invites.find((i) => i.id === roleTarget.inviteId)?.role ?? null;
  }, [roleTarget, members, invites]);

  const reassignRoleOptions: MemberRole[] = roleTargetCurrentRole
    ? getReassignRoleOptions(actorRole, roleTargetCurrentRole)
    : [];

  const memberEmailById = useMemo(
    () =>
      new Map(
        members.map((member) => [member.user_id, getUserById(member.user_id)?.email?.toLowerCase() ?? ""]),
      ),
    [members],
  );

  const pendingInviteEmailSet = useMemo(
    () => new Set(invites.filter((invite) => invite.status === "pending").map((invite) => invite.email.toLowerCase())),
    [invites],
  );

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const trimmedEmail = inviteEmail.trim().toLowerCase();
      return createWorkspaceProjectInvite(
        workspaceMode.kind === "pending-supabase" ? { kind: "local" } : workspaceMode,
        {
          projectId,
          email: trimmedEmail,
          role: inviteRole,
          aiAccess: inviteAI,
          viewerRegime: inviteRole === "viewer" ? inviteViewerRegime : null,
          creditLimit: parseInt(inviteLimit, 10) || 50,
          invitedBy: currentUser.id,
        },
      );
    },
    onMutate: async () => {
      if (workspaceMode.kind !== "supabase") return undefined;
      await queryClient.cancelQueries({ queryKey: invitesQueryKey });
      const previousInvites = queryClient.getQueryData<WorkspaceProjectInvite[]>(invitesQueryKey) ?? [];
      const optimisticInvite: WorkspaceProjectInvite = {
        id: `invite-optimistic-${Date.now()}`,
        project_id: projectId,
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        ai_access: inviteAI,
        viewer_regime: inviteRole === "viewer" ? inviteViewerRegime : null,
        credit_limit: parseInt(inviteLimit, 10) || 50,
        invited_by: currentUser.id,
        status: "pending",
        invite_token: `invite-token-optimistic-${Date.now()}`,
        accepted_profile_id: null,
        created_at: new Date().toISOString(),
        accepted_at: null,
      };
      queryClient.setQueryData<WorkspaceProjectInvite[]>(invitesQueryKey, [optimisticInvite, ...previousInvites]);
      return { previousInvites };
    },
    onSuccess: (createdInvite) => {
      if (workspaceMode.kind !== "supabase") {
        addEvent({
          id: `evt-invite-${Date.now()}`,
          project_id: projectId,
          actor_id: currentUser.id,
          type: "member_added",
          object_type: "member",
          object_id: createdInvite.id,
          timestamp: new Date().toISOString(),
          payload: { email: createdInvite.email, role: createdInvite.role, source: "invite" },
        });
      }

      toast({
        title: "Invitation sent",
        description: `${createdInvite.email} invited as ${roleLabels[createdInvite.role]}.`,
      });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteRole("contractor");
      setInviteViewerRegime(defaultViewerRegime);
      setInviteAI("consult_only");
      setInviteLimit("50");
    },
    onError: (error, _variables, context) => {
      if (workspaceMode.kind === "supabase" && context?.previousInvites) {
        queryClient.setQueryData(invitesQueryKey, context.previousInvites);
      }
      toast({
        title: "Invite failed",
        description: error instanceof Error ? error.message : "Unable to invite participant.",
        variant: "destructive",
      });
    },
    onSettled: async () => {
      if (workspaceMode.kind === "supabase") {
        await queryClient.invalidateQueries({ queryKey: invitesQueryKey });
      }
    },
  });

  const memberRoleMutation = useMutation({
    mutationFn: async (input: { userId: string; role: MemberRole }) => updateWorkspaceProjectMemberRole(
      workspaceMode.kind === "pending-supabase" ? { kind: "local" } : workspaceMode,
      {
        projectId,
        userId: input.userId,
        role: input.role,
        viewerRegime: resolveViewerRegime(input.role, projectMode),
      },
    ),
    onMutate: async (input) => {
      if (workspaceMode.kind !== "supabase") return undefined;
      await queryClient.cancelQueries({ queryKey: membersQueryKey });
      const previousMembers = queryClient.getQueryData<Member[]>(membersQueryKey) ?? [];
      queryClient.setQueryData<Member[]>(membersQueryKey, previousMembers.map((member) =>
        member.project_id === projectId && member.user_id === input.userId
          ? { ...member, role: input.role, viewer_regime: resolveViewerRegime(input.role, projectMode) }
          : member,
      ));
      return { previousMembers };
    },
    onSuccess: (member) => {
      toast({ title: "Role updated", description: `${getUserById(member.user_id)?.name ?? "Member"} is now ${roleLabels[member.role]}.` });
      setChangeRoleOpen(false);
      setRoleTarget(null);
    },
    onError: (error, _variables, context) => {
      if (workspaceMode.kind === "supabase" && context?.previousMembers) {
        queryClient.setQueryData(membersQueryKey, context.previousMembers);
      }
      toast({
        title: "Role update failed",
        description: error instanceof Error ? error.message : "Unable to update member role.",
        variant: "destructive",
      });
    },
    onSettled: async () => {
      if (workspaceMode.kind === "supabase") {
        await queryClient.invalidateQueries({ queryKey: membersQueryKey });
      }
    },
  });

  const inviteRoleMutation = useMutation({
    mutationFn: async (input: { inviteId: string; role: MemberRole }) => updateWorkspaceProjectInvite(
      workspaceMode.kind === "pending-supabase" ? { kind: "local" } : workspaceMode,
      {
        id: input.inviteId,
        projectId,
        role: input.role,
        viewerRegime: resolveViewerRegime(input.role, projectMode) ?? null,
      },
    ),
    onMutate: async (input) => {
      if (workspaceMode.kind !== "supabase") return undefined;
      await queryClient.cancelQueries({ queryKey: invitesQueryKey });
      const previousInvites = queryClient.getQueryData<WorkspaceProjectInvite[]>(invitesQueryKey) ?? [];
      queryClient.setQueryData<WorkspaceProjectInvite[]>(invitesQueryKey, previousInvites.map((invite) =>
        invite.id === input.inviteId
          ? {
              ...invite,
              role: input.role,
              viewer_regime: resolveViewerRegime(input.role, projectMode) ?? null,
            }
          : invite,
      ));
      return { previousInvites };
    },
    onSuccess: (invite) => {
      toast({ title: "Role updated", description: `${invite.email} is now ${roleLabels[invite.role]}.` });
      setChangeRoleOpen(false);
      setRoleTarget(null);
    },
    onError: (error, _variables, context) => {
      if (workspaceMode.kind === "supabase" && context?.previousInvites) {
        queryClient.setQueryData(invitesQueryKey, context.previousInvites);
      }
      toast({
        title: "Role update failed",
        description: error instanceof Error ? error.message : "Unable to update invite role.",
        variant: "destructive",
      });
    },
    onSettled: async () => {
      if (workspaceMode.kind === "supabase") {
        await queryClient.invalidateQueries({ queryKey: invitesQueryKey });
      }
    },
  });

  function handleInvite() {
    const trimmedEmail = inviteEmail.trim().toLowerCase();
    if (!trimmedEmail) return;
    if (pendingInviteEmailSet.has(trimmedEmail)) {
      toast({ title: "Already invited", description: "This email already has a pending invitation.", variant: "destructive" });
      return;
    }
    const existingMember = Array.from(memberEmailById.values()).some((email) => email === trimmedEmail);
    if (existingMember) {
      toast({ title: "Already added", description: "This user is already a project participant.", variant: "destructive" });
      return;
    }

    createInviteMutation.mutate();
  }

  function handleChangeRole() {
    if (!roleTarget) return;
    if (roleTarget.kind === "member") {
      memberRoleMutation.mutate({ userId: roleTarget.userId, role: newRole });
      return;
    }

    inviteRoleMutation.mutate({ inviteId: roleTarget.inviteId, role: newRole });
  }

  if (members.length === 0 && invites.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Participants"
        description="No members or invites yet. Invite someone to get started."
        actionLabel={canInvite ? "Invite Member" : undefined}
        onAction={canInvite ? () => setInviteOpen(true) : undefined}
      />
    );
  }

  return (
    <div className="space-y-sp-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-h3 text-foreground">Participants</h2>
          <p className="text-caption text-muted-foreground">
            {members.length} members · {invites.length} invitations
          </p>
        </div>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="mr-1 h-4 w-4" /> Invite
          </Button>
        )}
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-accent" />
          <h3 className="text-body font-semibold text-foreground">Members</h3>
        </div>
        <div className="glass overflow-hidden rounded-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>AI Access</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                {canInvite && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canInvite ? 5 : 4} className="text-center text-muted-foreground">
                    No members yet.
                  </TableCell>
                </TableRow>
              ) : members.map((member) => {
                const memberUser = getUserById(member.user_id);
                const RoleIcon = roleIcons[member.role];
                const isPrivileged = member.role === "owner" || member.role === "co_owner";
                const isSelf = member.user_id === currentUser.id;

                return (
                  <TableRow key={member.user_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-caption font-semibold text-accent">
                          {(memberUser?.name ?? "?").charAt(0)}
                        </div>
                        <div>
                          <p className="text-body-sm font-medium text-foreground">
                            {memberUser?.name ?? member.user_id}
                            {isSelf && <span className="ml-1 text-caption text-muted-foreground">(you)</span>}
                          </p>
                          <p className="text-caption text-muted-foreground">{memberUser?.email || "No email"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <RoleIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-body-sm">{roleLabels[member.role]}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-pill px-2 py-0.5 text-caption font-medium ${
                        member.ai_access === "project_pool"
                          ? "bg-accent/10 text-accent"
                          : member.ai_access === "consult_only"
                            ? "bg-info/10 text-info"
                            : "bg-muted text-muted-foreground"
                      }`}>
                        {aiLabels[member.ai_access]}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-body-sm">{member.used_credits}</span>
                      <span className="text-caption text-muted-foreground">/{member.credit_limit}</span>
                    </TableCell>
                    {canInvite && (
                      <TableCell>
                        {!isPrivileged && !isSelf && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="glass-elevated rounded-card">
                              <DropdownMenuItem
                                onClick={() => {
                                  setRoleTarget({ kind: "member", userId: member.user_id });
                                  const options = getReassignRoleOptions(actorRole, member.role);
                                  setNewRole(options.includes(member.role) ? member.role : (options[0] ?? "contractor"));
                                  setChangeRoleOpen(true);
                                }}
                              >
                                <Shield className="mr-2 h-3.5 w-3.5" /> Change role
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-accent" />
          <h3 className="text-body font-semibold text-foreground">Invitations</h3>
        </div>
        <div className="glass overflow-hidden rounded-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Invited by</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No invitations yet.
                  </TableCell>
                </TableRow>
              ) : invites.map((invite) => {
                const inviter = getUserById(invite.invited_by);
                const canEditInvite = canInvite && invite.status === "pending";
                return (
                  <TableRow key={invite.id}>
                    <TableCell className="text-body-sm text-foreground">{invite.email}</TableCell>
                    <TableCell className="text-body-sm text-muted-foreground">
                      {inviter?.name ?? inviter?.email ?? invite.invited_by}
                    </TableCell>
                    <TableCell className="text-body-sm text-foreground">{roleLabels[invite.role]}</TableCell>
                    <TableCell>
                      <span className={`rounded-pill px-2 py-0.5 text-caption font-medium ${inviteStatusClassName(invite.status)}`}>
                        {inviteStatusLabel(invite.status)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {canEditInvite ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="glass-elevated rounded-card">
                            <DropdownMenuItem
                              onClick={() => {
                                setRoleTarget({ kind: "invite", inviteId: invite.id });
                              const options = getReassignRoleOptions(actorRole, invite.role);
                              setNewRole(options.includes(invite.role) ? invite.role : (options[0] ?? "contractor"));
                                setChangeRoleOpen(true);
                              }}
                            >
                              <Shield className="mr-2 h-3.5 w-3.5" /> Change role
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <span className="text-caption text-muted-foreground">No actions</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <ConfirmModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite Member"
        description="Send a project invitation with role, AI access, and credit limits."
        confirmLabel={createInviteMutation.isPending ? "Sending..." : "Send Invite"}
        onConfirm={handleInvite}
        onCancel={() => setInviteOpen(false)}
      >
        <div className="space-y-3 py-2">
          <div>
            <label className="text-caption font-medium text-foreground">Email</label>
            <Input
              placeholder="member@example.com"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-caption font-medium text-foreground">Role</label>
            <Select
              value={inviteRole}
              onValueChange={(value) => {
                const nextRole = value as MemberRole;
                setInviteRole(nextRole);
                if (nextRole === "viewer" && projectMode === "build_myself") {
                  setInviteViewerRegime("build_myself");
                }
              }}
            >
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {inviteRoleOptions.map((role) => (
                  <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {inviteRole === "viewer" && (
            <div>
              <label className="text-caption font-medium text-foreground">Regime</label>
              <Select
                value={inviteViewerRegime}
                onValueChange={(value) => setInviteViewerRegime(value as ViewerRegime)}
              >
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableViewerRegimes.map((regime) => (
                    <SelectItem key={regime} value={regime}>
                      {regime.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-caption font-medium text-foreground">AI Access</label>
            <Select value={inviteAI} onValueChange={(value) => setInviteAI(value as AIAccess)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {inviteAiAccessOptions.map((aiAccess) => (
                  <SelectItem key={aiAccess} value={aiAccess}>{aiLabels[aiAccess]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-caption font-medium text-foreground">Credit Limit</label>
            <Input
              type="number"
              value={inviteLimit}
              onChange={(event) => setInviteLimit(event.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={changeRoleOpen}
        onOpenChange={setChangeRoleOpen}
        title="Change Role"
        description="Update the role for this member or pending invitation."
        confirmLabel={memberRoleMutation.isPending || inviteRoleMutation.isPending ? "Updating..." : "Update"}
        onConfirm={handleChangeRole}
        onCancel={() => setChangeRoleOpen(false)}
      >
        <div className="py-2">
          <Select value={newRole} onValueChange={(value) => setNewRole(value as MemberRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(reassignRoleOptions.length > 0 ? reassignRoleOptions : (["contractor"] as MemberRole[])).map((role) => (
                <SelectItem key={role} value={role}>{roleLabels[role]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </ConfirmModal>
    </div>
  );
}
