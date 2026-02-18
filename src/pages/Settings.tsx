import { EmptyState } from "@/components/EmptyState";
import { Settings as SettingsIcon } from "lucide-react";

export default function Settings() {
  return (
    <div className="p-sp-3">
      <EmptyState
        icon={SettingsIcon}
        title="Settings"
        description="Application settings and preferences will be configured here."
      />
    </div>
  );
}
