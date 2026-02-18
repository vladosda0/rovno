import { Button } from "@/components/ui/button";
import { Check, X, GitBranch } from "lucide-react";

interface ActionBarProps {
  onConfirm: () => void;
  onCancel: () => void;
  onNewVersion?: () => void;
  showNewVersion?: boolean;
  disabled?: boolean;
}

export function ActionBar({ onConfirm, onCancel, onNewVersion, showNewVersion, disabled }: ActionBarProps) {
  return (
    <div className="flex items-center gap-1.5 pt-1">
      <Button
        size="sm"
        onClick={onConfirm}
        disabled={disabled}
        className="h-7 px-3 text-xs bg-accent text-accent-foreground hover:bg-accent/90"
      >
        <Check className="h-3.5 w-3.5 mr-1" />
        Confirm
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={onCancel}
        disabled={disabled}
        className="h-7 px-3 text-xs"
      >
        <X className="h-3.5 w-3.5 mr-1" />
        Cancel
      </Button>
      {showNewVersion && onNewVersion && (
        <Button
          size="sm"
          variant="outline"
          onClick={onNewVersion}
          disabled={disabled}
          className="h-7 px-3 text-xs ml-auto"
        >
          <GitBranch className="h-3.5 w-3.5 mr-1" />
          New version
        </Button>
      )}
    </div>
  );
}
