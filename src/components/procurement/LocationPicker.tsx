import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createLocation } from "@/data/inventory-store";
import { useLocations } from "@/hooks/use-inventory-data";
import { cn } from "@/lib/utils";

interface LocationPickerProps {
  projectId: string;
  value?: string | null;
  onChange: (locationId: string) => void;
  placeholder?: string;
  className?: string;
  allowCreate?: boolean;
}

export function LocationPicker({
  projectId,
  value,
  onChange,
  placeholder = "Select location",
  className,
  allowCreate = true,
}: LocationPickerProps) {
  const locations = useLocations(projectId);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");

  const selected = useMemo(
    () => locations.find((location) => location.id === value) ?? null,
    [locations, value],
  );

  const createAndSelect = () => {
    const name = newName.trim();
    if (!name) return;
    const created = createLocation(projectId, { name, address: newAddress });
    onChange(created.id);
    setNewName("");
    setNewAddress("");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("w-full justify-between", className)}>
          <span className="truncate text-left">{selected ? selected.name : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-2" align="start">
        <div className="space-y-1.5">
          {locations.map((location) => (
            <button
              type="button"
              key={location.id}
              onClick={() => {
                onChange(location.id);
                setOpen(false);
              }}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/70 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-foreground">{location.name}</p>
                  {location.address && (
                    <p className="truncate text-xs text-muted-foreground">{location.address}</p>
                  )}
                </div>
                {value === location.id && <Check className="h-4 w-4 text-success shrink-0" />}
              </div>
            </button>
          ))}
        </div>

        {allowCreate && (
          <div className="mt-2 border-t border-border pt-2 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">+ Create location</p>
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Location name"
              className="h-8"
            />
            <Input
              value={newAddress}
              onChange={(event) => setNewAddress(event.target.value)}
              placeholder="Address (optional)"
              className="h-8"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={createAndSelect}
              disabled={!newName.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add location
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
