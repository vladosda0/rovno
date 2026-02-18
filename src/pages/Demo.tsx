import { useNavigate } from "react-router-dom";
import { Lock, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAuthenticated } from "@/lib/auth-state";

export default function Demo() {
  const navigate = useNavigate();
  const isGuest = !isAuthenticated();

  return (
    <div className="relative">
      {/* Read-only project shell info */}
      <div className="p-sp-3 space-y-sp-3">
        <div>
          <h1 className="text-h2 text-foreground">Demo Project — Apartment Renovation</h1>
          <p className="text-body-sm text-muted-foreground mt-1">
            Explore a read-only sample project to see how StroyAgent manages construction workflows.
          </p>
        </div>

        {/* Mini cards showing project structure */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-sp-2">
          {[
            { label: "Tasks", value: "6 tasks", sub: "2 done, 1 in progress" },
            { label: "Estimate", value: "165,500 ₽", sub: "Version 1 — Approved" },
            { label: "Procurement", value: "4 items", sub: "1 purchased" },
            { label: "Documents", value: "2 docs", sub: "1 active, 1 draft" },
          ].map((card) => (
            <div key={card.label} className="glass rounded-card p-sp-2">
              <span className="text-caption text-muted-foreground">{card.label}</span>
              <p className="text-body font-semibold text-foreground">{card.value}</p>
              <p className="text-caption text-muted-foreground">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Stages preview */}
        <div className="glass rounded-card p-sp-3 space-y-sp-2">
          <h3 className="text-body font-semibold text-foreground">Project Stages</h3>
          <div className="flex gap-sp-2 flex-wrap">
            {["Demolition ✓", "Electrical & Plumbing ●", "Finishing"].map((s) => (
              <span key={s} className="rounded-pill px-3 py-1 text-body-sm bg-muted text-muted-foreground">{s}</span>
            ))}
          </div>
        </div>

        {/* Sample tasks list */}
        <div className="glass rounded-card p-sp-3 space-y-sp-1">
          <h3 className="text-body font-semibold text-foreground">Recent Tasks</h3>
          {[
            { title: "Electrical rough-in", status: "In progress", color: "text-info" },
            { title: "Plumbing rough-in", status: "Not started", color: "text-muted-foreground" },
            { title: "Remove old flooring", status: "Done", color: "text-success" },
          ].map((t) => (
            <div key={t.title} className="flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/30">
              <span className="text-body-sm text-foreground">{t.title}</span>
              <span className={`text-caption font-medium ${t.color}`}>{t.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI blocked overlay for guests */}
      {isGuest && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="glass-elevated rounded-card p-sp-3 flex items-center gap-sp-2 max-w-sm shadow-lg">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
              <Lock className="h-5 w-5 text-accent" />
            </div>
            <div className="flex-1">
              <p className="text-body-sm font-semibold text-foreground">AI Assistant is locked</p>
              <p className="text-caption text-muted-foreground">Log in to use AI features and manage projects.</p>
            </div>
            <Button
              size="sm"
              className="bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
              onClick={() => navigate("/auth/login")}
            >
              Log in
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
