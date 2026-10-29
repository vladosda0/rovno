import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EmailCodeStep } from "@/components/auth/EmailCodeStep";
import { normalizeEmailCode } from "@/lib/email-code";

const { verifyOtpMock } = vi.hoisted(() => ({ verifyOtpMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { verifyOtp: verifyOtpMock } },
}));

const SESSION = { user: { id: "profile-1" } };

function renderStep(overrides: Partial<Parameters<typeof EmailCodeStep>[0]> = {}) {
  const props = {
    email: "ivan@mail.ru",
    onVerified: vi.fn(),
    onResend: vi.fn().mockResolvedValue(undefined),
    onChangeEmail: vi.fn(),
    ...overrides,
  };
  render(<EmailCodeStep {...props} />);
  return props;
}

describe("normalizeEmailCode", () => {
  it.each([
    ["482913", "482913"],
    ["482 913", "482913"],
    ["482-913", "482913"],
    [" 482 913 ", "482913"],
    ["4829131", "482913"],
    ["48a29", "4829"],
  ])("%j gives %j", (raw, expected) => {
    expect(normalizeEmailCode(raw)).toBe(expected);
  });
});

describe("EmailCodeStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is one numeric one-time-code field and names the address", () => {
    renderStep();
    const input = screen.getByLabelText("Code from email");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).not.toHaveAttribute("placeholder");
    expect(screen.getByText("We sent a code to ivan@mail.ru. It usually arrives within a minute.")).toBeInTheDocument();
  });

  it.each(["482 913", "482-913", "482913"])("pasting %j verifies six digits on its own", async (pasted) => {
    verifyOtpMock.mockResolvedValue({ data: { session: SESSION }, error: null });
    const props = renderStep();

    fireEvent.change(screen.getByLabelText("Code from email"), { target: { value: pasted } });

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenCalledWith({ email: "ivan@mail.ru", token: "482913", type: "email" });
      expect(props.onVerified).toHaveBeenCalledWith(SESSION);
    });
    expect(screen.getByLabelText("Code from email")).toHaveValue("482913");
  });

  it("does not verify before the sixth digit", () => {
    renderStep();
    fireEvent.change(screen.getByLabelText("Code from email"), { target: { value: "48291" } });
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("a wrong code shows the error and does not sign in", async () => {
    verifyOtpMock.mockResolvedValue({ data: { session: null }, error: { status: 403, code: "otp_expired", message: "Token has expired or is invalid" } });
    const props = renderStep();

    fireEvent.change(screen.getByLabelText("Code from email"), { target: { value: "000000" } });

    expect(await screen.findByText("That code didn't work. Check the email or request a new one.")).toBeInTheDocument();
    expect(screen.getByLabelText("Code from email")).toHaveAttribute("aria-invalid", "true");
    expect(props.onVerified).not.toHaveBeenCalled();
  });

  it("a network failure is not called a wrong code", async () => {
    verifyOtpMock.mockRejectedValue(new TypeError("Failed to fetch"));
    renderStep();
    fireEvent.change(screen.getByLabelText("Code from email"), { target: { value: "482913" } });
    expect(await screen.findByText("Couldn't check the code. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("That code didn't work. Check the email or request a new one.")).toBeNull();
  });

  it("a code corrected while the first check runs is checked too", async () => {
    let finishFirst: (v: unknown) => void = () => {};
    verifyOtpMock
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValueOnce({ data: { session: SESSION }, error: null });
    const props = renderStep();
    const input = screen.getByLabelText("Code from email");

    fireEvent.change(input, { target: { value: "482910" } });
    fireEvent.change(input, { target: { value: "482913" } });
    finishFirst({ data: { session: null }, error: { status: 403, code: "otp_expired", message: "Token has expired or is invalid" } });

    await waitFor(() => {
      expect(verifyOtpMock).toHaveBeenLastCalledWith({ email: "ivan@mail.ru", token: "482913", type: "email" });
      expect(props.onVerified).toHaveBeenCalledWith(SESSION);
    });
  });

  it("a check that returns after the step is gone still finishes the sign-in", async () => {
    let finish: (v: unknown) => void = () => {};
    verifyOtpMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const props = { email: "ivan@mail.ru", onVerified: vi.fn(), onResend: vi.fn(), onChangeEmail: vi.fn() };
    const { unmount } = render(<EmailCodeStep {...props} />);
    fireEvent.change(screen.getByLabelText("Code from email"), { target: { value: "482913" } });
    unmount();
    finish({ data: { session: SESSION }, error: null });
    await waitFor(() => expect(props.onVerified).toHaveBeenCalledWith(SESSION));
  });

  it("an empty code is not sent", () => {
    renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect(verifyOtpMock).not.toHaveBeenCalled();
  });

  it("offers resend only after 60 seconds", async () => {
    vi.useFakeTimers();
    const props = renderStep();

    expect(screen.getByText("You can resend in 1:00")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resend code" })).toBeNull();

    act(() => {
      vi.advanceTimersByTime(18_000);
    });
    expect(screen.getByText("You can resend in 0:42")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(42_000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));
    expect(props.onResend).toHaveBeenCalledTimes(1);
  });

  it("change email goes back", () => {
    const props = renderStep();
    fireEvent.click(screen.getByRole("button", { name: "Change email" }));
    expect(props.onChangeEmail).toHaveBeenCalled();
  });
});
