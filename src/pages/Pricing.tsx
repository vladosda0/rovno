import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { PricingTeaser } from "@/components/landing/PricingTeaser";

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-sp-4 py-sp-2">
        <Link to="/" className="text-h3 font-bold text-foreground">СтройАгент</Link>
        <div className="flex items-center gap-sp-1">
          <Button variant="outline" asChild><Link to="/auth/login">Login</Link></Button>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/auth/signup">Get Started</Link>
          </Button>
        </div>
      </header>
      <main className="px-sp-4 py-sp-4">
        <PricingTeaser />
      </main>
    </div>
  );
}
