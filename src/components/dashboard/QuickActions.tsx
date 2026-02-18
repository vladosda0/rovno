import { Button } from "@/components/ui/button";
import { Plus, FileText, ShoppingCart, Camera } from "lucide-react";

interface Props {
  canCreate: boolean;
}

export function QuickActions({ canCreate }: Props) {
  if (!canCreate) return null;
  return (
    <div className="glass-elevated rounded-card p-sp-2 flex items-center gap-2 flex-wrap">
      <span className="text-caption text-muted-foreground mr-auto">Quick actions</span>
      <Button size="sm" variant="outline" className="text-caption h-7">
        <Plus className="h-3 w-3 mr-1" /> Task
      </Button>
      <Button size="sm" variant="outline" className="text-caption h-7">
        <FileText className="h-3 w-3 mr-1" /> Document
      </Button>
      <Button size="sm" variant="outline" className="text-caption h-7">
        <ShoppingCart className="h-3 w-3 mr-1" /> Procurement
      </Button>
      <Button size="sm" variant="outline" className="text-caption h-7">
        <Camera className="h-3 w-3 mr-1" /> Photo
      </Button>
    </div>
  );
}
