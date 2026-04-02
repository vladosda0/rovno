import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { AIAccess, FinanceVisibility, MemberRole } from "@/types/entities";
import type { AuthRole } from "@/lib/auth-state";
import { getAuthRole, setAuthRole } from "@/lib/auth-state";
import { addMember, updateMember } from "@/data/store";
import type { BrowserWorkspaceKind } from "@/data/store";
import { useCurrentUser, useProjects, useWorkspaceMode } from "@/hooks/use-mock-data";
import { useLocation, useMatch } from "react-router-dom";
import { getDefaultFinanceVisibility } from "@/lib/participant-role-policy";

export function AuthSimulator() {
  const projects = useProjects();
  const location = useLocation();
  const projectMatch = useMatch("/project/:id/*");
  const routeProjectId = projectMatch?.params.id as string | undefined;
  const isInsideProject = Boolean(routeProjectId);
  const canSelectProject = location.pathname === "/home" || location.pathname.startsWith("/home/") || location.pathname.startsWith("/settings");

  const workspaceMode = useWorkspaceMode();
  const currentUser = useCurrentUser();

  const [role, setRole] = useState<AuthRole>(getAuthRole());
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const effectiveProjectId = routeProjectId ?? selectedProjectId;
  const scopedProject = useMemo(
    () => (effectiveProjectId ? projects.find((p) => p.id === effectiveProjectId) : null),
    [projects, effectiveProjectId],
  );

  const canMutateWorkspaceMembership = workspaceMode.kind === "demo" || workspaceMode.kind === "local";

  const applyDisabled =
    !effectiveProjectId ||
    !canSelectProject && !isInsideProject ||
    !canMutateWorkspaceMembership;

  const mapRoleToMembership = (selectedRole: AuthRole): {
    memberRole: MemberRole;
    aiAccess: AIAccess;
    financeVisibility: FinanceVisibility;
    creditLimit: number;
    usedCredits: number;
  } => {
    switch (selectedRole) {
      case "owner":
        return { memberRole: "owner", aiAccess: "project_pool", financeVisibility: getDefaultFinanceVisibility("owner"), creditLimit: 500, usedCredits: 0 };
      case "co_owner":
        return { memberRole: "co_owner", aiAccess: "project_pool", financeVisibility: getDefaultFinanceVisibility("co_owner"), creditLimit: 500, usedCredits: 0 };
      case "contractor":
        return { memberRole: "contractor", aiAccess: "consult_only", financeVisibility: getDefaultFinanceVisibility("contractor"), creditLimit: 100, usedCredits: 0 };
      case "viewer":
        return { memberRole: "viewer", aiAccess: "none", financeVisibility: getDefaultFinanceVisibility("viewer"), creditLimit: 0, usedCredits: 0 };
      case "guest":
        // Guest has no auth, but membership is updated to viewer+no-AI so project permission matrix stays strict.
        return { memberRole: "viewer", aiAccess: "none", financeVisibility: getDefaultFinanceVisibility("viewer"), creditLimit: 0, usedCredits: 0 };
      default:
        return { memberRole: "viewer", aiAccess: "none", financeVisibility: getDefaultFinanceVisibility("viewer"), creditLimit: 0, usedCredits: 0 };
    }
  };

  const handleApply = () => {
    if (!effectiveProjectId) return;

    if (!canMutateWorkspaceMembership) {
      toast({
        title: "Project simulation unavailable",
        description: "Role simulation is editable only in local/demo workspace modes.",
        variant: "destructive",
      });
      return;
    }

    if (!currentUser.id) {
      toast({ title: "No current user", description: "Unable to simulate membership without a user id.", variant: "destructive" });
      return;
    }

    const membership = mapRoleToMembership(role);

    const mutationMode = workspaceMode.kind as BrowserWorkspaceKind;
    const updated = updateMember(
      effectiveProjectId,
      currentUser.id,
      { role: membership.memberRole, ai_access: membership.aiAccess, finance_visibility: membership.financeVisibility },
      mutationMode,
    );

    if (!updated) {
      addMember({
        project_id: effectiveProjectId,
        user_id: currentUser.id,
        role: membership.memberRole,
        ai_access: membership.aiAccess,
        finance_visibility: membership.financeVisibility,
        credit_limit: membership.creditLimit,
        used_credits: membership.usedCredits,
      });
    }

    setAuthRole(role);
    toast({
      title: "Project role switched",
      description: `${scopedProject?.title ?? effectiveProjectId}: ${role}`,
    });
    window.location.reload();
  };

  return (
    <div className="rounded-card border border-border/60 bg-background p-sp-2 space-y-sp-2">
      <div className="space-y-0.5">
        <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">Role simulation</p>
        <h3 className="text-body-sm font-medium text-foreground">Auth Simulator</h3>
        <p className="text-caption text-muted-foreground/80">Dev-only: simulate membership role scoped to a project.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-body-sm font-medium text-foreground">Project scope</label>
        <Select
          value={effectiveProjectId ?? ""}
          disabled={isInsideProject || !canSelectProject || projects.length === 0}
          onValueChange={(v) => setSelectedProjectId(v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={isInsideProject ? "Project" : "Select project"} />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!canMutateWorkspaceMembership && (
          <p className="text-caption text-destructive/90">
            Simulation works only in local/demo workspace modes.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-body-sm font-medium text-foreground">Simulated role</label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owner">Owner — full access</SelectItem>
            <SelectItem value="co_owner">Co-owner — owner-level project access</SelectItem>
            <SelectItem value="contractor">Contractor — limited AI</SelectItem>
            <SelectItem value="viewer">Viewer — read-only</SelectItem>
            <SelectItem value="guest">Guest — no auth</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handleApply} disabled={applyDisabled} variant="outline" className="w-full sm:w-auto">
        Apply Role
      </Button>
    </div>
  );
}
