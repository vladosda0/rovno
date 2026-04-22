import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const COMMON_UNITS = ["pcs", "m", "m2", "m3", "kg", "l", "set", "roll", "box"];

interface UnitPickerProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
}

export function UnitPicker({ value, onChange, disabled, className }: UnitPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");

  const applyCustom = () => {
    const unit = custom.trim();
    if (!unit) return;
    onChange(unit);
    setCustom("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className={className} disabled={disabled}>
          {value || t("procurement.unitPicker.default")}
          <ChevronsUpDown className="h-3 w-3 ml-1 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-2" align="start">
        <div className="grid grid-cols-3 gap-1">
          {COMMON_UNITS.map((unit) => (
            <Button
              key={unit}
              type="button"
              variant={unit === value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                onChange(unit);
                setOpen(false);
              }}
            >
              {unit}
            </Button>
          ))}
        </div>
        <div className="mt-2 border-t border-border pt-2 space-y-2">
          <Input
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            placeholder={t("procurement.unitPicker.customPlaceholder")}
            className="h-8"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              applyCustom();
            }}
          />
          <Button type="button" size="sm" className="w-full" onClick={applyCustom} disabled={!custom.trim()}>
            {t("procurement.unitPicker.useCustom")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
