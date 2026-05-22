import { useTranslation } from "react-i18next";
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
import { useActiveOrg } from "@/hooks/use-orgs";
import { useProjects } from "@/hooks/use-mock-data";
import {
  hasPublicScope,
  scopesForType,
  type UploadScope,
  type UploadType,
} from "@/components/upload/types";

export interface Step2ScopeSelectionProps {
  type: UploadType;
  scope: UploadScope | null;
  projectId?: string;
  onScopeChange: (scope: UploadScope) => void;
  onProjectChange: (projectId: string) => void;
  onBack: () => void;
  onNext: (scope: UploadScope, projectId?: string) => void;
}

export function Step2ScopeSelection({
  type,
  scope,
  projectId,
  onScopeChange,
  onProjectChange,
  onBack,
  onNext,
}: Step2ScopeSelectionProps) {
  const { t } = useTranslation();
  const activeOrg = useActiveOrg();
  const projects = useProjects();

  const orgAvailable = Boolean(activeOrg?.id);
  const projectAvailable = projects.length > 0;

  function scopeDisabled(value: UploadScope): boolean {
    if (value === "org") return !orgAvailable;
    if (value === "project") return !projectAvailable;
    return false;
  }

  function scopeDescription(value: UploadScope): string {
    if (value === "org") {
      return orgAvailable
        ? t("upload.modal.step2.scopes.org.description", { name: activeOrg?.name ?? "" })
        : t("upload.modal.step2.scopes.orgUnavailable");
    }
    if (value === "project") {
      return projectAvailable
        ? t("upload.modal.step2.scopes.project.description")
        : t("upload.modal.step2.scopes.projectUnavailable");
    }
    return t(`upload.modal.step2.scopes.${value}.description`);
  }

  const canProceed = Boolean(scope) && (scope !== "project" || Boolean(projectId));

  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
        <RadioGroup
          value={scope ?? undefined}
          onValueChange={(value) => onScopeChange(value as UploadScope)}
          className="flex flex-col gap-2"
        >
          {scopesForType(type).map((value) => {
            const disabled = scopeDisabled(value);
            const id = `scope-${value}`;
            return (
              <div key={value} className="space-y-2">
                <Label
                  htmlFor={id}
                  className={`flex items-start gap-3 rounded-panel border p-3 transition ${
                    disabled
                      ? "cursor-not-allowed border-border opacity-60"
                      : scope === value
                        ? "cursor-pointer border-accent bg-accent/5"
                        : "cursor-pointer border-border hover:border-accent/40"
                  }`}
                >
                  <RadioGroupItem value={value} id={id} disabled={disabled} className="mt-0.5" />
                  <span className="grid gap-0.5">
                    <span className="text-body-sm font-medium text-foreground">
                      {t(`upload.modal.step2.scopes.${value}.title`)}
                    </span>
                    <span className="text-caption text-muted-foreground">
                      {scopeDescription(value)}
                    </span>
                  </span>
                </Label>

                {value === "project" && scope === "project" && projectAvailable && (
                  <div className="pl-8 space-y-1">
                    <Label className="text-caption font-medium">
                      {t("upload.modal.step2.projectLabel")}
                    </Label>
                    <Select value={projectId} onValueChange={onProjectChange}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("upload.modal.step2.projectPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {value === "public" && scope === "public" && hasPublicScope(type) && (
                  <p className="pl-8 text-caption text-amber-600 dark:text-amber-500">
                    {t(`upload.modal.step2.publicWarnings.${type}`)}
                  </p>
                )}
              </div>
            );
          })}
        </RadioGroup>
      </div>

      <div className="border-t border-border px-4 sm:px-5 py-3 sm:py-4 flex justify-between shrink-0">
        <Button variant="outline" onClick={onBack}>
          {t("upload.modal.back")}
        </Button>
        <Button
          className="bg-accent text-accent-foreground hover:bg-accent/90"
          disabled={!canProceed}
          onClick={() => scope && onNext(scope, projectId)}
        >
          {t("upload.modal.next")}
        </Button>
      </div>
    </div>
  );
}
