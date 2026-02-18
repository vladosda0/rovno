import { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="glass-modal rounded-modal p-sp-4 w-full max-w-md mx-auto">
      <div className="text-center mb-sp-3">
        <h2 className="text-h3 text-foreground">{title}</h2>
        <p className="text-body-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>
      <div className="space-y-sp-2">{children}</div>
      {footer && <div className="mt-sp-3">{footer}</div>}
    </div>
  );
}
