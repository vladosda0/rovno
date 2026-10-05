import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type ShurikPose = "default" | "thinking" | "done" | "notice" | "money";
export type ShurikMotion = "still" | "wink" | "idle";

export const SHURIK_WINK_MS = 1000;
export const SHURIK_IDLE_WINK_PAUSE_MS = 6000;

const POSE_FILE: Record<ShurikPose, string> = {
  default: "/shurik/avatar.png",
  thinking: "/shurik/idea.png",
  done: "/shurik/wink-ok.png",
  notice: "/shurik/pointing.png",
  money: "/shurik/salute.png",
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches);

  useEffect(() => {
    const mq = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

interface ShurikProps {
  pose?: ShurikPose;
  /** `wink` plays once on mount; `idle` sways and winks for as long as it is mounted. */
  motion?: ShurikMotion;
  /** Side of the square box in px. The whole figure is fitted inside it. */
  size?: number;
  /** Set when the name is already written next to the figure, so it is not read out twice. */
  decorative?: boolean;
  className?: string;
}

export function Shurik({ pose = "default", motion = "still", size = 64, decorative = false, className }: ShurikProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const moves = motion !== "still" && !reducedMotion;
  const [winking, setWinking] = useState(motion === "wink" && moves);

  useEffect(() => {
    if (!moves || motion !== "idle" || winking) return;
    const timer = setTimeout(() => setWinking(true), SHURIK_IDLE_WINK_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [motion, moves, winking]);

  useEffect(() => {
    if (!winking) return;
    const timer = setTimeout(() => setWinking(false), SHURIK_WINK_MS);
    return () => clearTimeout(timer);
  }, [winking]);

  useEffect(() => {
    if (!moves) return;
    for (const file of new Set([POSE_FILE.done, POSE_FILE[pose]])) {
      new Image().src = file;
    }
  }, [moves, pose]);

  const showWink = winking && moves;

  return (
    <span
      className={cn("inline-flex shrink-0", moves && motion === "idle" && "animate-shurik-sway", className)}
      style={{ width: size, height: size }}
    >
      <img
        src={POSE_FILE[showWink ? "done" : pose]}
        alt={decorative ? "" : t("ai.shurik.name")}
        width={size}
        height={size}
        draggable={false}
        className={cn("h-full w-full object-contain select-none", showWink && "animate-shurik-pop")}
      />
    </span>
  );
}
