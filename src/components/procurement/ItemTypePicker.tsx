import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ProcurementItemType } from "@/types/entities";

const TYPE_META: Record<ProcurementItemType, { labelKey: string; className: string }> = {
  material: { labelKey: "procurement.itemType.material", className: "bg-info/15 text-info" },
  tool: { labelKey: "procurement.itemType.tool", className: "bg-warning/20 text-warning-foreground" },
  other: { labelKey: "procurement.itemType.other", className: "bg-muted text-muted-foreground" },
};

interface ItemTypePickerProps {
  value: ProcurementItemType;
  onChange: (value: ProcurementItemType) => void;
  disabled?: boolean;
  className?: string;
}

export function ItemTypePicker({ value, onChange, disabled, className }: ItemTypePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn("h-7 px-2 text-xs", className)}
        >
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TYPE_META[value].className)}>
            {t(TYPE_META[value].labelKey)}
          </span>
          <ChevronsUpDown className="h-3 w-3 ml-1 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[180px] p-1">
        {(Object.keys(TYPE_META) as ProcurementItemType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              onChange(type);
              setOpen(false);
            }}
            className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/70 transition-colors"
          >
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", TYPE_META[type].className)}>
              {t(TYPE_META[type].labelKey)}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
