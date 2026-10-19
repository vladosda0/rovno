import { useState, useEffect } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Shurik } from "@/components/ai/Shurik";

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
  const { t } = useTranslation();
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

  const working = completedCount < steps.length;

  return (
    <div className="glass rounded-card p-2.5 w-full flex items-center gap-2.5">
      <Shurik pose={working ? "thinking" : "done"} decorative />
      <div className="min-w-0 flex-1 space-y-0.5">
        <span className="text-[13px] font-semibold text-foreground">
          {working ? t("ai.workLog.working") : t("ai.workLog.done")}
        </span>
        {steps.map((step, i) => {
          const done = i < completedCount;
          const active = i === completedCount;
          return (
            <div key={i} className="flex items-center gap-1.5 text-[11px] leading-4">
              {done ? (
                <CheckCircle2 className="h-3 w-3 text-success shrink-0" />
              ) : active ? (
                <Loader2 className="h-3 w-3 text-accent shrink-0 animate-spin" />
              ) : (
                <div className="h-3 w-3 shrink-0 rounded-full border border-border" />
              )}
              <span className={done ? "text-muted-foreground" : active ? "text-foreground" : "text-muted-foreground/50"}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ActiveWorkLogProps {
  log: { id: string; steps: string[]; holdFinalStep?: boolean };
}

/** The work log of the run in progress. A new run remounts it, so it starts from the first step. */
export function ActiveWorkLog({ log }: ActiveWorkLogProps) {
  return <WorkLog key={log.id} steps={log.steps} holdFinalStep={Boolean(log.holdFinalStep)} />;
}
