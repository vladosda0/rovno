import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import AuthResetPassword from "@/pages/auth/AuthResetPassword";

const { getSessionMock, secondStepMock } = vi.hoisted(() => ({ getSessionMock: vi.fn(), secondStepMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession: getSessionMock, updateUser: vi.fn() } } }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("@/lib/mfa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mfa")>()),
  isSecondStepRequired: secondStepMock,
}));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderReset() {
  render(
    <MemoryRouter initialEntries={["/auth/reset-password"]}>
      <Routes>
        <Route path="/auth/reset-password" element={<AuthResetPassword />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AuthResetPassword and two-factor protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
  });

  it("a protected account passes the code from the app before the new password, and comes back here", async () => {
    secondStepMock.mockResolvedValue(true);
    renderReset();
    expect(await screen.findByTestId("where")).toHaveTextContent("/auth/mfa?next=%2Fauth%2Freset-password");
  });

  it("an account without protection gets the password form", async () => {
    secondStepMock.mockResolvedValue(false);
    renderReset();
    await waitFor(() => expect(screen.getAllByLabelText(/password/i).length).toBeGreaterThan(0));
    expect(screen.queryByTestId("where")).not.toBeInTheDocument();
  });
});
