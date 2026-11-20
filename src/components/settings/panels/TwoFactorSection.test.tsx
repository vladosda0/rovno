import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TwoFactorSection } from "@/components/settings/panels/TwoFactorSection";

const { mfa, invokeMock, refreshMock, toastMock } = vi.hoisted(() => ({
  mfa: {
    listFactors: vi.fn(),
    enroll: vi.fn(),
    unenroll: vi.fn(),
    challengeAndVerify: vi.fn(),
  },
  invokeMock: vi.fn(),
  refreshMock: vi.fn(),
  toastMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { mfa, refreshSession: refreshMock }, functions: { invoke: invokeMock } },
}));

vi.mock("@/hooks/use-toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/use-toast")>()),
  toast: toastMock,
}));

const CODES = ["7k2mq-x9fdr", "h4tzp-c8wna", "m3vxe-q7kjs", "p9rdn-2ftuh", "w6cga-k3mzx", "e8hus-v4npt", "r2kwy-d9qce", "t5zma-h6vrk", "c7nxf-u2spw", "f3qte-m8dyh"];
const verified = { id: "f1", factor_type: "totp", status: "verified", created_at: "2026-11-12T10:00:00Z" };

function factors(list: unknown[]) {
  mfa.listFactors.mockResolvedValue({ data: { all: list, totp: list }, error: null });
}

function functionAnswers(answers: Record<string, unknown>) {
  invokeMock.mockImplementation(async (_name: string, { body }: { body: { action: string } }) => {
    const answer = answers[body.action];
    return answer === undefined ? { data: { ok: true }, error: null } : { data: answer, error: null };
  });
}

function renderSection(url = "/settings?tab=security") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <TwoFactorSection email="ivan@yandex.ru" />
    </MemoryRouter>,
  );
}

const typeCode = (value: string) => fireEvent.change(screen.getByLabelText("Code from the app"), { target: { value } });

describe("TwoFactorSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mfa.unenroll.mockResolvedValue({ data: {}, error: null });
    refreshMock.mockResolvedValue({ data: {}, error: null });
    mfa.enroll.mockResolvedValue({
      data: { id: "new", totp: { qr_code: "data:image/svg+xml;utf-8,<svg/>", secret: "JBSWY3DPEHPK3PXP7QF2MZ4KR6TNWB3D", uri: "otpauth://totp/Rovno:ivan@yandex.ru?secret=JBSW" } },
      error: null,
    });
  });

  it("off: «Turn on» and the authenticator row; the «Coming soon» passkey row is gone (slice 5)", async () => {
    factors([]);
    renderSection();
    const row = within(await screen.findByRole("group", { name: "Authenticator app" }));
    expect(row.getByText(/Yandex Key, Google Authenticator/)).toBeInTheDocument();
    expect(row.getByRole("button", { name: "Turn on" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Passkey" })).not.toBeInTheDocument();
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
    expect(screen.queryByText("2FA / Passkeys")).not.toBeInTheDocument();
  });

  it("turns on in the row: QR code, key in fours, six digits, ten codes, «Codes saved»", async () => {
    factors([{ id: "stale", factor_type: "totp", status: "unverified", created_at: "x" }]);
    functionAnswers({ generate: { codes: CODES }, status: { enabled: true, since: "2026-11-12T10:00:00Z", left: 10, confirmed: true } });
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));

    expect(await screen.findByText("Scan the QR code in your authenticator app")).toBeInTheDocument();
    expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "stale" });
    expect(mfa.enroll).toHaveBeenCalledWith({ factorType: "totp", issuer: "Rovno", friendlyName: "Rovno" });
    expect(screen.getByRole("img", { name: "QR code for the app" })).toHaveAttribute("src", "data:image/svg+xml;utf-8,<svg/>");
    expect(screen.getByText("JBSW Y3DP EHPK 3PXP 7QF2 MZ4K R6TN WB3D")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();

    factors([verified]);
    typeCode("482 913");
    await waitFor(() => expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "new", code: "482913" }));
    expect(await screen.findByText("Save your recovery codes")).toBeInTheDocument();
    for (const c of CODES) expect(screen.getByText(c)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Codes saved" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("mfa-recovery", { body: { action: "confirm" } }));
    expect(toastMock).toHaveBeenCalledWith({ title: "Two-factor authentication is on", description: "A code is asked at every new sign-in." });
    expect(await screen.findByText("10 of 10 left.")).toBeInTheDocument();
  });

  it("a wrong first code says the code changes every 30 seconds, and nothing is generated", async () => {
    factors([]);
    functionAnswers({});
    mfa.challengeAndVerify.mockResolvedValue({ data: null, error: { status: 422, code: "mfa_verification_failed" } });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await screen.findByText("Scan the QR code in your authenticator app");
    typeCode("000000");
    expect(await screen.findByRole("alert")).toHaveTextContent("That code didn't work. Enter a new code from the app: it changes every 30 seconds.");
    expect(invokeMock).not.toHaveBeenCalledWith("mfa-recovery", { body: { action: "generate" } });
  });

  it("«Cancel» on the first step removes the half-made factor", async () => {
    factors([]);
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Turn on" }));
    await screen.findByText("Scan the QR code in your authenticator app");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "new" }));
    expect(screen.getByRole("button", { name: "Turn on" })).toBeInTheDocument();
  });

  it("on: date, codes left, and «Turn off» only after a code from the app", async () => {
    factors([verified]);
    functionAnswers({ status: { enabled: true, since: "2026-11-12T10:00:00Z", left: 10, confirmed: true } });
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    renderSection();
    expect(await screen.findByText("On since November 12, 2026. A code is asked at every new sign-in.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    expect(await screen.findByText("Turn off two-factor authentication?")).toBeInTheDocument();
    expect(mfa.unenroll).not.toHaveBeenCalled();
    typeCode("482913");
    await waitFor(() => expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: "f1" }));
    expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "482913" });
    expect(refreshMock).toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Turn on" })).toBeInTheDocument();
    expect(toastMock).toHaveBeenCalledWith({ title: "Two-factor authentication is off", description: "No code is asked at sign-in any more." });
  });

  it("«New codes» asks for a code from the app, then shows the new set", async () => {
    factors([verified]);
    functionAnswers({ status: { enabled: true, since: "2026-11-12T10:00:00Z", left: 4, confirmed: true }, generate: { codes: CODES } });
    mfa.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "New codes" }));
    expect(await screen.findByText("Get new codes?")).toBeInTheDocument();
    typeCode("482913");
    expect(await screen.findByText("New recovery codes")).toBeInTheDocument();
    expect(screen.queryByText("Step 2 of 2")).not.toBeInTheDocument();
  });

  it("three codes or fewer, and a set never saved, are flagged", async () => {
    factors([verified]);
    functionAnswers({ status: { enabled: true, since: "2026-11-12T10:00:00Z", left: 2, confirmed: true } });
    const { unmount } = renderSection();
    expect(await screen.findByText("2 of 10 left. Get new ones while you still have access.")).toBeInTheDocument();
    unmount();
    functionAnswers({ status: { enabled: true, since: "2026-11-12T10:00:00Z", left: 10, confirmed: false } });
    renderSection();
    expect(await screen.findByText("The codes were not saved. Get new ones and save them.")).toBeInTheDocument();
  });

  it("?mfa=enable (after a recovery code) opens the first step at once", async () => {
    factors([]);
    renderSection("/settings?tab=security&mfa=enable");
    expect(await screen.findByText("Scan the QR code in your authenticator app")).toBeInTheDocument();
  });
});
