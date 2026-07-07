import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, Package, Pencil, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmModal } from "@/components/ConfirmModal";
import { MultiStepUploadModal } from "@/components/upload/MultiStepUploadModal";
import { toast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import {
  useAllUserCatalogItems,
  useDeleteUserCatalog,
  useRenameUserCatalog,
  useUserCatalogs,
} from "@/hooks/use-user-catalogs";
import type { UserCatalog } from "@/types/user-catalog";

/**
 * "Каталоги" leaf of the documents hub (US-9): the user's personal
 * price-list catalogs — open, rename, delete, plus the upload entry point.
 */
export function CatalogsTab() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const workspaceMode = useWorkspaceMode();
  const isSupabaseMode = workspaceMode.kind === "supabase";

  const catalogsQuery = useUserCatalogs(isSupabaseMode);
  const itemsQuery = useAllUserCatalogItems(isSupabaseMode);

  const renameMutation = useRenameUserCatalog();
  const deleteMutation = useDeleteUserCatalog();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<UserCatalog | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UserCatalog | null>(null);

  const itemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of itemsQuery.data ?? []) {
      counts.set(item.catalogId, (counts.get(item.catalogId) ?? 0) + 1);
    }
    return counts;
  }, [itemsQuery.data]);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language === "en" ? "en-GB" : "ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    [i18n.language],
  );

  const openRename = (catalog: UserCatalog) => {
    setRenameTarget(catalog);
    setRenameValue(catalog.name);
  };

  const commitRename = () => {
    const target = renameTarget;
    const name = renameValue.trim();
    setRenameTarget(null);
    if (!target || !name || name === target.name) return;
    renameMutation.mutate(
      { catalogId: target.id, name },
      { onError: () => toast({ title: t("catalogPage.renameFailed"), variant: "destructive" }) },
    );
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    deleteMutation.mutate(target.id, {
      onSuccess: () => toast({ title: t("catalogPage.deletedToast", { name: target.name }) }),
      onError: () => toast({ title: t("catalogPage.deleteFailed"), variant: "destructive" }),
    });
  };

  if (!isSupabaseMode) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-muted p-4 text-muted-foreground">
            <Package className="h-8 w-8" aria-hidden="true" />
          </div>
          <h2 className="text-h3 text-foreground">{t("home.catalogs.title")}</h2>
          <p className="max-w-prose text-body-sm text-muted-foreground">
            {t("home.catalogs.signInBody")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const catalogs = catalogsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-h3 text-foreground">{t("home.catalogs.title")}</h2>
          <p className="text-caption text-muted-foreground">{t("home.catalogs.listSubtitle")}</p>
        </div>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="h-4 w-4" />
          {t("home.catalogs.uploadCta")}
        </Button>
      </div>

      {catalogsQuery.isLoading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("home.tab.loading")}
          </CardContent>
        </Card>
      ) : catalogs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-muted p-4 text-muted-foreground">
              <Package className="h-8 w-8" aria-hidden="true" />
            </div>
            <h3 className="text-h3 text-foreground">{t("home.catalogs.empty.title")}</h3>
            <p className="max-w-prose text-body-sm text-muted-foreground">
              {t("home.catalogs.empty.uploadBody")}
            </p>
            <Button onClick={() => setUploadOpen(true)} className="gap-2">
              <Upload className="h-4 w-4" />
              {t("home.catalogs.uploadCta")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {catalogs.map((catalog) => {
            const count = itemCounts.get(catalog.id);
            return (
              <Card key={catalog.id} className="transition-colors hover:border-accent/40">
                <CardContent className="flex items-center gap-3 p-3 sm:p-4">
                  <Link
                    to={`/home/catalogs/${catalog.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="rounded-md bg-muted p-2 text-muted-foreground">
                      <Package className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-medium text-foreground">
                        {catalog.name}
                      </span>
                      <span className="block truncate text-caption text-muted-foreground">
                        {[
                          count !== undefined
                            ? t("home.catalogs.itemCount", { count })
                            : null,
                          dateFormatter.format(new Date(catalog.createdAt)),
                          catalog.sourceFilename,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label={t("home.catalogs.actionsAria")}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/home/catalogs/${catalog.id}`)}>
                        <Package className="mr-2 h-4 w-4" />
                        {t("home.catalogs.open")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openRename(catalog)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t("home.catalogs.rename")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleteTarget(catalog)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {t("common.delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <MultiStepUploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        presetType="catalog"
      />

      <Dialog open={renameTarget !== null} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("home.catalogs.renameTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename();
            }}
            maxLength={200}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={commitRename} disabled={!renameValue.trim()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmModal
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("catalogPage.deleteCatalogTitle", { name: deleteTarget?.name ?? "" })}
        description={t("catalogPage.deleteCatalogBody")}
        confirmLabel={t("common.delete")}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
