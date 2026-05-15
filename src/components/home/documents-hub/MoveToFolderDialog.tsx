import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { OrgDocumentFolder } from "@/hooks/use-org-document-folders";

interface MoveToFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folders: OrgDocumentFolder[];
  currentFolderId: string | null;
  onMove: (folderId: string | null) => void;
}

const NONE_VALUE = "__none__";

export function MoveToFolderDialog({ open, onOpenChange, folders, currentFolderId, onMove }: MoveToFolderDialogProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string>(currentFolderId ?? NONE_VALUE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("home.documentsHub.folders.moveToFolder")}</DialogTitle>
        </DialogHeader>
        <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2 max-h-72 overflow-y-auto">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value={NONE_VALUE} id="folder-none" />
            <Label htmlFor="folder-none">{t("home.documentsHub.folders.noFolder")}</Label>
          </div>
          {folders.map((folder) => (
            <div key={folder.id} className="flex items-center space-x-2">
              <RadioGroupItem value={folder.id} id={`folder-${folder.id}`} />
              <Label htmlFor={`folder-${folder.id}`}>{folder.name}</Label>
            </div>
          ))}
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            onClick={() => onMove(selected === NONE_VALUE ? null : selected)}
          >
            {t("home.documentsHub.folders.move")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
