import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BETA_COUNTDOWN_ENABLED, BETA_END } from "@/data/beta-config";

export interface BetaRemaining {
  days: number;
  hours: number;
}

// Pure time math, exported for unit tests. Returns null once the deadline passes.
export function getBetaRemaining(end: Date, now: number = Date.now()): BetaRemaining | null {
  const ms = end.getTime() - now;
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  return { days, hours };
}

// Beta-end countdown for the pricing block. Renders nothing while disabled
// (phase 1c) or once the deadline has passed. Adds hours for urgency under 7 days.
export function BetaCountdown() {
  const { t } = useTranslation();
  const [remaining, setRemaining] = useState<BetaRemaining | null>(() =>
    BETA_COUNTDOWN_ENABLED ? getBetaRemaining(BETA_END) : null,
  );

  useEffect(() => {
    if (!BETA_COUNTDOWN_ENABLED) return;
    const id = window.setInterval(() => {
      setRemaining(getBetaRemaining(BETA_END));
    }, 60000);
    return () => window.clearInterval(id);
  }, []);

  if (!BETA_COUNTDOWN_ENABLED || !remaining) return null;

  const label =
    remaining.days < 7
      ? t("pricing.beta.countdownHours", { days: remaining.days, hours: remaining.hours })
      : t("pricing.beta.countdown", { days: remaining.days });

  return (
    <div className="rounded-pill border border-accent/30 bg-accent/10 px-sp-3 py-1.5 text-center text-body-sm font-medium text-accent">
      {label}
    </div>
  );
}
