import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import PromoRedeem from "@/pages/promo/Redeem";
import { toast } from "@/hooks/use-toast";
import { trackEvent } from "@/lib/analytics";
import {
  __unsafeResetRuntimeAuthForTests,
  __unsafeSetRuntimeAuthStateForTests,
} from "@/hooks/use-runtime-auth";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: rpcMock,
  },
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackEvent: vi.fn(),
}));

const PERMISSION_DENIED = {
  code: "42501",
  message: "permission denied for function redeem_promo_code",
  details: null,
  hint: null,
};

function LocationMarker() {
  const location = useLocation();
  return <div data-testid="location-marker">{`${location.pathname}${location.search}`}</div>;
}

function renderRedeem() {
  render(
    <MemoryRouter initialEntries={["/promo/redeem?code=rovno-2026"]}>
      <Routes>
        <Route path="/promo/redeem" element={<PromoRedeem />} />
        <Route path="*" element={<LocationMarker />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function submit() {
  const form = document.querySelector("form");
  if (!form) throw new Error("promo form not rendered");
  fireEvent.submit(form);
  await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("redeem_promo_code", { p_code: "ROVNO-2026" }));
}

describe("PromoRedeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    __unsafeSetRuntimeAuthStateForTests({
      status: "authenticated",
      session: null,
      user: null,
      profileId: "profile-1",
    });
  });

  afterEach(() => {
    __unsafeResetRuntimeAuthForTests();
    vi.restoreAllMocks();
  });

  it("routes a session the server rejects back through signup with the code preserved", async () => {
    rpcMock.mockResolvedValue({ data: null, error: PERMISSION_DENIED, status: 401 });

    renderRedeem();
    await submit();

    await waitFor(() => {
      expect(screen.getByTestId("location-marker").textContent).toBe(
        "/auth/signup?next=%2Fpromo%2Fredeem%3Fcode%3DROVNO-2026",
      );
    });
    expect(toast).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith("promo_redeem_attempted", { result: "unauthenticated" });
  });

  it("keeps the network toast for a failure that is not an auth rejection", async () => {
    rpcMock.mockResolvedValue({ data: null, error: PERMISSION_DENIED, status: 403 });

    renderRedeem();
    await submit();

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }));
    });
    expect(screen.queryByTestId("location-marker")).toBeNull();
  });
});
