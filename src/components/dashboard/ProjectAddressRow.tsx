import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, MapPin, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddressSuggestInput } from "@/components/address/AddressSuggestInput";
import { useToast } from "@/hooks/use-toast";
import { normalizeProjectAddress } from "@/data/workspace-source";

interface ProjectAddressRowProps {
  address: string | undefined;
  canEdit: boolean;
  onSave: (address: string | null) => Promise<unknown>;
}

/**
 * The pin row on the project dashboard (rovno#236, frames 1-4, 7, 8): the owner
 * adds or changes the address in place; everyone else reads and copies it.
 */
export function ProjectAddressRow({ address, canEdit, onSave }: ProjectAddressRowProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(address ?? "");
    setEditing(true);
  };

  const cancel = () => {
    if (saving) return;
    setEditing(false);
  };

  const save = async (raw: string) => {
    if (saving) return;
    const next = normalizeProjectAddress(raw);
    if (next === normalizeProjectAddress(address)) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
      toast({ title: t(next ? "projectDashboard.addressSaved" : "projectDashboard.addressRemoved") });
    } catch {
      setDraft(raw);
      toast({
        title: t("projectDashboard.addressSaveFailed"),
        description: t("projectDashboard.addressSaveFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast({ title: t("projectDashboard.copied") });
    } catch {
      toast({ title: t("projectDashboard.copyFailed"), variant: "destructive" });
    }
  };

  if (editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-start gap-1.5">
          <AddressSuggestInput
            id="project-address"
            className="flex-1 min-w-0"
            inputClassName="h-8"
            value={draft}
            readOnly={saving}
            enterSavesTyped
            autoFocus
            ariaLabel={t("projectDashboard.editAddress")}
            placeholder={t("projectDashboard.addressPlaceholder")}
            onChange={(value) => {
              if (!saving) setDraft(value);
            }}
            onPick={(value) => {
              if (saving) return;
              setDraft(value);
              void save(value);
            }}
            onInputKeyDown={(event) => {
              if (event.key === "Enter") {
                if (event.nativeEvent.isComposing) return;
                event.preventDefault();
                void save(draft);
              } else if (event.key === "Escape") {
                event.preventDefault();
                cancel();
              }
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 shrink-0"
            disabled={saving}
            onClick={() => void save(draft)}
            aria-label={t("common.save")}
          >
            <Check className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 shrink-0"
            disabled={saving}
            onClick={cancel}
            aria-label={t("common.cancel")}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">{t("projectDashboard.addressKeysHint")}</p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-panel bg-muted/40 px-2 py-1.5">
      <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      {address ? (
        <>
          <span className="text-caption text-foreground flex-1 truncate">{address}</span>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleCopy} aria-label={t("projectDashboard.copyAddress")}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          {canEdit ? (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={startEdit} aria-label={t("projectDashboard.editAddress")}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </>
      ) : canEdit ? (
        <button
          type="button"
          className="text-caption font-medium text-accent underline underline-offset-2 decoration-accent/35 hover:decoration-accent"
          onClick={startEdit}
        >
          {t("projectDashboard.addAddress")}
        </button>
      ) : (
        <span className="text-caption text-muted-foreground">{t("projectDashboard.addressNotSet")}</span>
      )}
    </div>
  );
}
