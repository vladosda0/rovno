import { describe, expect, it } from "vitest";
import { isTerminalPaymentStatus } from "@/hooks/usePaymentStatus";

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
