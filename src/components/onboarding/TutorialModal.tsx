import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useHasSeenTutorial,
  useMarkTutorialSeen,
  type TutorialKey,
} from "@/hooks/use-tutorial-state";
import { useTranslation } from "react-i18next";

interface TutorialStep {
  titleKey: string;
  descriptionKey: string;
  icon?: React.ReactNode;
  /** Optional richer visual rendered above the title (replaces the icon bubble when present). */
  visual?: React.ReactNode;
}

interface TutorialModalProps {
  tutorialKey: TutorialKey;
  steps: TutorialStep[];
  onDone?: () => void;
  /** When false, the modal waits for this to become true before auto-opening. Default: true. */
  shouldOpen?: boolean;
  /** Delay before auto-open (ms). Default: 600. */
  openDelayMs?: number;
}

export function TutorialModal({
  tutorialKey,
  steps,
  onDone,
  shouldOpen = true,
  openDelayMs = 600,
}: TutorialModalProps) {
  const { t } = useTranslation();
  const hasSeen = useHasSeenTutorial(tutorialKey);
  const markSeen = useMarkTutorialSeen();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [stepKey, setStepKey] = useState(0);

  useEffect(() => {
    if (!hasSeen && shouldOpen) {
      const timer = setTimeout(() => setOpen(true), openDelayMs);
      return () => clearTimeout(timer);
    }
  }, [hasSeen, shouldOpen, openDelayMs]);

  async function handleClose() {
    await markSeen(tutorialKey);
    setOpen(false);
    onDone?.();
  }

  function handleNext() {
    setStep((s) => s + 1);
    setStepKey((k) => k + 1);
  }

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const isFirst = step === 0;

  if (!current) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) void handleClose();
      }}
    >
      <DialogContent className="max-w-sm">
        <div key={stepKey} className="transition-opacity duration-200 animate-in fade-in">
          <DialogHeader className="items-center text-center">
            {current.visual ? (
              <div
                className={`mb-4 flex w-full items-center justify-center rounded-panel bg-accent/5 border border-accent/15 px-sp-2 py-sp-2 ${
                  isFirst ? "animate-pulse" : ""
                }`}
              >
                {current.visual}
              </div>
            ) : current.icon ? (
              <div
                className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 ${
                  isFirst ? "animate-pulse" : ""
                }`}
              >
                {current.icon}
              </div>
            ) : null}
            <DialogTitle className="text-center">{t(current.titleKey)}</DialogTitle>
            <DialogDescription className="text-body-sm text-muted-foreground text-center leading-relaxed">
              {t(current.descriptionKey)}
            </DialogDescription>
          </DialogHeader>
        </div>

        {steps.length > 1 && (
          <div className="flex justify-center gap-1.5 py-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-6 bg-accent" : "w-2 bg-muted"
                }`}
              />
            ))}
          </div>
        )}

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => void handleClose()}
          >
            {t("tutorial.skip")}
          </Button>
          {isLast ? (
            <Button
              onClick={() => void handleClose()}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {t("tutorial.gotIt")}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {t("tutorial.next")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
