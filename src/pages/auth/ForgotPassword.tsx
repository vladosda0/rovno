import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPassword() {
  return (
    <div className="space-y-sp-3">
      <div className="text-center">
        <h2 className="text-h3 text-foreground">Reset password</h2>
        <p className="text-body-sm text-muted-foreground mt-1">We'll send you a reset link</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="you@example.com" />
      </div>
      <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Send Reset Link</Button>
      <p className="text-center text-body-sm">
        <Link to="/auth/login" className="text-accent hover:underline">Back to login</Link>
      </p>
    </div>
  );
}
