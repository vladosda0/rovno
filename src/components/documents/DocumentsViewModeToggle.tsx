import { useTranslation } from "react-i18next";
import { Grid3X3, List } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

export type DocumentViewMode = "list" | "grid";

interface DocumentsViewModeToggleProps {
  value: DocumentViewMode;
  onValueChange: (value: DocumentViewMode) => void;
  className?: string;
}

export function DocumentsViewModeToggle({
  value,
  onValueChange,
  className,
}: DocumentsViewModeToggleProps) {
  const { t } = useTranslation();
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(nextValue) => {
        if (nextValue === "list" || nextValue === "grid") {
          onValueChange(nextValue);
        }
      }}
      className={cn("inline-flex items-center gap-0 rounded-md border border-border bg-background/60 p-0.5", className)}
      aria-label={t("documents.viewModeToggle.aria")}
    >
      <ToggleGroupItem
        value="list"
        size="sm"
        aria-label={t("documents.viewModeToggle.listAria")}
        title={t("documents.viewModeToggle.listAria")}
        className="h-8 gap-1.5 rounded-sm px-2.5 text-caption"
      >
        <List className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("documents.viewModeToggle.list")}</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="grid"
        size="sm"
        aria-label={t("documents.viewModeToggle.gridAria")}
        title={t("documents.viewModeToggle.gridAria")}
        className="h-8 gap-1.5 rounded-sm px-2.5 text-caption"
      >
        <Grid3X3 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("documents.viewModeToggle.grid")}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
