import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import { syncCardBinding } from "@/lib/card-binding-sync";

describe("syncCardBinding", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("calls the reconcile function and reports a changed card", async () => {
    invoke.mockResolvedValue({ data: { checked: 1, activated: 1, card_changed: true }, error: null });
    await expect(syncCardBinding()).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith("tbank-reconcile-card-binding", { body: {} });
  });

  it("reports no change when nothing was activated", async () => {
    invoke.mockResolvedValue({ data: { checked: 2, activated: 0, card_changed: false }, error: null });
    await expect(syncCardBinding()).resolves.toBe(false);
  });

  it("is false, never a throw, when the backend answers with an error", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("HTTP 404") });
    await expect(syncCardBinding()).resolves.toBe(false);
  });

  it("is false when the backend answers with an error, whatever body came with it", async () => {
    invoke.mockResolvedValue({ data: { card_changed: true }, error: new Error("HTTP 500") });
    await expect(syncCardBinding()).resolves.toBe(false);
  });

  it("is false, never a throw, when the call itself fails", async () => {
    invoke.mockRejectedValue(new Error("network down"));
    await expect(syncCardBinding()).resolves.toBe(false);
  });

  it("is false for a body it does not recognise", async () => {
    for (const data of [null, "ok", { card_changed: "true" }, {}]) {
      invoke.mockResolvedValue({ data, error: null });
      await expect(syncCardBinding()).resolves.toBe(false);
    }
  });
});
