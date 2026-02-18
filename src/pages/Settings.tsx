import { Settings as SettingsIcon } from "lucide-react";
import { AuthSimulator } from "@/components/settings/AuthSimulator";

export default function Settings() {
  return (
    <div className="p-sp-3 space-y-sp-3 max-w-2xl">
      <div>
        <h1 className="text-h3 text-foreground flex items-center gap-2">
          <SettingsIcon className="h-5 w-5" />
          Settings
        </h1>
        <p className="text-body-sm text-muted-foreground mt-1">Application settings and preferences.</p>
      </div>

      {/* Dev-only Auth Simulator */}
      <AuthSimulator />
    </div>
  );
}
