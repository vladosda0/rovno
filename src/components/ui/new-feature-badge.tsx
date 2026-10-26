import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { badgeVariants } from "@/components/ui/badge";
import { markFeatureSeen, useAnyNewFeature, useNewFeature } from "@/lib/new-features";
import { cn } from "@/lib/utils";

/** The «Новое» pill next to a highlighted feature (rovno#274). */
export function NewFeatureBadge({ featureId, className }: { featureId: string; className?: string }) {
  const { t } = useTranslation();
  const isNew = useNewFeature(featureId);

  useEffect(() => {
    if (isNew) markFeatureSeen(featureId);
  }, [isNew, featureId]);

  if (!isNew) return null;
  return (
    <span className={cn(badgeVariants({ variant: "new" }), "shrink-0", className)}>{t("common.newBadge")}</span>
  );
}

/** A 6px dot on a section that holds an unopened feature. */
export function NewFeatureDot({ featureIds, className }: { featureIds: readonly string[]; className?: string }) {
  const { t } = useTranslation();
  const isNew = useAnyNewFeature(featureIds);
  const key = featureIds.join("|");
  const dotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Start the 30-day clock only once the dot is actually on screen: not while a CSS-hidden
    // nav holds it (HomeTabs on a phone), and not while it is scrolled out of the tab strip.
    const el = dotRef.current;
    if (!isNew || !el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      featureIds.forEach((id) => markFeatureSeen(id));
      observer.disconnect();
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, key]);

  if (!isNew) return null;
  return (
    <>
      <span ref={dotRef} aria-hidden="true" className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent", className)} />
      <span className="sr-only">{t("common.hasNew")}</span>
    </>
  );
}
