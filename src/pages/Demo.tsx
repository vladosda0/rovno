import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCurrentUser, useProjects } from "@/hooks/use-mock-data";
import { isAuthenticated } from "@/lib/auth-state";

function getStatusText(progress: number): string {
  if (progress >= 100) return "Done";
  if (progress > 0) return "In progress";
  return "Draft";
}

function getStatusColor(progress: number): string {
  if (progress >= 100) return "bg-success/15 text-success";
  if (progress > 0) return "bg-info/15 text-info";
  return "bg-muted text-muted-foreground";
}

export default function Demo() {
  const projects = useProjects();
  const currentUser = useCurrentUser();
  const demoProjects = projects.filter((p) => p.owner_id === currentUser.id);
  const isGuest = !isAuthenticated();

  return (
    <div className="relative">
      {/* Read-only project shell info */}
      <div className="p-sp-3 space-y-sp-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-h2 text-foreground">Demo Projects</h1>
            <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-caption font-medium text-accent">Demo</span>
          </div>
          <p className="text-body-sm text-muted-foreground mt-1">
            Open real mock projects from this demo account and continue in the normal project flow.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sp-2">
          {demoProjects.map((p) => (
            <Link
              key={p.id}
              to={`/project/${p.id}/dashboard`}
              className="glass rounded-card p-sp-3 hover:scale-[1.01] transition-transform duration-150 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-body font-semibold text-foreground truncate">{p.title}</h3>
                <span className="rounded-pill bg-accent/15 px-2 py-0.5 text-caption font-medium text-accent shrink-0">Demo</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-caption text-muted-foreground">Type: {p.type}</span>
                <span className={`text-caption font-medium px-2 py-0.5 rounded-pill ${getStatusColor(p.progress_pct)}`}>
                  {getStatusText(p.progress_pct)}
                </span>
              </div>
              <Progress value={p.progress_pct} className="h-1.5" />
              <p className="text-caption text-muted-foreground">{p.progress_pct}% complete</p>
            </Link>
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
              onClick={() => window.location.assign("/auth/login")}
            >
              Log in
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
