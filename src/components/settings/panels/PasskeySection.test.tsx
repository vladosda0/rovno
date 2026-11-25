import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PasskeySection } from "@/components/settings/panels/PasskeySection";

const { auth, toastMock } = vi.hoisted(() => ({
  auth: {
    registerPasskey: vi.fn(),
    passkey: { list: vi.fn(), update: vi.fn(), delete: vi.fn() },
    mfa: { getAuthenticatorAssuranceLevel: vi.fn(), listFactors: vi.fn(), challengeAndVerify: vi.fn() },
  },
  toastMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  toast: toastMock,
}));

const APPLE = { id: "k1", friendly_name: "Apple Passwords", created_at: "2026-11-16T10:00:00Z" };
const YANDEX = { id: "k2", friendly_name: "Яндекс Браузер · Windows", created_at: "2026-11-16T11:00:00Z" };

function renderSection() {
  return render(<PasskeySection userId="u1" />);
}

const row = (name: string) => within(screen.getByRole("group", { name }));

describe("PasskeySection (frames 5-7)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal("PublicKeyCredential", {});
    auth.passkey.list.mockResolvedValue({ data: [], error: null });
    auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("empty: «Не настроено» and «Настроить на этом устройстве», under the section title and description", async () => {
    renderSection();
    expect(screen.getByRole("heading", { name: "Sign-in with face or fingerprint" })).toBeInTheDocument();
    expect(screen.getByText("No password or code from email: your face, your fingerprint or the PIN of your phone or computer.")).toBeInTheDocument();
    expect(await screen.findByText("Not set up")).toBeInTheDocument();
    expect(screen.getByText("Set it up on this device and sign in without a password or a code from email.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up on this device" })).toBeInTheDocument();
  });

  it("setup: the browser window, then the row, the toast and «Этот браузер»", async () => {
    auth.registerPasskey.mockResolvedValue({ data: APPLE, error: null });
    renderSection();
    auth.passkey.list.mockResolvedValue({ data: [APPLE], error: null });
    fireEvent.click(await screen.findByRole("button", { name: "Set up on this device" }));
    const apple = await screen.findByRole("group", { name: "Пароли Apple" });
    expect(within(apple).getByText("This browser")).toBeInTheDocument();
    expect(within(apple).getByText("Set up November 16, 2026")).toBeInTheDocument();
    expect(within(apple).getByText("Last sign-in: not used yet")).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Sign-in with face or fingerprint is set up",
      description: "Next time, sign in without a password or a code from email.",
    });
  });

  it("the list: names by the dictionary, two of one store numbered, «Этот браузер» only for this one", async () => {
    localStorage.setItem("rovno.passkeys.v1", JSON.stringify({ here: [{ userId: "u1", passkeyId: "k3" }], gone: [] }));
    auth.passkey.list.mockResolvedValue({
      data: [
        { id: "k3", friendly_name: "Google Password Manager", created_at: "2026-11-17T10:00:00Z", last_used_at: "2026-11-18T09:05:00Z" },
        { id: "k4", friendly_name: "Google Password Manager", created_at: "2026-11-18T10:00:00Z" },
        YANDEX,
      ],
      error: null,
    });
    renderSection();
    expect(await screen.findByRole("group", { name: "Менеджер паролей Google" })).toBeInTheDocument();
    expect(row("Менеджер паролей Google").getByText("This browser")).toBeInTheDocument();
    expect(row("Менеджер паролей Google 2").queryByText("This browser")).toBeNull();
    expect(row("Яндекс Браузер · Windows").getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(row("Яндекс Браузер · Windows").getByRole("button", { name: "Turn off" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up on this device" })).toBeInTheDocument();
    expect(screen.queryByText("Not set up")).toBeNull();
  });

  it("rename in the row, up to 60 characters", async () => {
    auth.passkey.list.mockResolvedValue({ data: [YANDEX], error: null });
    auth.passkey.update.mockResolvedValue({ data: {}, error: null });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const field = screen.getByLabelText("Device name");
    expect(field).toHaveAttribute("maxlength", "60");
    fireEvent.change(field, { target: { value: "Рабочий ноутбук" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("group", { name: "Рабочий ноутбук" })).toBeInTheDocument();
    expect(auth.passkey.update).toHaveBeenCalledWith({ passkeyId: "k2", friendlyName: "Рабочий ноутбук" });
    expect(toastMock).toHaveBeenCalledWith({ title: "Name saved" });
  });

  it("turn off asks in the row, warns about the last device, then removes it", async () => {
    auth.passkey.list.mockResolvedValue({ data: [APPLE], error: null });
    auth.passkey.delete.mockResolvedValue({ data: null, error: null });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    expect(screen.getByText("Turn off “Пароли Apple”?")).toBeInTheDocument();
    expect(screen.getByText(/This is the last device\. After this, sign in with your password or a code from email\./)).toBeInTheDocument();
    expect(screen.getByText(/delete the passkey for localhost in the passwords/)).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "Turn off" }).at(-1)!;
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.queryByRole("group", { name: "Пароли Apple" })).toBeNull());
    expect(auth.passkey.delete).toHaveBeenCalledWith({ passkeyId: "k1" });
    expect(toastMock).toHaveBeenCalledWith({ title: "Turned off", description: "You can no longer sign in with this device." });
    expect(await screen.findByText("Not set up")).toBeInTheDocument();
  });

  it.each([
    [{ code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY" }, "Not set up: the window was closed or the time ran out. Try again."],
    [{ code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED" }, "Sign-in with face or fingerprint is already set up on this device."],
  ])("setup refusal %o is said in the row", async (error, text) => {
    auth.registerPasskey.mockResolvedValue({ data: null, error });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Set up on this device" }));
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("a browser without WebAuthn: advice instead of the button", async () => {
    vi.unstubAllGlobals();
    renderSection();
    expect(await screen.findByText("This browser can't sign in with face or fingerprint")).toBeInTheDocument();
    expect(screen.getByText("Open Rovno in the latest Safari, Chrome, Yandex Browser or Edge.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Set up on this device" })).toBeNull();
  });

  describe("signed in by face with the protection on (frame 6, left)", () => {
    beforeEach(() => {
      auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null });
      auth.mfa.listFactors.mockResolvedValue({ data: { all: [{ id: "f1", factor_type: "totp", status: "verified", created_at: "x" }] }, error: null });
      auth.mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    });

    it("the code from the app comes before the setup", async () => {
      auth.registerPasskey.mockResolvedValue({ data: APPLE, error: null });
      renderSection();
      fireEvent.click(await screen.findByRole("button", { name: "Set up on this device" }));
      expect(await screen.findByText("Enter the code from the app")).toBeInTheDocument();
      expect(screen.getByText("You signed in with face or fingerprint, and two-factor protection is on for this account. To set up another device, enter the code from the app.")).toBeInTheDocument();
      expect(auth.registerPasskey).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "482913" } });
      await waitFor(() => expect(auth.mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "482913" }));
      await waitFor(() => expect(auth.registerPasskey).toHaveBeenCalled());
    });

    it("a browser that lost the click after the code refuses the window: no error, the button is back", async () => {
      auth.registerPasskey.mockResolvedValue({ data: null, error: { code: "ERROR_CEREMONY_ABORTED" } });
      renderSection();
      fireEvent.click(await screen.findByRole("button", { name: "Set up on this device" }));
      fireEvent.change(await screen.findByLabelText("Code from the app"), { target: { value: "482913" } });
      await waitFor(() => expect(auth.registerPasskey).toHaveBeenCalled());
      expect(await screen.findByRole("button", { name: "Set up on this device" })).toBeEnabled();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("and before turning off", async () => {
      auth.passkey.list.mockResolvedValue({ data: [APPLE, YANDEX], error: null });
      auth.passkey.delete.mockResolvedValue({ data: null, error: null });
      renderSection();
      await screen.findByRole("group", { name: "Пароли Apple" });
      fireEvent.click(row("Пароли Apple").getByRole("button", { name: "Turn off" }));
      const confirmPanel = screen.getByText("Turn off \u201cПароли Apple\u201d?").parentElement!.parentElement!;
      fireEvent.click(within(confirmPanel).getByRole("button", { name: "Turn off" }));
      expect(await screen.findByText("You signed in with face or fingerprint, and two-factor protection is on for this account. To turn off a device, enter the code from the app.")).toBeInTheDocument();
      expect(auth.passkey.delete).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value: "482913" } });
      await waitFor(() => expect(auth.passkey.delete).toHaveBeenCalledWith({ passkeyId: "k1" }));
    });

    it("Auth's own «insufficient_aal» opens the same field", async () => {
      auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
      auth.registerPasskey.mockResolvedValue({ data: null, error: { code: "insufficient_aal", status: 403 } });
      renderSection();
      fireEvent.click(await screen.findByRole("button", { name: "Set up on this device" }));
      expect(await screen.findByText("Enter the code from the app")).toBeInTheDocument();
    });

    it("who already passed the code (aal2) is not asked again", async () => {
      auth.mfa.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
      auth.registerPasskey.mockResolvedValue({ data: APPLE, error: null });
      renderSection();
      fireEvent.click(await screen.findByRole("button", { name: "Set up on this device" }));
      await waitFor(() => expect(auth.registerPasskey).toHaveBeenCalled());
      expect(screen.queryByText("Enter the code from the app")).toBeNull();
    });
  });
});
