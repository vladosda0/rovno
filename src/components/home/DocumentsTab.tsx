import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, Upload, Pin, Grid3X3, List } from "lucide-react";

const CATEGORIES = [
  "All", "How-tos", "Instructions", "Catalogs", "Price lists", "Warranties", "Templates",
] as const;

interface LibraryDoc {
  id: string;
  title: string;
  category: string;
  pinned: boolean;
  tags: string[];
  updatedAt: string;
}

const MOCK_DOCS: LibraryDoc[] = [
  { id: "lib-1", title: "General Safety Instructions", category: "Instructions", pinned: true, tags: ["safety", "onboarding"], updatedAt: "2025-02-15" },
  { id: "lib-2", title: "Material Catalog — Q1 2025", category: "Catalogs", pinned: false, tags: ["materials"], updatedAt: "2025-01-20" },
  { id: "lib-3", title: "Warranty Policy Template", category: "Templates", pinned: false, tags: ["warranty", "template"], updatedAt: "2025-01-10" },
  { id: "lib-4", title: "Price List — Standard Finishes", category: "Price lists", pinned: true, tags: ["pricing"], updatedAt: "2025-02-01" },
  { id: "lib-5", title: "How to Estimate a Kitchen Remodel", category: "How-tos", pinned: false, tags: ["estimation", "kitchen"], updatedAt: "2024-12-20" },
];

export function DocumentsTab() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [docs, setDocs] = useState(MOCK_DOCS);

  const filtered = docs.filter((d) => {
    if (search && !d.title.toLowerCase().includes(search.toLowerCase()) && !d.tags.some((t) => t.includes(search.toLowerCase()))) return false;
    if (category !== "All" && d.category !== category) return false;
    return true;
  }).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  function togglePin(id: string) {
    setDocs((prev) => prev.map((d) => d.id === id ? { ...d, pinned: !d.pinned } : d));
  }

  return (
    <div className="space-y-sp-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search documents…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Button variant="outline" size="sm">
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload
        </Button>
        <div className="flex border border-border rounded-md">
          <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setViewMode("list")}>
            <List className="h-4 w-4" />
          </Button>
          <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setViewMode("grid")}>
            <Grid3X3 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Categories */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat}
            variant={category === cat ? "default" : "outline"}
            size="sm"
            className="text-caption h-7"
            onClick={() => setCategory(cat)}
          >
            {cat}
          </Button>
        ))}
      </div>

      {/* Documents */}
      {viewMode === "list" ? (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filtered.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 px-sp-3 py-3 hover:bg-muted/30 transition-colors">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-body-sm font-medium text-foreground truncate">
                      {doc.pinned && <Pin className="h-3 w-3 inline mr-1 text-accent" />}
                      {doc.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="secondary" className="text-[10px]">{doc.category}</Badge>
                      {doc.tags.map((t) => (
                        <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-caption text-muted-foreground shrink-0">{doc.updatedAt}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => togglePin(doc.id)}>
                    <Pin className={`h-3.5 w-3.5 ${doc.pinned ? "text-accent" : "text-muted-foreground"}`} />
                  </Button>
                </div>
              ))}
              {filtered.length === 0 && (
                <p className="text-caption text-muted-foreground py-8 text-center">No documents found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-sp-2">
          {filtered.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-sp-3 space-y-2">
                <div className="flex items-start gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-body-sm font-medium text-foreground">
                    {doc.pinned && <Pin className="h-3 w-3 inline mr-1 text-accent" />}
                    {doc.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{doc.category}</Badge>
                  {doc.tags.map((t) => <span key={t} className="text-[10px] text-muted-foreground">#{t}</span>)}
                </div>
                <p className="text-caption text-muted-foreground">{doc.updatedAt}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
