import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getInventorySource } from "@/data/inventory-source";
import { inventoryQueryKeys, useLocations } from "@/hooks/use-inventory-data";
import { useToast } from "@/hooks/use-toast";
import { useWorkspaceMode } from "@/hooks/use-workspace-source";
import { cn } from "@/lib/utils";
import type { InventoryLocation } from "@/types/entities";

interface LocationPickerProps {
  projectId: string;
  value?: string | null;
  onChange: (locationId: string) => void;
  placeholder?: string;
  className?: string;
  allowCreate?: boolean;
  disabled?: boolean;
}

export function LocationPicker({
  projectId,
  value,
  onChange,
  placeholder,
  className,
  allowCreate = true,
  disabled = false,
}: LocationPickerProps) {
  const { t } = useTranslation();
  const locations = useLocations(projectId);
  const workspaceMode = useWorkspaceMode();
  const supabaseMode = workspaceMode.kind === "supabase" ? workspaceMode : null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const effectivePlaceholder = placeholder ?? t("procurement.locationPicker.placeholder");

  const selected = useMemo(
    () => locations.find((location) => location.id === value) ?? null,
    [locations, value],
  );

  const createAndSelect = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const source = await getInventorySource(supabaseMode ?? undefined);
      const created = await source.createProjectLocation(projectId, { name, address: newAddress });
      if (supabaseMode) {
        await queryClient.invalidateQueries({
          queryKey: inventoryQueryKeys.projectLocations(supabaseMode.profileId, projectId),
        });
      }
      onChange(created.id);
      setNewName("");
      setNewAddress("");
      setOpen(false);
    } catch (error) {
      toast({
        title: t("procurement.locationPicker.unableCreate"),
        description: error instanceof Error ? error.message : t("procurement.locationPicker.tryAgain"),
        variant: "destructive",
      });
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!disabled) {
          setOpen(nextOpen);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("w-full justify-between", className)} disabled={disabled}>
          <span className="truncate text-left">{selected ? selected.name : effectivePlaceholder}</span>
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
            <p className="text-xs font-medium text-muted-foreground">{t("procurement.locationPicker.createHeading")}</p>
            <Input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder={t("procurement.locationPicker.namePlaceholder")}
              className="h-8"
              disabled={disabled}
            />
            <Input
              value={newAddress}
              onChange={(event) => setNewAddress(event.target.value)}
              placeholder={t("procurement.locationPicker.addressPlaceholder")}
              className="h-8"
              disabled={disabled}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              onClick={() => {
                void createAndSelect();
              }}
              disabled={disabled || !newName.trim()}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              {t("procurement.locationPicker.addButton")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export interface CrossProjectLocationGroup {
  projectId: string;
  projectTitle: string;
  isCurrent: boolean;
  locations: InventoryLocation[];
}

interface GroupedLocationPickerProps {
  groups: CrossProjectLocationGroup[];
  value: { projectId: string; locationId: string } | null;
  onChange: (selection: { projectId: string; locationId: string }) => void;
  /** Per-location availability hint, keyed `${projectId}:${locationId}`. A disabled entry (none of
   *  the ordered materials in stock) is greyed out and not selectable. */
  availability?: ReadonlyMap<string, { label: string; disabled: boolean }>;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Cross-project location picker: locations grouped by project (current project first), reporting
 * which project the chosen location belongs to. Used for the cross-project stock-transfer SOURCE
 * (pull leftovers from another project's warehouse into the current one). No create affordance.
 */
export function GroupedLocationPicker({
  groups,
  value,
  onChange,
  availability,
  placeholder,
  className,
  disabled = false,
}: GroupedLocationPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const effectivePlaceholder = placeholder ?? t("procurement.locationPicker.placeholder");

  const selected = useMemo(() => {
    if (!value) return null;
    for (const group of groups) {
      if (group.projectId !== value.projectId) continue;
      const location = group.locations.find((loc) => loc.id === value.locationId);
      if (location) return { group, location };
    }
    return null;
  }, [groups, value]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (!disabled) setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-between", className)}
          disabled={disabled}
        >
          <span className="truncate text-left">
            {selected
              ? selected.group.isCurrent
                ? selected.location.name
                : `${selected.location.name} · ${selected.group.projectTitle}`
              : effectivePlaceholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] max-h-[360px] overflow-y-auto p-2" align="start">
        <div className="space-y-2">
          {groups.map((group) => (
            <div key={group.projectId} className="space-y-1">
              <p className="px-2 text-xs font-medium text-muted-foreground">
                {group.isCurrent
                  ? t("procurement.orderModal.thisProject", { project: group.projectTitle })
                  : group.projectTitle}
              </p>
              {group.locations.length === 0 ? (
                <p className="px-2 text-xs text-muted-foreground/70">
                  {t("procurement.orderModal.noLocations")}
                </p>
              ) : (
                group.locations.map((location) => {
                  const isSelected =
                    value?.projectId === group.projectId && value?.locationId === location.id;
                  const avail = availability?.get(`${group.projectId}:${location.id}`);
                  const isDisabled = avail?.disabled ?? false;
                  return (
                    <button
                      type="button"
                      key={`${group.projectId}:${location.id}`}
                      disabled={isDisabled}
                      onClick={() => {
                        if (isDisabled) return;
                        onChange({ projectId: group.projectId, locationId: location.id });
                        setOpen(false);
                      }}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        isDisabled ? "cursor-not-allowed opacity-50" : "hover:bg-muted/70",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-foreground">{location.name}</p>
                          {location.address && (
                            <p className="truncate text-xs text-muted-foreground">{location.address}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {avail && (
                            <span
                              className={cn(
                                "text-xs tabular-nums",
                                isDisabled ? "text-muted-foreground/70" : "text-muted-foreground",
                              )}
                            >
                              {avail.label}
                            </span>
                          )}
                          {isSelected && <Check className="h-4 w-4 text-success" />}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
