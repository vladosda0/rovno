import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bot, HardHat, BarChart3 } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="flex items-center justify-between px-sp-4 py-sp-2">
        <span className="text-h3 font-bold text-foreground">СтройАгент</span>
        <div className="flex items-center gap-sp-1">
          <Button variant="ghost" asChild><Link to="/pricing">Pricing</Link></Button>
          <Button variant="ghost" asChild><Link to="/demo">Demo</Link></Button>
          <Button variant="outline" asChild><Link to="/auth/login">Login</Link></Button>
          <Button asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/auth/signup">Get Started</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-4xl px-sp-4 py-sp-6 text-center">
        <h1 className="text-h1 text-foreground mb-sp-2">
          AI-First Construction Management
        </h1>
        <p className="text-body text-muted-foreground mb-sp-4 max-w-2xl mx-auto">
          StroyAgent is your AI assistant engineer — managing projects, estimates, procurement, and documentation so you can focus on building.
        </p>
        <div className="flex items-center justify-center gap-sp-2">
          <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Link to="/auth/signup">Start Free <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/demo">Try Demo</Link>
          </Button>
        </div>

        {/* Feature cards */}
        <div className="mt-sp-6 grid grid-cols-1 md:grid-cols-3 gap-sp-3">
          {[
            { icon: Bot, title: "AI Assistant", desc: "Intelligent project companion that understands construction." },
            { icon: HardHat, title: "Full Project Control", desc: "Tasks, estimates, procurement, docs — all in one place." },
            { icon: BarChart3, title: "Real-time Insights", desc: "Dashboards and analytics for every project phase." },
          ].map((f) => (
            <div key={f.title} className="glass rounded-card p-sp-3 text-left">
              <f.icon className="h-6 w-6 text-accent mb-sp-1" />
              <h3 className="text-body font-semibold text-foreground mb-1">{f.title}</h3>
              <p className="text-body-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
