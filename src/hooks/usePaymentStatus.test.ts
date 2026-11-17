import { describe, expect, it } from "vitest";
import {
  isPaidPaymentIntent,
  isSettledPaymentIntent,
  isTerminalPaymentStatus,
  paymentIntentPollInterval,
} from "@/hooks/usePaymentStatus";

// The complete payment_intents.status domain (payment_intents_status_check).
const DOMAIN: ReadonlyArray<[string, boolean]> = [
  ["pending", false],
  ["new", false],
  ["authorized", false],
  ["confirmed", true],
  ["rejected", true],
  ["cancelled", true],
  ["refunded", true],
  ["partial_refund", true],
];

describe("isTerminalPaymentStatus", () => {
  it.each(DOMAIN)("%s -> terminal: %s", (status, terminal) => {
    expect(isTerminalPaymentStatus(status)).toBe(terminal);
  });

  it("treats a missing or unknown status as non-terminal", () => {
    expect(isTerminalPaymentStatus(undefined)).toBe(false);
    expect(isTerminalPaymentStatus(null)).toBe(false);
    expect(isTerminalPaymentStatus("")).toBe(false);
    expect(isTerminalPaymentStatus("CONFIRMED")).toBe(false);
  });
});

// status x confirmed_at over the whole domain: [status, confirmed_at set, paid, settled].
const AT = "2026-11-12T15:20:26Z";
const INTENTS: ReadonlyArray<[string, string | null, boolean, boolean]> = [
  ["pending", null, false, false],
  ["new", null, false, false],
  ["authorized", null, false, false],
  ["confirmed", AT, true, true],
  ["confirmed", null, true, true],
  ["rejected", null, false, true],
  ["cancelled", null, false, true],
  ["refunded", AT, false, true],
  ["refunded", null, false, true],
  ["partial_refund", AT, true, true],
  ["partial_refund", null, false, false],
];

describe("isPaidPaymentIntent / isSettledPaymentIntent", () => {
  it.each(INTENTS)("%s (confirmed_at %s) -> paid %s, settled %s", (status, confirmed_at, paid, settled) => {
    expect(isPaidPaymentIntent({ status, confirmed_at })).toBe(paid);
    expect(isSettledPaymentIntent({ status, confirmed_at })).toBe(settled);
    // The poll stops exactly on a settled row: an unconfirmed partial_refund keeps it alive.
    expect(paymentIntentPollInterval({ status, confirmed_at })).toBe(settled ? false : 4000);
  });

  it("keeps polling while there is no row yet", () => {
    expect(paymentIntentPollInterval(undefined)).toBe(4000);
    expect(paymentIntentPollInterval(null)).toBe(4000);
  });

  it("a missing row is neither paid nor settled", () => {
    for (const row of [undefined, null, {}]) {
      expect(isPaidPaymentIntent(row)).toBe(false);
      expect(isSettledPaymentIntent(row)).toBe(false);
    }
  });
});
