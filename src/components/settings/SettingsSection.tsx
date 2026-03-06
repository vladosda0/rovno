import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingsSection({ title, description, children, className }: SettingsSectionProps) {
  return (
    <section className={cn("rounded-card border border-border bg-card/70 p-sp-2 space-y-sp-2", className)}>
      <div className="space-y-0.5">
        <h2 className="text-body font-semibold text-foreground">{title}</h2>
        {description && <p className="text-caption text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}
