import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { toast } from "@/hooks/use-toast";
import {
  clearDemoSession,
  isOnboarded,
  setSimulatedAuthRole,
  setStoredLocalAuthProfile,
} from "@/lib/auth-state";
import { hasSupabaseWorkspaceConfig, isSupabaseWorkspaceRequested } from "@/data/workspace-source";

export default function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const supabaseRuntimeEnabled = isSupabaseWorkspaceRequested() && hasSupabaseWorkspaceConfig();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Validation error", description: "Email and password are required.", variant: "destructive" });
      return;
    }

    const trimmedEmail = email.trim();
    setLoading(true);
    clearDemoSession();

    try {
      if (supabaseRuntimeEnabled) {
        const { supabase } = await import("@/integrations/supabase/client");
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) {
          throw error;
        }

        queryClient.removeQueries({ queryKey: ["workspace"] });
        toast({ title: "Welcome back!", description: "Signed in successfully." });
        navigate(isOnboarded() ? "/home" : "/onboarding");
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500));
      setStoredLocalAuthProfile({
        email: trimmedEmail,
        name: trimmedEmail.split("@")[0]?.replace(/[._-]+/g, " ").trim() || "Workspace User",
      });
      setSimulatedAuthRole("owner");
      toast({ title: "Welcome back!", description: "Signed in successfully." });
      navigate(isOnboarded() ? "/home" : "/onboarding");
    } catch (error) {
      toast({
        title: "Unable to sign in",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your account"
      footer={
        <div className="flex items-center justify-between text-body-sm">
          <Link to="/auth/forgot" className="text-accent hover:underline">Forgot password?</Link>
          <Link to="/auth/signup" className="text-accent hover:underline">Create account</Link>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-sp-2">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>
    </AuthCard>
  );
}
