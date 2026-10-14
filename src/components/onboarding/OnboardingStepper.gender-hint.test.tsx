import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, requestHintMock, toastMock, workspaceSource } = vi.hoisted(() => ({
  state: { mode: { kind: "supabase", profileId: "u1" } as { kind: string; profileId?: string } },
  requestHintMock: vi.fn(),
  toastMock: vi.fn(),
  workspaceSource: {
    updateProfilePreferences: vi.fn(async () => undefined),
    updateProfileIdentity: vi.fn(async () => undefined),
  },
}));

vi.mock("@/hooks/use-mock-data", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-mock-data")>("@/hooks/use-mock-data");
  return { ...actual, useWorkspaceMode: () => state.mode };
});

vi.mock("@/data/workspace-source", async () => {
  const actual = await vi.importActual<typeof import("@/data/workspace-source")>("@/data/workspace-source");
  return { ...actual, getWorkspaceSource: async () => workspaceSource };
});

vi.mock("@/data/profile-gender-hint-source", () => ({
  requestProfileGenderHint: requestHintMock,
}));

vi.mock("@/hooks/use-toast", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-toast")>("@/hooks/use-toast");
  return { ...actual, toast: toastMock };
});

import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";

function renderStepper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingStepper onComplete={() => {}} />
    </QueryClientProvider>,
  );
}

const advance = () => fireEvent.click(screen.getByRole("button", { name: /continue|далее|продолжить/i }));

describe("OnboardingStepper and Shurik's gender hint", () => {
  beforeEach(() => {
    state.mode = { kind: "supabase", profileId: "u1" };
    requestHintMock.mockReset();
    requestHintMock.mockResolvedValue("asked");
    toastMock.mockReset();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("records the person as asked when the step with the field is passed", async () => {
    renderStepper();
    advance();

    await screen.findByPlaceholderText(/project name|название проекта/i);
    expect(requestHintMock).toHaveBeenCalledTimes(1);
    expect(requestHintMock).toHaveBeenCalledWith("u1", { onboarding: true });
  });

  it("does not hold the step or warn when recording fails", async () => {
    requestHintMock.mockRejectedValue(new Error("network"));
    renderStepper();
    advance();

    await screen.findByPlaceholderText(/project name|название проекта/i);
    expect(toastMock).not.toHaveBeenCalled();
  });

  it("does not call the server outside a signed-in workspace", async () => {
    state.mode = { kind: "local" };
    renderStepper();
    advance();

    await screen.findByPlaceholderText(/project name|название проекта/i);
    expect(requestHintMock).not.toHaveBeenCalled();
  });
});
