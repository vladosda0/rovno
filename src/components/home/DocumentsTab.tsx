import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Upload, Pin } from "lucide-react";
import { DocumentGridCard } from "@/components/documents/DocumentGridCard";
import { DocumentListItem } from "@/components/documents/DocumentListItem";
import { DocumentsViewModeToggle, type DocumentViewMode } from "@/components/documents/DocumentsViewModeToggle";
import { useCurrentUser, useWorkspaceMode } from "@/hooks/use-mock-data";
import { useWorkspaceDocuments, type WorkspaceDoc } from "@/hooks/use-workspace-documents-source";

const CATEGORIES = [
  { id: "All", labelKey: "documentsTab.categories.all" },
  { id: "How-tos", labelKey: "documentsTab.categories.howTos" },
  { id: "Instructions", labelKey: "documentsTab.categories.instructions" },
  { id: "Catalogs", labelKey: "documentsTab.categories.catalogs" },
  { id: "Price lists", labelKey: "documentsTab.categories.priceLists" },
  { id: "Warranties", labelKey: "documentsTab.categories.warranties" },
  { id: "Templates", labelKey: "documentsTab.categories.templates" },
] as const;

interface MockDoc {
  id: string;
  titleKey: string;
  category: string;
  categoryKey: string;
  pinned: boolean;
  tags: string[];
  updatedAt: string;
}

const MOCK_DOCS: MockDoc[] = [
  { id: "lib-1", titleKey: "documentsTab.mock.safety", category: "Instructions", categoryKey: "documentsTab.categories.instructions", pinned: true, tags: ["safety", "onboarding"], updatedAt: "2025-02-15" },
  { id: "lib-2", titleKey: "documentsTab.mock.catalog", category: "Catalogs", categoryKey: "documentsTab.categories.catalogs", pinned: false, tags: ["materials"], updatedAt: "2025-01-20" },
  { id: "lib-3", titleKey: "documentsTab.mock.warrantyTemplate", category: "Templates", categoryKey: "documentsTab.categories.templates", pinned: false, tags: ["warranty", "template"], updatedAt: "2025-01-10" },
  { id: "lib-4", titleKey: "documentsTab.mock.priceListFinishes", category: "Price lists", categoryKey: "documentsTab.categories.priceLists", pinned: true, tags: ["pricing"], updatedAt: "2025-02-01" },
  { id: "lib-5", titleKey: "documentsTab.mock.kitchenHowTo", category: "How-tos", categoryKey: "documentsTab.categories.howTos", pinned: false, tags: ["estimation", "kitchen"], updatedAt: "2024-12-20" },
];

interface DisplayDoc {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  pinned: boolean;
  tags: string[];
  updatedAt: string;
  description?: string;
}

function categoryFromType(type: string): { id: string; labelKey: string } {
  const t = type?.toLowerCase() ?? "";
  if (t.includes("how")) return CATEGORIES[1];
  if (t.includes("instruction")) return CATEGORIES[2];
  if (t.includes("catalog")) return CATEGORIES[3];
  if (t.includes("price")) return CATEGORIES[4];
  if (t.includes("warrant")) return CATEGORIES[5];
  if (t.includes("template")) return CATEGORIES[6];
  return CATEGORIES[2];
}

export function DocumentsTab() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [viewMode, setViewMode] = useState<DocumentViewMode>("list");
  const [pinOverrides, setPinOverrides] = useState<Record<string, boolean>>({});
  const [viewDoc, setViewDoc] = useState<DisplayDoc | null>(null);

  const mode = useWorkspaceMode();
  const currentUser = useCurrentUser();
  const isSupabaseMode = mode.kind === "supabase";
  const profileId = isSupabaseMode ? currentUser.id : undefined;
  const { data: workspaceDocs, isPending: isWorkspaceDocsLoading } = useWorkspaceDocuments(profileId);

  const supabaseDisplayDocs = useMemo<DisplayDoc[]>(() => {
    return (workspaceDocs ?? []).map((doc: WorkspaceDoc) => {
      const categoryMeta = categoryFromType(doc.type);
      return {
        id: doc.id,
        title: doc.title,
        category: categoryMeta.id,
        categoryLabel: t(categoryMeta.labelKey),
        pinned: pinOverrides[doc.id] ?? doc.pinned,
        tags: doc.tags ?? [],
        updatedAt: doc.updatedAt.slice(0, 10),
        description: doc.description,
      };
    });
  }, [workspaceDocs, pinOverrides, t]);

  const mockDisplayDocs = useMemo<DisplayDoc[]>(() => {
    return MOCK_DOCS.map((doc) => ({
      id: doc.id,
      title: t(doc.titleKey),
      category: doc.category,
      categoryLabel: t(doc.categoryKey),
      pinned: pinOverrides[doc.id] ?? doc.pinned,
      tags: doc.tags,
      updatedAt: doc.updatedAt,
    }));
  }, [pinOverrides, t]);

  const displayDocs = isSupabaseMode ? supabaseDisplayDocs : mockDisplayDocs;
  const isLoading = isSupabaseMode && isWorkspaceDocsLoading;

  const filtered = displayDocs.filter((d) => {
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.tags.some((tag) => tag.includes(search.toLowerCase()))) return false;
    if (category !== "All" && d.category !== category) return false;
    return true;
  }).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  function togglePin(id: string, current: boolean) {
    setPinOverrides((prev) => ({ ...prev, [id]: !current }));
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("documentsTab.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button variant="outline" size="sm" disabled>
          <Upload className="h-3.5 w-3.5 mr-1.5" /> {t("documentsTab.upload")}
        </Button>
        <DocumentsViewModeToggle value={viewMode} onValueChange={setViewMode} />
      </div>

      {/* Categories */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map((cat) => {
          const isSelected = category === cat.id;
          return (
            <Button
              key={cat.id}
              variant="outline"
              size="sm"
              aria-pressed={isSelected}
              className={`text-caption h-7 ${
                isSelected
                  ? "bg-accent text-accent-foreground border-accent hover:bg-accent/90 hover:text-accent-foreground"
                  : ""
              }`}
              onClick={() => setCategory(cat.id)}
            >
              {t(cat.labelKey)}
            </Button>
          );
        })}
      </div>

      {/* Documents */}
      {isLoading ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="p-4">
                  <Skeleton className="h-5 w-1/2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((doc) => (
                <DocumentListItem
                  key={doc.id}
                  title={doc.title}
                  titleAdornment={doc.pinned ? <Pin className="mr-1 inline h-3 w-3 text-accent" /> : undefined}
                  onOpen={doc.description ? () => setViewDoc(doc) : undefined}
                  details={(
                    <>
                      <Badge variant="secondary" className="text-[10px]">{doc.categoryLabel}</Badge>
                      {doc.tags.map((tag) => (
                        <span key={tag} className="text-[10px] text-muted-foreground">#{tag}</span>
                      ))}
                    </>
                  )}
                  trailing={(
                    <div className="flex items-center gap-2">
                      <span className="text-caption text-muted-foreground">{doc.updatedAt}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => togglePin(doc.id, doc.pinned)}>
                        <Pin className={`h-3.5 w-3.5 ${doc.pinned ? "text-accent" : "text-muted-foreground"}`} />
                      </Button>
                    </div>
                  )}
                />
              ))}
              {filtered.length === 0 && (
                <p className="text-caption text-muted-foreground py-8 text-center">{t("documentsTab.noDocs")}</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {filtered.map((doc) => (
            <DocumentGridCard
              key={doc.id}
              title={doc.title}
              titleAdornment={doc.pinned ? <Pin className="mr-1 inline h-3 w-3 text-accent" /> : undefined}
              onOpen={doc.description ? () => setViewDoc(doc) : undefined}
              actions={(
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => togglePin(doc.id, doc.pinned)}
                  title={doc.pinned ? t("documentsTab.unpin") : t("documentsTab.pin")}
                >
                  <Pin className={`h-3.5 w-3.5 ${doc.pinned ? "text-accent" : "text-muted-foreground"}`} />
                </Button>
              )}
              meta={(
                <>
                  <Badge variant="secondary" className="text-[10px]">{doc.categoryLabel}</Badge>
                  {doc.tags.map((tag) => (
                    <span key={tag} className="text-[10px] text-muted-foreground">#{tag}</span>
                  ))}
                  <span className="text-caption text-muted-foreground">{doc.updatedAt}</span>
                </>
              )}
            />
          ))}
          {filtered.length === 0 && (
            <Card className="sm:col-span-2 lg:col-span-3">
              <CardContent className="py-8 text-center text-caption text-muted-foreground">
                {t("documentsTab.noDocs")}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Dialog open={!!viewDoc} onOpenChange={(open) => { if (!open) setViewDoc(null); }}>
        <DialogContent className="bg-card border border-border rounded-modal max-w-lg shadow-xl p-0 gap-0 [&>button.absolute]:hidden">
          {viewDoc && (
            <>
              <DialogHeader className="border-b border-border px-5 py-4">
                <DialogTitle className="flex-1 min-w-0">{viewDoc.title}</DialogTitle>
                <DialogDescription>
                  <Badge variant="secondary" className="text-[10px] mr-1">{viewDoc.categoryLabel}</Badge>
                  <span className="text-caption text-muted-foreground">{viewDoc.updatedAt}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="px-5 py-4">
                <div className="rounded-panel border border-border bg-muted/30 p-4 max-h-96 overflow-y-auto">
                  {viewDoc.description ? (
                    <p className="text-body-sm text-foreground whitespace-pre-wrap break-words">{viewDoc.description}</p>
                  ) : (
                    <p className="text-body-sm text-muted-foreground">{t("documentsTab.noContent")}</p>
                  )}
                </div>
              </div>
              <DialogFooter className="border-t border-border px-5 py-4">
                <Button variant="outline" onClick={() => setViewDoc(null)}>{t("common.close")}</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
