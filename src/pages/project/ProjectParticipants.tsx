import { useState } from "react";
import { useParams } from "react-router-dom";
import { Users, Plus, MoreVertical, Shield, Eye, Wrench, Crown } from "lucide-react";
import { useProject, useCurrentUser } from "@/hooks/use-mock-data";
import { usePermission } from "@/lib/permissions";
import { addMember, addEvent, getCurrentUser, getUserById } from "@/data/store";
import { allUsers } from "@/data/seed";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmModal } from "@/components/ConfirmModal";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import type { MemberRole, AIAccess } from "@/types/entities";

const roleIcons: Record<MemberRole, typeof Crown> = {
  owner: Crown,
  "co-owner": Shield,
  contractor: Wrench,
  participant: Eye,
};

const roleLabels: Record<MemberRole, string> = {
  owner: "Owner",
  "co-owner": "Co-owner",
  contractor: "Contractor",
  participant: "Viewer",
};

const aiLabels: Record<AIAccess, string> = {
  none: "No AI",
  consult_only: "Consult only",
  project_pool: "Project pool",
};

export default function ProjectParticipants() {
  const { id } = useParams<{ id: string }>();
  const { members } = useProject(id!);
  const perm = usePermission(id!);
  const currentUser = useCurrentUser();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("contractor");
  const [inviteAI, setInviteAI] = useState<AIAccess>("consult_only");
  const [inviteLimit, setInviteLimit] = useState("50");

  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<MemberRole>("contractor");

  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null);

  const canInvite = perm.can("member.invite");

  function handleInvite() {
    if (!inviteEmail.trim()) return;

    // Find or simulate user
    const existingUser = allUsers.find((u) => u.email === inviteEmail.trim());
    const userId = existingUser?.id ?? `user-invite-${Date.now()}`;

    addMember({
      project_id: id!,
      user_id: userId,
      role: inviteRole,
      ai_access: inviteAI,
      credit_limit: parseInt(inviteLimit) || 50,
      used_credits: 0,
    });

    addEvent({
      id: `evt-invite-${Date.now()}`,
      project_id: id!,
      actor_id: currentUser.id,
      type: "member_added",
      object_type: "member",
      object_id: userId,
      timestamp: new Date().toISOString(),
      payload: { name: existingUser?.name ?? inviteEmail, role: inviteRole },
    });

    toast({ title: "Member invited", description: `${existingUser?.name ?? inviteEmail} added as ${roleLabels[inviteRole]}.` });
    setInviteOpen(false);
    setInviteEmail("");
  }

  function handleChangeRole() {
    if (!selectedMemberId) return;
    // In real app, update member role in store. For now, toast.
    toast({ title: "Role updated", description: `Member role changed to ${roleLabels[newRole]}.` });
    setChangeRoleOpen(false);
  }

  function handleRemove() {
    if (!removeMemberId) return;
    // In real app, remove from store
    toast({ title: "Member removed", description: "Member has been removed from the project." });
    setRemoveOpen(false);
  }

  if (members.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Participants"
        description="No team members yet. Invite someone to get started."
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
          <p className="text-caption text-muted-foreground">{members.length} members</p>
        </div>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="h-4 w-4 mr-1" /> Invite
          </Button>
        )}
      </div>

      <div className="glass rounded-card overflow-hidden">
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
            {members.map((member) => {
              const memberUser = getUserById(member.user_id);
              const RoleIcon = roleIcons[member.role];
              const isPrivileged = member.role === "owner" || member.role === "co-owner";
              const isSelf = member.user_id === currentUser.id;

              return (
                <TableRow key={member.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-accent/10 flex items-center justify-center text-caption font-semibold text-accent">
                        {(memberUser?.name ?? "?").charAt(0)}
                      </div>
                      <div>
                        <p className="text-body-sm font-medium text-foreground">
                          {memberUser?.name ?? member.user_id}
                          {isSelf && <span className="text-caption text-muted-foreground ml-1">(you)</span>}
                        </p>
                        <p className="text-caption text-muted-foreground">{memberUser?.email}</p>
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
                    <span className={`text-caption font-medium px-2 py-0.5 rounded-pill ${
                      member.ai_access === "project_pool" ? "bg-accent/10 text-accent"
                        : member.ai_access === "consult_only" ? "bg-info/10 text-info"
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
                            <DropdownMenuItem onClick={() => {
                              setSelectedMemberId(member.user_id);
                              setNewRole(member.role);
                              setChangeRoleOpen(true);
                            }}>
                              <Shield className="h-3.5 w-3.5 mr-2" /> Change role
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setRemoveMemberId(member.user_id);
                                setRemoveOpen(true);
                              }}
                            >
                              Remove
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

      {/* Invite Modal */}
      <ConfirmModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Invite Member"
        description="Add a new team member to this project."
        confirmLabel="Send Invite"
        onConfirm={handleInvite}
        onCancel={() => setInviteOpen(false)}
      >
        <div className="space-y-3 py-2">
          <div>
            <label className="text-caption font-medium text-foreground">Email</label>
            <Input
              placeholder="member@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-caption font-medium text-foreground">Role</label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as MemberRole)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="co-owner">Co-owner</SelectItem>
                <SelectItem value="contractor">Contractor</SelectItem>
                <SelectItem value="participant">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-caption font-medium text-foreground">AI Access</label>
            <Select value={inviteAI} onValueChange={(v) => setInviteAI(v as AIAccess)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No AI</SelectItem>
                <SelectItem value="consult_only">Consult only</SelectItem>
                <SelectItem value="project_pool">Project pool</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-caption font-medium text-foreground">Credit Limit</label>
            <Input
              type="number"
              value={inviteLimit}
              onChange={(e) => setInviteLimit(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      </ConfirmModal>

      {/* Change Role Modal */}
      <ConfirmModal
        open={changeRoleOpen}
        onOpenChange={setChangeRoleOpen}
        title="Change Role"
        description="Update the member's role and permissions."
        confirmLabel="Update"
        onConfirm={handleChangeRole}
        onCancel={() => setChangeRoleOpen(false)}
      >
        <div className="py-2">
          <Select value={newRole} onValueChange={(v) => setNewRole(v as MemberRole)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="co-owner">Co-owner</SelectItem>
              <SelectItem value="contractor">Contractor</SelectItem>
              <SelectItem value="participant">Viewer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </ConfirmModal>

      {/* Remove Member Modal */}
      <ConfirmModal
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title="Remove Member"
        description="This will remove the member from the project. Their assigned tasks will need to be reassigned."
        confirmLabel="Remove"
        onConfirm={handleRemove}
        onCancel={() => setRemoveOpen(false)}
      />
    </div>
  );
}
