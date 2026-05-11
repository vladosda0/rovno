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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SaveLearnTarget =
  | { kind: "personal" }
  | { kind: "project"; projectId: string };

interface ProjectOption {
  id: string;
  title: string;
}

interface SaveLearnTargetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectOption[];
  defaultProjectId?: string;
  onConfirm: (target: SaveLearnTarget) => void | Promise<void>;
  saving?: boolean;
}

export function SaveLearnTargetDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  onConfirm,
  saving = false,
}: SaveLearnTargetDialogProps) {
  const { t } = useTranslation();
  const projectAvailable = projects.length > 0;

  const [destination, setDestination] = useState<"personal" | "project">("personal");
  const [projectId, setProjectId] = useState<string | undefined>(defaultProjectId);

  useEffect(() => {
    if (!open) return;
    setDestination("personal");
    setProjectId(defaultProjectId ?? projects[0]?.id);
  }, [open, defaultProjectId, projects]);

  function handleConfirm() {
    if (destination === "project") {
      if (!projectId) return;
      void onConfirm({ kind: "project", projectId });
    } else {
      void onConfirm({ kind: "personal" });
    }
  }

  const confirmDisabled =
    saving || (destination === "project" && (!projectId || !projectAvailable));

  return (
    <Dialog open={open} onOpenChange={(o) => (saving ? undefined : onOpenChange(o))}>
      <DialogContent className="bg-card border border-border rounded-modal max-w-md shadow-xl p-0 gap-0 [&>button.absolute]:hidden">
        <DialogHeader className="border-b border-border px-4 sm:px-5 py-3 sm:py-4">
          <DialogTitle>{t("ai.sidebar.saveDialog.title")}</DialogTitle>
          <DialogDescription>{t("ai.sidebar.saveDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="px-4 sm:px-5 py-3 sm:py-4 space-y-4">
          <RadioGroup
            value={destination}
            onValueChange={(v) => setDestination(v as "personal" | "project")}
            className="flex flex-col gap-2"
            disabled={saving}
          >
            <div className="flex items-start space-x-2">
              <RadioGroupItem value="personal" id="learn-target-personal" />
              <div className="grid gap-0.5">
                <Label htmlFor="learn-target-personal" className="font-normal cursor-pointer">
                  {t("ai.sidebar.saveDialog.targetPersonal")}
                </Label>
                <p className="text-caption text-muted-foreground">
                  {t("ai.sidebar.saveDialog.targetPersonalHint")}
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <RadioGroupItem
                value="project"
                id="learn-target-project"
                disabled={!projectAvailable}
              />
              <div className="grid gap-0.5">
                <Label
                  htmlFor="learn-target-project"
                  className={`font-normal ${projectAvailable ? "cursor-pointer" : "text-muted-foreground"}`}
                >
                  {t("ai.sidebar.saveDialog.targetProject")}
                </Label>
                <p className="text-caption text-muted-foreground">
                  {projectAvailable
                    ? t("ai.sidebar.saveDialog.targetProjectHint")
                    : t("ai.sidebar.saveDialog.targetProjectUnavailable")}
                </p>
              </div>
            </div>
          </RadioGroup>

          {destination === "project" && projectAvailable && (
            <div className="space-y-1">
              <Label className="text-body-sm font-medium">
                {t("ai.sidebar.saveDialog.projectLabel")}
              </Label>
              <Select value={projectId} onValueChange={setProjectId} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder={t("ai.sidebar.saveDialog.projectPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border px-4 sm:px-5 py-3 sm:py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button
            className="bg-accent text-accent-foreground hover:bg-accent/90"
            onClick={handleConfirm}
            disabled={confirmDisabled}
          >
            {saving
              ? t("ai.sidebar.saveDialog.saving")
              : t("ai.sidebar.saveDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
