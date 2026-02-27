import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({ title, description, children, className }: SettingsSectionProps) {
  return (
    <div className={cn("space-y-sp-2", className)}>
      <div>
        <h2 className="text-body font-semibold text-foreground">{title}</h2>
        {description && <p className="text-caption text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}
