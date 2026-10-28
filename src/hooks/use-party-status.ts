import { useCallback, useEffect, useRef, useState } from "react";
import {
  type PartyDetails,
  type PartyStatus,
  lookupPartyDetails,
} from "@/data/requisites-lookup-source";

// Registry status of an organization by INN (rovno#243). One request per INN
// while the window or form is open; DaData allows lookups only for what a
// person entered by hand, so nothing is re-checked in the background and
// nothing is stored.

export type PartyCheck =
  | { phase: "checking" }
  | { phase: "found"; status: PartyStatus; type: "legal" | "individual"; name: string; checkedAt: string }
  | { phase: "notFound" }
  | { phase: "unavailable" };

const INN_PATTERN = /^\d{10}(\d{2})?$/;

export function isCheckableInn(inn: string | null | undefined): inn is string {
  return typeof inn === "string" && INN_PATTERN.test(inn.trim());
}

function foundFrom(details: PartyDetails): PartyCheck {
  return {
    phase: "found",
    status: details.status,
    type: details.type,
    name: details.legalName,
    checkedAt: new Date().toISOString(),
  };
}

export interface PartyStatusChecks {
  /** Starts a check unless this INN was already asked about. */
  check: (inn: string | null | undefined) => void;
  /** Records a status from party details the caller already fetched. */
  seed: (details: PartyDetails) => void;
  get: (inn: string | null | undefined) => PartyCheck | null;
  /** Forgets every answer: the next open of the window asks again. */
  reset: () => void;
}

export function usePartyStatusChecks(lookupDetails: typeof lookupPartyDetails = lookupPartyDetails): PartyStatusChecks {
  const [checks, setChecks] = useState<Record<string, PartyCheck>>({});
  const asked = useRef(new Set<string>());
  // Only the latest request for an INN may write its answer.
  const latest = useRef(new Map<string, number>());
  const requestSeq = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = useCallback((raw: string | null | undefined) => {
    if (!isCheckableInn(raw)) return;
    const inn = raw.trim();
    if (asked.current.has(inn)) return;
    asked.current.add(inn);
    const id = ++requestSeq.current;
    latest.current.set(inn, id);
    setChecks((current) => ({ ...current, [inn]: { phase: "checking" } }));
    void lookupDetails(inn, null).then((outcome) => {
      if (!mounted.current || latest.current.get(inn) !== id) return;
      const next: PartyCheck = outcome.status === "unavailable"
        ? { phase: "unavailable" }
        : outcome.value ? foundFrom(outcome.value) : { phase: "notFound" };
      setChecks((current) => ({ ...current, [inn]: next }));
    });
  }, [lookupDetails]);

  const seed = useCallback((details: PartyDetails) => {
    const inn = details.inn.trim();
    asked.current.add(inn);
    latest.current.delete(inn);
    setChecks((current) => ({ ...current, [inn]: foundFrom(details) }));
  }, []);

  const get = useCallback(
    (raw: string | null | undefined) => (isCheckableInn(raw) ? checks[raw.trim()] ?? null : null),
    [checks],
  );

  const reset = useCallback(() => {
    asked.current = new Set();
    latest.current.clear();
    setChecks({});
  }, []);

  return { check, seed, get, reset };
}

/** Waits for a pause in typing, then checks (rovno#243: 500 ms). */
export const PARTY_CHECK_PAUSE_MS = 500;

export function useCheckAfterPause(checks: PartyStatusChecks, inn: string | null | undefined, enabled = true) {
  const { check } = checks;
  useEffect(() => {
    if (!enabled || !isCheckableInn(inn)) return;
    const timer = window.setTimeout(() => check(inn), PARTY_CHECK_PAUSE_MS);
    return () => window.clearTimeout(timer);
  }, [check, inn, enabled]);
}
