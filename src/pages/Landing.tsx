import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Bot, HardHat, BarChart3, FileText } from "lucide-react";
import { HeroBlock } from "@/components/landing/HeroBlock";
import { FeatureGrid } from "@/components/landing/FeatureGrid";
import { PricingTeaser } from "@/components/landing/PricingTeaser";

const features = [
  { icon: Bot, title: "AI Assistant", text: "Intelligent project companion that understands construction context and proposes real changes." },
  { icon: HardHat, title: "Full Project Control", text: "Tasks, estimates, procurement, docs — all in one place with stage-based workflow." },
  { icon: BarChart3, title: "Real-time Insights", text: "Dashboards and analytics for every project phase, updated as work progresses." },
  { icon: FileText, title: "Smart Documents", text: "AI-generated contracts, specs, and reports with version tracking and approval flows." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between px-sp-4 py-sp-2">
        <span className="text-h3 font-bold text-foreground">СтройАгент</span>
        <div className="flex items-center gap-sp-1 flex-wrap">
          <Button variant="ghost" asChild><Link to="/pricing">Pricing</Link></Button>
          <Button variant="ghost" asChild><Link to="/demo">Demo</Link></Button>
          <Button variant="outline" asChild><Link to="/auth/login">Login</Link></Button>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/auth/signup">Get Started</Link>
          </Button>
        </div>
      </header>

      <main className="px-sp-4 py-sp-4 space-y-sp-6">
        <HeroBlock
          headline="AI-First Construction Management"
          subtext="StroyAgent is your AI assistant engineer — managing projects, estimates, procurement, and documentation so you can focus on building."
          primaryLabel="Start Free"
          primaryTo="/auth/signup"
          secondaryLabel="Try Demo"
          secondaryTo="/demo"
        />

        <FeatureGrid features={features} />

        <PricingTeaser />
      </main>

      {/* Footer */}
      <footer className="px-sp-4 py-sp-3 text-center text-caption text-muted-foreground border-t border-border mt-sp-6">
        © 2025 СтройАгент. All rights reserved.
      </footer>
    </div>
  );
}
