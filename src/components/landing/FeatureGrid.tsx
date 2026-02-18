import type { LucideIcon } from "lucide-react";

interface FeatureItem {
  icon: LucideIcon;
  title: string;
  text: string;
}

interface FeatureGridProps {
  features: FeatureItem[];
}

export function FeatureGrid({ features }: FeatureGridProps) {
  return (
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-sp-3 max-w-5xl mx-auto">
      {features.map((f) => (
        <div key={f.title} className="glass rounded-card p-sp-3 text-left">
          <f.icon className="h-6 w-6 text-accent mb-sp-1" />
          <h3 className="text-body font-semibold text-foreground mb-1">{f.title}</h3>
          <p className="text-body-sm text-muted-foreground">{f.text}</p>
        </div>
      ))}
    </section>
  );
}
