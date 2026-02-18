import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthCard } from "@/components/auth/AuthCard";
import { toast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast({ title: "Validation error", description: "Email is required.", variant: "destructive" });
      return;
    }
    setSent(true);
    toast({ title: "Reset link sent", description: "Check your email for a password reset link." });
  };

  return (
    <AuthCard
      title="Reset password"
      subtitle="We'll send you a reset link"
      footer={
        <p className="text-center text-body-sm">
          <Link to="/auth/login" className="text-accent hover:underline">Back to login</Link>
        </p>
      }
    >
      {sent ? (
        <div className="text-center py-sp-2">
          <p className="text-body-sm text-foreground">Reset link sent to <strong>{email}</strong></p>
          <p className="text-caption text-muted-foreground mt-1">Check your inbox and follow the instructions.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-sp-2">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            Send Reset Link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
