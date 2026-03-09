import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { toast } from "@/hooks/use-toast";
import { clearDemoSession, setSimulatedAuthRole, setStoredLocalAuthProfile } from "@/lib/auth-state";
import { hasSupabaseWorkspaceConfig, isSupabaseWorkspaceRequested } from "@/data/workspace-source";

export default function Signup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const supabaseRuntimeEnabled = isSupabaseWorkspaceRequested() && hasSupabaseWorkspaceConfig();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast({ title: "Validation error", description: "All fields are required.", variant: "destructive" });
      return;
    }
    if (password.length < 6) {
      toast({ title: "Validation error", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    setLoading(true);
    clearDemoSession();

    try {
      if (supabaseRuntimeEnabled) {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: trimmedName,
            },
          },
        });

        if (error) {
          throw error;
        }

        queryClient.removeQueries({ queryKey: ["workspace"] });
        if (data.session) {
          toast({ title: "Account created!", description: "Welcome to СтройАгент." });
          navigate("/onboarding");
          return;
        }

        toast({
          title: "Check your email",
          description: "Confirm your account to continue, then sign in.",
        });
        navigate("/auth/login");
        return;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 500));
      setStoredLocalAuthProfile({
        email: trimmedEmail,
        name: trimmedName,
      });
      setSimulatedAuthRole("owner");
      toast({ title: "Account created!", description: "Welcome to СтройАгент." });
      navigate("/onboarding");
    } catch (error) {
      toast({
        title: "Unable to create account",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create account"
      subtitle="Get started with StroyAgent"
      footer={
        <p className="text-center text-body-sm text-muted-foreground">
          Already have an account? <Link to="/auth/login" className="text-accent hover:underline">Sign in</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-sp-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" placeholder="Ivan Petrov" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={loading} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
          {loading ? "Creating..." : "Create Account"}
        </Button>
      </form>
    </AuthCard>
  );
}
