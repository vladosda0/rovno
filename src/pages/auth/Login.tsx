import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { toast } from "@/hooks/use-toast";
import { setAuthRole, isOnboarded } from "@/lib/auth-state";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({ title: "Validation error", description: "Email and password are required.", variant: "destructive" });
      return;
    }
    setLoading(true);
    // Simulate login
    setTimeout(() => {
      setAuthRole("owner");
      toast({ title: "Welcome back!", description: "Signed in successfully." });
      navigate(isOnboarded() ? "/home" : "/onboarding");
    }, 500);
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
