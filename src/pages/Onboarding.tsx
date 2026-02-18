import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Rocket } from "lucide-react";

export default function Onboarding() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-sp-2">
      <div className="w-full max-w-lg glass-elevated rounded-modal p-sp-4 text-center">
        <Rocket className="mx-auto mb-sp-2 h-10 w-10 text-accent" />
        <h1 className="text-h2 text-foreground mb-sp-1">Welcome to СтройАгент</h1>
        <p className="text-body text-muted-foreground mb-sp-4">
          Let's set up your workspace. Choose your automation preferences and we'll configure everything for you.
        </p>
        <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to="/home">Get Started</Link>
        </Button>
      </div>
    </div>
  );
}
