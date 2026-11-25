// Interface names of the subscription plans (site-redesign step 1.4).
//
// The catalog in `./plans.ts` is mirrored from rovno-db and checked by
// rovno-db/scripts/verify-plans-sync.mjs; the backend also sends its
// `display_name` to the bank (tbank-init-payment, payment ring 1). So the free
// plan keeps `display_name: "Бесплатно"` there, and the interface renames it
// here: Vlad, 2026-11-23, «"Старт" вместо "Бесплатно" — везде», with the price
// next to it still reading «Бесплатно».
import { PLANS } from "@/data/plans";

const INTERFACE_NAMES: Readonly<Record<string, string>> = {
  free: "Старт",
};

/** The name a person sees for a plan code; unknown codes fall back to the code. */
export function planDisplayName(planCode: string): string {
  return INTERFACE_NAMES[planCode] ?? PLANS[planCode]?.display_name ?? planCode;
}

/** The price label of the free plan, as the catalog names it. */
export function planPriceLabel(planCode: string): string | null {
  const plan = PLANS[planCode];
  if (!plan) return null;
  return plan.amount_kopecks === 0 ? PLANS.free.display_name : null;
}
