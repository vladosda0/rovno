import { Link } from "react-router-dom";
import { FileText, ArrowRight } from "lucide-react";
import type { Document } from "@/types/entities";

interface Props {
  documents: Document[];
  projectId: string;
}

export function DocsWidget({ documents, projectId }: Props) {
  return (
    <div className="glass rounded-card p-sp-2">
      <div className="flex items-center justify-between mb-sp-2">
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" /> Documents
        </h3>
        <Link to={`/project/${projectId}/documents`} className="text-caption text-accent hover:underline flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      {documents.length > 0 ? (
        <div className="space-y-1.5">
          {documents.map((d) => {
            const v = d.versions[d.versions.length - 1];
            return (
              <div key={d.id} className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2">
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-caption text-foreground flex-1 truncate">{d.title}</span>
                <span className="text-[10px] text-muted-foreground capitalize">{d.type} · v{v?.number}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-caption text-muted-foreground text-center py-sp-2">No documents yet</p>
      )}
    </div>
  );
}
