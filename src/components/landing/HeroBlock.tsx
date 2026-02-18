import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

interface HeroBlockProps {
  headline: string;
  subtext: string;
  primaryLabel: string;
  primaryTo: string;
  secondaryLabel: string;
  secondaryTo: string;
  children?: ReactNode;
}

export function HeroBlock({
  headline,
  subtext,
  primaryLabel,
  primaryTo,
  secondaryLabel,
  secondaryTo,
  children,
}: HeroBlockProps) {
  return (
    <section className="glass-elevated rounded-panel p-sp-6 text-center max-w-4xl mx-auto">
      <h1 className="text-h1 text-foreground mb-sp-2">{headline}</h1>
      <p className="text-body text-muted-foreground mb-sp-4 max-w-2xl mx-auto">{subtext}</p>
      <div className="flex items-center justify-center gap-sp-2 flex-wrap">
        <Button asChild size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Link to={primaryTo}>
            {primaryLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to={secondaryTo}>{secondaryLabel}</Link>
        </Button>
      </div>
      {children}
    </section>
  );
}
