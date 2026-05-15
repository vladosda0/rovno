import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZE_OPTIONS, type PageSize } from "@/hooks/use-section-filters";

interface PageSizeSelectorProps {
  value: PageSize;
  onValueChange: (size: PageSize) => void;
  label: string;
  ariaLabel?: string;
}

export function PageSizeSelector({ value, onValueChange, label, ariaLabel }: PageSizeSelectorProps) {
  return (
    <label className="flex items-center gap-2 text-caption text-muted-foreground">
      <span>{label}</span>
      <Select
        value={String(value)}
        onValueChange={(next) => onValueChange(Number(next) as PageSize)}
      >
        <SelectTrigger className="h-8 w-[72px]" aria-label={ariaLabel ?? label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PAGE_SIZE_OPTIONS.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
