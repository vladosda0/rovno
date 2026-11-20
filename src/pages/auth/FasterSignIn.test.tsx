import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import FasterSignIn from "@/pages/auth/FasterSignIn";
import { passkeyOfferPaused, passkeysSetUpHere } from "@/lib/passkey";

const { getSessionMock, registerPasskeyMock, updateMock, toastMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  registerPasskeyMock: vi.fn(),
  updateMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: getSessionMock, registerPasskey: registerPasskeyMock, passkey: { update: updateMock } } },
}));

vi.mock("@/hooks/use-toast", () => ({ toast: toastMock }));

const { passkeysOnMock } = vi.hoisted(() => ({ passkeysOnMock: vi.fn() }));
vi.mock("@/lib/passkey-availability", () => ({ passkeysEnabledOnServer: () => passkeysOnMock() ?? Promise.resolve(false) }));

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderAt(url = "/auth/faster?next=%2Fproject%2F7") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/auth/faster" element={<FasterSignIn />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FasterSignIn (frame 9)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal("PublicKeyCredential", {});
    getSessionMock.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    passkeysOnMock.mockResolvedValue(true);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("offers the setup with the texts of the mockup", async () => {
    renderAt();
    expect(await screen.findByRole("heading", { name: "Sign in faster" })).toBeInTheDocument();
    expect(screen.getByText("Set up sign-in with face or fingerprint, and next time you'll sign in without a password or a code from email.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Not now" })).toBeInTheDocument();
  });

  it("«Настроить» is the same setup as in Security, then next with the toast", async () => {
    registerPasskeyMock.mockResolvedValue({ data: { id: "pk-1", friendly_name: "Apple Passwords", created_at: "x" }, error: null });
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Set up" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/project/7"));
    expect(registerPasskeyMock).toHaveBeenCalled();
    expect(passkeysSetUpHere("u1")).toEqual(["pk-1"]);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: "Sign-in with face or fingerprint is set up" }));
  });

  it("a closed browser window returns to the offer as it was", async () => {
    registerPasskeyMock.mockResolvedValue({ data: null, error: { code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" } });
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Set up" }));
    expect(await screen.findByRole("button", { name: "Set up" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("where")).toBeNull();
  });

  it("«Не сейчас» goes on to next and pauses the offer", async () => {
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/project/7");
    expect(passkeyOfferPaused()).toBe(true);
  });

  it("opened by address while Auth has it off: straight on to next, nothing set up", async () => {
    passkeysOnMock.mockResolvedValue(false);
    renderAt();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/project/7"));
    expect(registerPasskeyMock).not.toHaveBeenCalled();
  });

  it("without a session goes to sign-in, keeping next", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });
    renderAt();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/auth/login?next=%2Fproject%2F7"));
  });
});
