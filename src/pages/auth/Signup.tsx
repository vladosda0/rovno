import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Signup() {
  return (
    <div className="space-y-sp-3">
      <div className="text-center">
        <h2 className="text-h3 text-foreground">Create account</h2>
        <p className="text-body-sm text-muted-foreground mt-1">Get started with StroyAgent</p>
      </div>
      <div className="space-y-sp-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full Name</Label>
          <Input id="name" placeholder="Ivan Petrov" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="you@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" placeholder="••••••••" />
        </div>
      </div>
      <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">Create Account</Button>
      <p className="text-center text-body-sm text-muted-foreground">
        Already have an account? <Link to="/auth/login" className="text-accent hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
