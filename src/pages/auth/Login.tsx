import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { clearDemoSession, isOnboarded, setAuthRole } from "@/lib/auth-state";
import { clearAiSidebarSessionPreference } from "@/lib/ai-sidebar-session";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const nextUrl = searchParams.get("next");
  const postAuthDestination = nextUrl && nextUrl.startsWith("/") ? nextUrl : (isOnboarded() ? "/home" : "/onboarding");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Validation error", description: "Email and password are required.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        throw error;
      }

      if (!data.session?.user) {
        throw new Error("Unable to start an authenticated session.");
      }

      clearDemoSession();
      clearAiSidebarSessionPreference();
      setAuthRole("owner");
      toast({ title: "Welcome back!", description: "Signed in successfully." });
      navigate(postAuthDestination);
    } catch (error) {
      toast({
        title: "Sign in failed",
        description: error instanceof Error ? error.message : "Unable to sign in.",
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
