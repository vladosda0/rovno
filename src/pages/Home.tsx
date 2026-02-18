import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Plus, FolderOpen } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function Home() {
  return (
    <div className="p-sp-3">
      <div className="flex items-center justify-between mb-sp-3">
        <h1 className="text-h2 text-foreground">Projects</h1>
        <Button className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="mr-2 h-4 w-4" /> New Project
        </Button>
      </div>

      {/* Mock project cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-sp-2">
        {[
          { id: "1", name: "Apartment Renovation", status: "In progress" },
          { id: "2", name: "Office Build-out", status: "Draft" },
          { id: "3", name: "Kitchen Remodel", status: "Done" },
        ].map((p) => (
          <Link
            key={p.id}
            to={`/project/${p.id}/dashboard`}
            className="glass rounded-card p-sp-3 hover:scale-[1.01] transition-transform duration-150"
          >
            <h3 className="text-body font-semibold text-foreground mb-1">{p.name}</h3>
            <p className="text-caption text-muted-foreground">{p.status}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
