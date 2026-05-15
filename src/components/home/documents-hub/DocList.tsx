import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentGridCard } from "@/components/documents/DocumentGridCard";
import { DocumentListItem } from "@/components/documents/DocumentListItem";
import { DocumentsViewModeToggle, type DocumentViewMode } from "@/components/documents/DocumentsViewModeToggle";
import { Building2 } from "lucide-react";

export interface DocListItem {
  id: string;
  title: string;
  updatedAt: string;
  description?: string | null;
  tags?: string[];
  scope: "personal" | "org";
  categoryLabel?: string;
  /** Optional payload (e.g. native HTML5 draggable). */
  draggable?: boolean;
  onDragStart?: (event: React.DragEvent) => void;
}

interface DocListProps {
  items: DocListItem[];
  isLoading?: boolean;
  emptyMessage: string;
  viewMode: DocumentViewMode;
  onViewModeChange: (mode: DocumentViewMode) => void;
  onOpen?: (item: DocListItem) => void;
  trailing?: (item: DocListItem) => React.ReactNode;
}

export function DocList({
  items,
  isLoading,
  emptyMessage,
  viewMode,
  onViewModeChange,
  onOpen,
  trailing,
}: DocListProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <DocumentsViewModeToggle value={viewMode} onValueChange={onViewModeChange} />
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="p-4">
                  <Skeleton className="h-5 w-1/2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-caption text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {items.map((doc) => (
                <div
                  key={doc.id}
                  draggable={doc.draggable}
                  onDragStart={doc.onDragStart}
                  className={doc.draggable ? "cursor-grab active:cursor-grabbing" : undefined}
                >
                  <DocumentListItem
                    title={doc.title}
                    onOpen={onOpen ? () => onOpen(doc) : undefined}
                    details={(
                      <>
                        {doc.categoryLabel && (
                          <Badge variant="secondary" className="text-[10px]">{doc.categoryLabel}</Badge>
                        )}
                        {doc.scope === "org" && (
                          <Badge className="text-[10px] bg-accent/15 text-accent border border-accent/30 hover:bg-accent/15">
                            <Building2 className="h-2.5 w-2.5 mr-0.5" />
                            {t("home.org.tag")}
                          </Badge>
                        )}
                        {doc.tags?.map((tag) => (
                          <span key={tag} className="text-[10px] text-muted-foreground">#{tag}</span>
                        ))}
                      </>
                    )}
                    trailing={(
                      <div className="flex items-center gap-2">
                        <span className="text-caption text-muted-foreground">{doc.updatedAt}</span>
                        {trailing?.(doc)}
                      </div>
                    )}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {items.map((doc) => (
            <div
              key={doc.id}
              draggable={doc.draggable}
              onDragStart={doc.onDragStart}
              className={doc.draggable ? "cursor-grab active:cursor-grabbing" : undefined}
            >
              <DocumentGridCard
                title={doc.title}
                onOpen={onOpen ? () => onOpen(doc) : undefined}
                actions={trailing?.(doc)}
                meta={(
                  <>
                    {doc.categoryLabel && (
                      <Badge variant="secondary" className="text-[10px]">{doc.categoryLabel}</Badge>
                    )}
                    {doc.scope === "org" && (
                      <Badge className="text-[10px] bg-accent/15 text-accent border border-accent/30 hover:bg-accent/15">
                        <Building2 className="h-2.5 w-2.5 mr-0.5" />
                        {t("home.org.tag")}
                      </Badge>
                    )}
                    {doc.tags?.map((tag) => (
                      <span key={tag} className="text-[10px] text-muted-foreground">#{tag}</span>
                    ))}
                    <span className="text-caption text-muted-foreground">{doc.updatedAt}</span>
                  </>
                )}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
