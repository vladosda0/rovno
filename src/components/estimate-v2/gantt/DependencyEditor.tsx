import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { EstimateV2Dependency, EstimateV2Work } from "@/types/estimate-v2";

interface DependencyEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  works: EstimateV2Work[];
  dependencies: EstimateV2Dependency[];
  isOwner: boolean;
  onAddDependency: (fromWorkId: string, toWorkId: string, lagDays: number, comment?: string) => void;
  onRemoveDependency: (dependencyId: string) => void;
}

export function DependencyEditor({
  open,
  onOpenChange,
  works,
  dependencies,
  isOwner,
  onAddDependency,
  onRemoveDependency,
}: DependencyEditorProps) {
  const { t } = useTranslation();
  const [fromWorkId, setFromWorkId] = useState("");
  const [toWorkId, setToWorkId] = useState("");
  const [lagDays, setLagDays] = useState("0");
  const [comment, setComment] = useState("");

  const worksById = useMemo(
    () => new Map(works.map((work) => [work.id, work])),
    [works],
  );

  const sortedWorks = useMemo(
    () => [...works].sort((a, b) => a.title.localeCompare(b.title)),
    [works],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("estimate.gantt.dep.title")}</SheetTitle>
          <SheetDescription>
            {t("estimate.gantt.dep.description")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="rounded-md border border-border p-3">
            <p className="mb-2 text-sm font-medium text-foreground">{t("estimate.gantt.dep.addHeading")}</p>
            <div className="grid gap-2">
              <Select value={fromWorkId} onValueChange={setFromWorkId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("estimate.gantt.dep.predecessorPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {sortedWorks.map((work) => (
                    <SelectItem key={work.id} value={work.id}>{work.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={toWorkId} onValueChange={setToWorkId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("estimate.gantt.dep.successorPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {sortedWorks.map((work) => (
                    <SelectItem key={work.id} value={work.id}>{work.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="number"
                value={lagDays}
                onChange={(event) => setLagDays(event.target.value)}
                placeholder={t("estimate.gantt.dep.lagPlaceholder")}
              />

              <Input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={t("estimate.gantt.dep.commentPlaceholder")}
              />

              <Button
                disabled={!isOwner}
                onClick={() => {
                  if (!fromWorkId || !toWorkId) return;
                  onAddDependency(fromWorkId, toWorkId, Number(lagDays) || 0, comment.trim() || undefined);
                  setFromWorkId("");
                  setToWorkId("");
                  setLagDays("0");
                  setComment("");
                }}
              >
                {t("estimate.gantt.dep.addButton")}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {dependencies.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("estimate.gantt.dep.empty")}</p>
            )}

            {dependencies.map((dependency) => {
              const from = worksById.get(dependency.fromWorkId);
              const to = worksById.get(dependency.toWorkId);
              return (
                <div
                  key={dependency.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-foreground">
                      {from?.title ?? dependency.fromWorkId}
                      {t("estimate.gantt.dep.arrow")}
                      {to?.title ?? dependency.toWorkId}
                    </p>
                    <p className="text-xs text-muted-foreground">{t("estimate.gantt.dep.lagDisplay", { days: dependency.lagDays })}</p>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    disabled={!isOwner}
                    onClick={() => onRemoveDependency(dependency.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
