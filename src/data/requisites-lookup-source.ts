import { supabase } from "@/integrations/supabase/client";

// Client of the requisites-lookup edge function (rovno-db, task rovno#226).
// Any non-2xx answer (no key on the server, DaData down or over its limit) is
// "unavailable": the form then says hints are off and stays manual.

export type PartyStatus = "active" | "liquidating" | "liquidated" | "bankrupt" | "reorganizing" | "unknown";

export interface PartySuggestion {
  inn: string;
  kpp: string | null;
  name: string;
  address: string | null;
  type: "legal" | "individual";
  status: PartyStatus;
}

export interface PartyDetails {
  type: "legal" | "individual";
  legalName: string;
  inn: string;
  kpp: string | null;
  ogrn: string | null;
  legalAddress: string | null;
  addressIncomplete: boolean;
  addressHint: string | null;
  signatoryName: string | null;
  signatoryPosition: string | null;
  status: PartyStatus;
}

export interface BankSuggestion {
  bik: string;
  name: string;
  correspondentAccount: string | null;
}

export type LookupOutcome<T> = { status: "ok"; value: T } | { status: "unavailable" };

export const LOOKUP_MIN_QUERY = 3;

export type LookupInvoke = (body: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;

const defaultInvoke: LookupInvoke = (body) => supabase.functions.invoke("requisites-lookup", { body });

async function call<T>(invoke: LookupInvoke, body: Record<string, unknown>, pick: (data: Record<string, unknown>) => T): Promise<LookupOutcome<T>> {
  try {
    const { data, error } = await invoke(body);
    if (error || !data || typeof data !== "object" || (data as { ok?: unknown }).ok !== true) {
      return { status: "unavailable" };
    }
    return { status: "ok", value: pick(data as Record<string, unknown>) };
  } catch {
    return { status: "unavailable" };
  }
}

export function lookupParties(query: string, invoke: LookupInvoke = defaultInvoke) {
  return call(invoke, { kind: "party", query }, (data) => (data.suggestions as PartySuggestion[]) ?? []);
}

export function lookupPartyDetails(inn: string, kpp: string | null, invoke: LookupInvoke = defaultInvoke) {
  return call(invoke, { kind: "party_details", inn, kpp }, (data) => (data.party as PartyDetails | null) ?? null);
}

export function lookupBanks(query: string, invoke: LookupInvoke = defaultInvoke) {
  return call(invoke, { kind: "bank", query }, (data) => (data.suggestions as BankSuggestion[]) ?? []);
}
