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
  children?: React.ReactNode;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  tertiaryLabel,
  onTertiary,
  showCancel = true,
  children,
}: ConfirmModalProps) {
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
          {showCancel && <AlertDialogCancel onClick={onCancel}>{cancelLabel}</AlertDialogCancel>}
          <AlertDialogAction onClick={onConfirm} className="bg-accent text-accent-foreground hover:bg-accent/90">
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
