import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, ChevronRight, Pin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Document } from "@/types/entities";

interface Props {
  documents: Document[];
  projectId: string;
  className?: string;
}

function getPreviewDocuments(documents: Document[]): { items: Document[]; hasPinned: boolean } {
  const projectCreationDocs = documents.filter((d) => d.origin === "project_creation");
  if (projectCreationDocs.length > 0) {
    return { items: projectCreationDocs, hasPinned: true };
  }
  // Store insertion order is oldest -> newest; reverse for dashboard preview recency.
  return { items: [...documents].reverse(), hasPinned: false };
}

export function DocsWidget({ documents, projectId, className }: Props) {
  const { t } = useTranslation();
  const { items, hasPinned } = getPreviewDocuments(documents);

  return (
    <div className={cn("glass rounded-card p-sp-2 h-full flex flex-col", className)}>
      <div className="flex items-center justify-between mb-sp-2">
        <h3 className="text-body font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" /> {t("docsWidget.title")}
        </h3>
        <Link
          to={`/project/${projectId}/documents`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-accent hover:bg-accent/10 transition-colors"
          aria-label="View all documents"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="flex-1">
        {items.length > 0 ? (
          <div className="space-y-1.5">
            {items.slice(0, 4).map((d) => {
              const latestVersion = d.versions[d.versions.length - 1];
              return (
                <div key={d.id} className="flex items-center gap-2 rounded-panel bg-muted/40 p-1.5 px-sp-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-caption text-foreground flex-1 truncate">{d.title}</span>
                  {hasPinned && (
                    <span className="inline-flex items-center gap-1 rounded-pill bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                      <Pin className="h-2.5 w-2.5" /> {t("docsWidget.pinned")}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">{t("docsWidget.docLabel")}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-caption text-muted-foreground text-center py-sp-2">{t("docsWidget.empty")}</p>
        )}
      </div>
    </div>
  );
}
