import { useCallback, useEffect, useState } from "react";
import { type PartyDetails, lookupPartyDetails } from "@/data/requisites-lookup-source";
import {
  type PartyCheck,
  type PartyStatusChecks,
  isCheckableInn,
  useCheckAfterPause,
  usePartyStatusChecks,
} from "@/hooks/use-party-status";

export interface CardRegistry {
  check: PartyCheck | null;
  details: PartyDetails | null;
  checks: PartyStatusChecks;
}

/**
 * One registry request per INN while the card is on screen; nothing is stored.
 * `afterPause` waits for a pause in typing, for an INN being entered in the form.
 */
export function useCardRegistry(inn: string | null | undefined, afterPause = false): CardRegistry {
  const [details, setDetails] = useState<Record<string, PartyDetails>>({});
  const lookup = useCallback<typeof lookupPartyDetails>(async (value, kpp) => {
    const outcome = await lookupPartyDetails(value, kpp);
    if (outcome.status === "ok" && outcome.value) {
      const found = outcome.value;
      setDetails((current) => ({ ...current, [value.trim()]: found }));
    }
    return outcome;
  }, []);
  const checks = usePartyStatusChecks(lookup);
  const { check } = checks;

  useEffect(() => {
    if (!afterPause) check(inn);
  }, [afterPause, check, inn]);
  useCheckAfterPause(checks, inn, afterPause);

  return { check: checks.get(inn), details: isCheckableInn(inn) ? details[inn.trim()] ?? null : null, checks };
}
