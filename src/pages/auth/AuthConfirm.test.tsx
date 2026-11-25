import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AuthConfirm from "@/pages/auth/AuthConfirm";

const { verifyOtpMock, secondStepMock, onboardedMock } = vi.hoisted(() => ({
  verifyOtpMock: vi.fn(),
  secondStepMock: vi.fn(),
  onboardedMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { verifyOtp: verifyOtpMock } } }));
vi.mock("@/lib/auth-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-state")>()),
  hasCompletedOnboarding: onboardedMock,
}));
vi.mock("@/lib/mfa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mfa")>()),
  isSecondStepRequired: secondStepMock,
}));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderConfirm() {
  render(
    <MemoryRouter initialEntries={["/auth/confirm?token_hash=th1&type=magiclink"]}>
      <Routes>
        <Route path="/auth/confirm" element={<AuthConfirm />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthConfirm and two-factor protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyOtpMock.mockResolvedValue({ data: { user: { id: "u1" }, session: { user: { id: "u1" } } }, error: null });
    onboardedMock.mockResolvedValue(true);
  });

  it("a protected account passes the code from the app before anything is read", async () => {
    secondStepMock.mockResolvedValue(true);
    renderConfirm();
    expect(await screen.findByTestId("where")).toHaveTextContent("/auth/mfa?next=%2Fhome");
    expect(onboardedMock).not.toHaveBeenCalled();
  });

  it("without protection the person goes home as before", async () => {
    secondStepMock.mockResolvedValue(false);
    renderConfirm();
    expect(await screen.findByTestId("where")).toHaveTextContent("/home");
  });
});
