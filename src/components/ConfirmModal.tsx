import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "react-i18next";

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  tertiaryLabel?: string;
  onTertiary?: () => void;
  showCancel?: boolean;
  confirmDisabled?: boolean;
  confirmDisabledTooltip?: string;
  children?: React.ReactNode;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  tertiaryLabel,
  onTertiary,
  showCancel = true,
  confirmDisabled = false,
  confirmDisabledTooltip,
  children,
}: ConfirmModalProps) {
  const { t } = useTranslation();
  const resolvedConfirm = confirmLabel ?? t("confirmModal.defaults.confirm");
  const resolvedCancel = cancelLabel ?? t("confirmModal.defaults.cancel");
  const confirmButton = (
    <AlertDialogAction
      onClick={onConfirm}
      disabled={confirmDisabled}
      className="bg-accent text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {resolvedConfirm}
    </AlertDialogAction>
  );
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border border-border shadow-xl rounded-modal">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          {tertiaryLabel && onTertiary && (
            <Button variant="outline" onClick={onTertiary} className="mr-auto">
              {tertiaryLabel}
            </Button>
          )}
          {showCancel && <AlertDialogCancel onClick={onCancel}>{resolvedCancel}</AlertDialogCancel>}
          {confirmDisabled && confirmDisabledTooltip ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{confirmButton}</span>
              </TooltipTrigger>
              <TooltipContent>{confirmDisabledTooltip}</TooltipContent>
            </Tooltip>
          ) : (
            confirmButton
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
