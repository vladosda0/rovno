import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useProjects } from "@/hooks/use-mock-data";
import { Progress } from "@/components/ui/progress";

const statusLabel: Record<string, string> = {
  "100": "Done",
};

function getStatusText(progress: number): string {
  if (progress >= 100) return "Done";
  if (progress > 0) return "In progress";
  return "Draft";
}

function getStatusStyle(progress: number): string {
  if (progress >= 100) return "text-success";
  if (progress > 0) return "text-info";
  return "text-muted-foreground";
}

export default function Home() {
  const projects = useProjects();

  return (
    <div className="p-sp-3">
      <div className="flex items-center justify-between mb-sp-3">
        <h1 className="text-h2 text-foreground">Projects</h1>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sp-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            to={`/project/${p.id}/dashboard`}
            className="glass rounded-card p-sp-3 hover:scale-[1.01] transition-transform duration-150"
          >
            <div className="flex items-start justify-between mb-2">
              <h3 className="text-body font-semibold text-foreground">{p.title}</h3>
              <span className={`text-caption font-medium ${getStatusStyle(p.progress_pct)}`}>
                {getStatusText(p.progress_pct)}
              </span>
            </div>
            <Progress value={p.progress_pct} className="h-1.5 mb-2" />
            <p className="text-caption text-muted-foreground">{p.progress_pct}% complete</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
