import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useDeleteOrganization } from "@/hooks/use-orgs";

interface DeleteOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  orgName: string;
}

export function DeleteOrgDialog({ open, onOpenChange, orgId, orgName }: DeleteOrgDialogProps) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState("");
  const deleteMutation = useDeleteOrganization();

  useEffect(() => {
    if (!open) setConfirmText("");
  }, [open]);

  const matches = confirmText.trim() === orgName;
  const submitDisabled = !matches || deleteMutation.isPending;

  async function handleDelete() {
    if (submitDisabled) return;
    try {
      await deleteMutation.mutateAsync(orgId);
      toast({
        title: t("home.org.delete.toast.successTitle"),
        description: t("home.org.delete.toast.successDescription", { name: orgName }),
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t("home.org.delete.toast.errorTitle"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => (deleteMutation.isPending ? undefined : onOpenChange(o))}>
      <AlertDialogContent className="glass-modal rounded-modal max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("home.org.delete.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("home.org.delete.description", { name: orgName })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-body-sm">
            {t("home.org.delete.confirmLabel", { name: orgName })}
          </Label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={orgName}
            autoFocus
            disabled={deleteMutation.isPending}
          />
        </div>
        <AlertDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={deleteMutation.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={submitDisabled}
          >
            {deleteMutation.isPending ? t("home.org.delete.deleting") : t("common.delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
