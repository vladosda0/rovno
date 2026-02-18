import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { MemberRole } from "@/types/entities";
import { setAuthRole, getAuthRole } from "@/lib/auth-state";

export function AuthSimulator() {
  const [role, setRole] = useState<string>(getAuthRole());

  const handleApply = () => {
    setAuthRole(role as MemberRole | "guest");
    toast({ title: "Role switched", description: `Now simulating: ${role}` });
    // Force page reload to propagate changes
    window.location.reload();
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
            <SelectItem value="contractor">Contractor — limited AI</SelectItem>
            <SelectItem value="participant">Participant — read-only</SelectItem>
            <SelectItem value="guest">Guest — no auth</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={handleApply} className="bg-accent text-accent-foreground hover:bg-accent/90">
        Apply Role
      </Button>
    </div>
  );
}
