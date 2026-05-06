import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, Home as HomeIcon } from "lucide-react";
import { useWorkspaceCurrentUserState } from "@/hooks/use-workspace-source";
import { useWorkspaceDocuments } from "@/hooks/use-workspace-documents-source";
import {
  useImportDocumentsToProject,
  useOrgDocuments,
} from "@/hooks/use-orgs";
import { documentsMediaQueryKeys } from "@/hooks/use-documents-media-source";
import { toast } from "@/hooks/use-toast";

export type ImportSourceKind = "workspace" | "org";

export interface ImportDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  source: ImportSourceKind;
  /** Required when source = "org". */
  orgId?: string | null;
  /** Used for the dialog title chip. */
  orgName?: string | null;
}

interface SelectableDoc {
  id: string;
  title: string;
  description?: string;
  updatedAt: string;
}

export function ImportDocumentsDialog({
  open,
  onOpenChange,
  projectId,
  source,
  orgId,
  orgName,
}: ImportDocumentsDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { user } = useWorkspaceCurrentUserState();
  const profileId = user?.id;

  const workspaceDocsQuery = useWorkspaceDocuments(source === "workspace" ? profileId : undefined);
  const orgDocsQuery = useOrgDocuments(source === "org" ? orgId ?? null : null);

  const docs: SelectableDoc[] = useMemo(() => {
    if (source === "workspace") {
      return (workspaceDocsQuery.data ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
        description: doc.description,
        updatedAt: doc.updatedAt.slice(0, 10),
      }));
    }
    return (orgDocsQuery.data ?? []).map((doc) => ({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      updatedAt: doc.updatedAt.slice(0, 10),
    }));
  }, [source, workspaceDocsQuery.data, orgDocsQuery.data]);

  const isLoading = source === "workspace" ? workspaceDocsQuery.isPending : orgDocsQuery.isPending;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const importMutation = useImportDocumentsToProject(projectId);

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
    }
  }, [open]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    if (selected.size === 0) return;
    try {
      const result = await importMutation.mutateAsync({
        kind: source,
        documentIds: Array.from(selected),
      });
      if (profileId) {
        await queryClient.invalidateQueries({
          queryKey: documentsMediaQueryKeys.projectDocuments(profileId, projectId),
        });
      }
      toast({ title: t("documents.import.success", { count: result.count }) });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t("documents.import.error"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  const sourceIcon = source === "workspace" ? HomeIcon : Building2;
  const SourceIcon = sourceIcon;
  const sourceTitle = source === "workspace"
    ? t("documents.import.fromHome")
    : t("documents.import.fromOrg", { name: orgName ?? "" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border border-border rounded-modal max-w-xl shadow-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SourceIcon className="h-4 w-4 text-accent" />
            <span>{t("documents.import.dialogTitle")}</span>
            <span className="text-caption text-muted-foreground">· {sourceTitle}</span>
          </DialogTitle>
          <DialogDescription>{t("documents.import.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <p className="py-6 text-center text-body-sm text-muted-foreground">
              {t("documents.import.empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {docs.map((doc) => {
                const isSelected = selected.has(doc.id);
                return (
                  <li key={doc.id}>
                    <label className="flex items-start gap-3 py-2 cursor-pointer">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(doc.id)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium text-foreground truncate">{doc.title}</p>
                        {doc.description && (
                          <p className="text-caption text-muted-foreground line-clamp-2">{doc.description}</p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-0.5">{doc.updatedAt}</p>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importMutation.isPending}>
            {t("onboarding.org.skip")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={selected.size === 0 || importMutation.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {importMutation.isPending ? t("documents.import.submitting") : t("documents.import.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
