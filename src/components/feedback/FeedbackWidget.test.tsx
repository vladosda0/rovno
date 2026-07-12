import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";
import {
  __unsafeResetRuntimeAuthForTests,
  __unsafeSetRuntimeAuthStateForTests,
  type RuntimeAuthState,
} from "@/hooks/use-runtime-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("@/hooks/use-toast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-toast")>();
  return { ...actual, toast: vi.fn() };
});

const mockedInvoke = vi.mocked(supabase.functions.invoke);
const mockedToast = vi.mocked(toast);

const AUTHENTICATED: RuntimeAuthState = {
  status: "authenticated",
  session: null,
  user: null,
  profileId: "user-1",
};

const GUEST: RuntimeAuthState = {
  status: "guest",
  session: null,
  user: null,
  profileId: null,
};

function openDialogWithMessage(message?: string) {
  fireEvent.click(screen.getByRole("button", { name: "Feedback" }));
  if (message !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(/tell us about an idea/i), {
      target: { value: message },
    });
  }
}

afterEach(() => {
  __unsafeResetRuntimeAuthForTests();
  vi.clearAllMocks();
});

describe("FeedbackWidget", () => {
  it("renders nothing for guests", () => {
    __unsafeSetRuntimeAuthStateForTests(GUEST);
    render(<FeedbackWidget />);
    expect(screen.queryByRole("button", { name: "Feedback" })).not.toBeInTheDocument();
  });

  it("submits the message with the page url and closes on success", async () => {
    __unsafeSetRuntimeAuthStateForTests(AUTHENTICATED);
    mockedInvoke.mockResolvedValue({ data: { ok: true }, error: null });

    render(<FeedbackWidget />);
    openDialogWithMessage("  Кнопка не работает  ");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1));
    expect(mockedInvoke).toHaveBeenCalledWith("submit-feedback", {
      body: {
        message: "Кнопка не работает",
        page_url: window.location.href,
      },
    });
    expect(mockedToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringMatching(/thanks/i) }),
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText(/tell us about an idea/i)).not.toBeInTheDocument(),
    );
  });

  it("keeps the dialog and text on failure and shows an error toast", async () => {
    __unsafeSetRuntimeAuthStateForTests(AUTHENTICATED);
    mockedInvoke.mockResolvedValue({
      data: null,
      error: new Error("relay unavailable"),
    } as never);

    render(<FeedbackWidget />);
    openDialogWithMessage("Ошибка в смете");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(mockedToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      ),
    );
    expect(screen.getByPlaceholderText(/tell us about an idea/i)).toHaveValue("Ошибка в смете");
  });

  it("disables submit for empty input", () => {
    __unsafeSetRuntimeAuthStateForTests(AUTHENTICATED);

    render(<FeedbackWidget />);
    openDialogWithMessage();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(mockedInvoke).not.toHaveBeenCalled();
  });
});
