import { useState, useEffect } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

interface WorkLogProps {
  steps: string[];
  onComplete?: () => void;
  speed?: number;
  /**
   * When true, advances through steps with the timer but keeps the last step active (spinner)
   * until this component unmounts. Use for real async work (e.g. hosted ai-inference) so the UI
   * never shows “Done” before the request finishes.
   */
  holdFinalStep?: boolean;
}

export function WorkLog({ steps, onComplete, speed = 600, holdFinalStep = false }: WorkLogProps) {
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    const maxTimedCount = holdFinalStep ? Math.max(0, steps.length - 1) : steps.length;
    if (completedCount >= maxTimedCount) {
      if (!holdFinalStep && completedCount >= steps.length) {
        onComplete?.();
      }
      return;
    }
    const timer = setTimeout(() => setCompletedCount((c) => c + 1), speed);
    return () => clearTimeout(timer);
  }, [completedCount, steps.length, speed, onComplete, holdFinalStep]);

  return (
    <div className="glass rounded-card p-2.5 space-y-1 w-full">
      <span className="text-caption font-semibold text-muted-foreground">
        {completedCount < steps.length ? "Working…" : "Done"}
      </span>
      {steps.map((step, i) => {
        const done = i < completedCount;
        const active = i === completedCount;
        return (
          <div key={i} className="flex items-center gap-2 text-caption py-0.5">
            {done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
            ) : active ? (
              <Loader2 className="h-3.5 w-3.5 text-accent shrink-0 animate-spin" />
            ) : (
              <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
            )}
            <span className={done ? "text-muted-foreground" : active ? "text-foreground" : "text-muted-foreground/50"}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}