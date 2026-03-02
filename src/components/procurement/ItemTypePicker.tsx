import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ProcurementItemType } from "@/types/entities";

const TYPE_META: Record<ProcurementItemType, { label: string; className: string }> = {
  material: { label: "Material", className: "bg-info/15 text-info" },
  tool: { label: "Tool", className: "bg-warning/20 text-warning-foreground" },
  other: { label: "Other", className: "bg-muted text-muted-foreground" },
};

interface ItemTypePickerProps {
  value: ProcurementItemType;
  onChange: (value: ProcurementItemType) => void;
  disabled?: boolean;
  className?: string;
}

export function ItemTypePicker({ value, onChange, disabled, className }: ItemTypePickerProps) {
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
            {TYPE_META[value].label}
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
              {TYPE_META[type].label}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
