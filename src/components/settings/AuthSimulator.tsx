import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { MemberRole } from "@/types/entities";
import { setAuthRole, getAuthRole } from "@/lib/auth-state";
import { useProjects } from "@/hooks/use-mock-data";
import type { Regime } from "@/types/estimate-v2";
import { getEstimateV2ProjectState, isDemoProject, setRegimeDev } from "@/data/estimate-v2-store";

export function AuthSimulator() {
  const projects = useProjects();
  const [role, setRole] = useState<string>(getAuthRole());
  const demoProjects = useMemo(
    () => projects.filter((project) => isDemoProject(project.id)),
    [projects],
  );
  const [regimeProjectId, setRegimeProjectId] = useState<string>("project-1");
  const [regime, setRegime] = useState<Regime>("contractor");

  useEffect(() => {
    if (demoProjects.length === 0) return;
    if (demoProjects.some((project) => project.id === regimeProjectId)) return;
    setRegimeProjectId(demoProjects[0]!.id);
  }, [demoProjects, regimeProjectId]);

  useEffect(() => {
    if (!regimeProjectId) return;
    const current = getEstimateV2ProjectState(regimeProjectId).project.regime;
    setRegime(current);
  }, [regimeProjectId]);

  const handleApply = () => {
    setAuthRole(role as MemberRole | "guest");
    toast({ title: "Role switched", description: `Now simulating: ${role}` });
    // Force page reload to propagate changes
    window.location.reload();
  };

  const handleApplyRegime = () => {
    if (!regimeProjectId) return;
    const ok = setRegimeDev(regimeProjectId, regime);
    if (!ok) {
      toast({ title: "Unable to switch regime", description: "Allowed only in DEV for demo projects.", variant: "destructive" });
      return;
    }
    const projectTitle = demoProjects.find((project) => project.id === regimeProjectId)?.title ?? regimeProjectId;
    toast({ title: "Regime switched", description: `${projectTitle}: ${regime.replace("_", " ")}` });
  };

  return (
    <div className="glass rounded-card p-sp-3 space-y-sp-2">
      <div>
        <h3 className="text-body font-semibold text-foreground">🛠 Auth Simulator</h3>
        <p className="text-caption text-muted-foreground">Dev-only: switch between user roles to test RBAC behavior.</p>
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
      <Button onClick={handleApply} className="bg-accent text-accent-foreground hover:bg-accent/90">
        Apply Role
      </Button>

      <div className="pt-2 border-t border-border space-y-1.5">
        <h4 className="text-body-sm font-medium text-foreground">Estimate Regime Simulator</h4>
        <p className="text-caption text-muted-foreground">Dev-only: switch regime for seeded demo projects regardless of role.</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-body-sm font-medium text-foreground">Demo project</label>
        <Select value={regimeProjectId} onValueChange={setRegimeProjectId}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {demoProjects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-body-sm font-medium text-foreground">Estimate regime</label>
        <Select value={regime} onValueChange={(value) => setRegime(value as Regime)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contractor">Contractor</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="build_myself">Build myself</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        onClick={handleApplyRegime}
        variant="outline"
        disabled={!regimeProjectId}
      >
        Apply Regime
      </Button>
    </div>
  );
}
