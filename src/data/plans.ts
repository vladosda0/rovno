// Subscription plan catalog mirrored from rovno-db
// (`supabase/functions/_shared/plans.ts`).
//
// Drift protection: rovno-db/scripts/verify-plans-sync.mjs compares this file
// against the backend copy on every CI run. Update both files together when
// changing prices or display names.

export interface PlanConfig {
  readonly display_name: string;
  readonly amount_kopecks: number;
}

export const PLANS: Readonly<Record<string, PlanConfig>> = {
  master: { display_name: "Мастер", amount_kopecks: 99000 },
  brigade: { display_name: "Бригада", amount_kopecks: 299000 },
};

export type PlanCode = keyof typeof PLANS;

export function isPlanCode(value: unknown): value is PlanCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PLANS, value);
}

export function getPlan(planCode: string): PlanConfig | null {
  if (!isPlanCode(planCode)) {
    return null;
  }
  return PLANS[planCode];
}
