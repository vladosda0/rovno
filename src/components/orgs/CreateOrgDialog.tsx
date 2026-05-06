import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateOrganization, useSetActiveOrg } from "@/hooks/use-orgs";
import { isValidOrgSlug, suggestOrgSlug } from "@/data/org-source";
import { toast } from "@/hooks/use-toast";

export interface CreateOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (orgId: string) => void;
  /** Set the new org as the active context after creation. Default: true. */
  activateOnCreate?: boolean;
}

export function CreateOrgDialog({
  open,
  onOpenChange,
  onCreated,
  activateOnCreate = true,
}: CreateOrgDialogProps) {
  const { t } = useTranslation();
  const createMutation = useCreateOrganization();
  const setActiveMutation = useSetActiveOrg();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setSlug("");
      setSlugTouched(false);
    }
  }, [open]);

  useEffect(() => {
    if (slugTouched) return;
    setSlug(name ? suggestOrgSlug(name) : "");
  }, [name, slugTouched]);

  const slugIsValid = slug.length === 0 || isValidOrgSlug(slug);
  const canSubmit = name.trim().length > 0 && slug.length > 0 && slugIsValid && !createMutation.isPending;

  async function handleSubmit() {
    if (!canSubmit) return;
    try {
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
      });
      if (activateOnCreate) {
        try {
          await setActiveMutation.mutateAsync(created.id);
        } catch {
          // soft-fail
        }
      }
      toast({ title: t("onboarding.org.createSuccess") });
      onCreated?.(created.id);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: t("onboarding.org.createError"),
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border border-border rounded-modal max-w-md shadow-xl">
        <DialogHeader>
          <DialogTitle>{t("onboarding.org.title")}</DialogTitle>
          <DialogDescription>{t("onboarding.org.subtitle")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-body-sm font-medium text-foreground">
              {t("onboarding.org.nameLabel")}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("onboarding.org.namePlaceholder")}
              autoFocus
              disabled={createMutation.isPending}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-body-sm font-medium text-foreground">
              {t("onboarding.org.slugLabel")}
            </label>
            <Input
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value.toLowerCase());
              }}
              disabled={createMutation.isPending}
            />
            <p className="text-caption text-muted-foreground">{t("onboarding.org.slugHint")}</p>
            {!slugIsValid && (
              <p className="text-caption text-destructive">{t("onboarding.org.slugInvalid")}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>
            {t("onboarding.org.skip")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {createMutation.isPending ? t("onboarding.org.creating") : t("onboarding.org.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
