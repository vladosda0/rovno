import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { state, toastMock, createOrgMock, workspaceSource, planningSource } = vi.hoisted(() => ({
  state: {
    mode: { kind: "supabase", profileId: "u1" } as { kind: string; profileId?: string },
    quota: { plan_code: "free" } as { plan_code: string } | undefined,
  },
  toastMock: vi.fn(),
  createOrgMock: vi.fn(),
  workspaceSource: {
    updateProfilePreferences: vi.fn(async () => undefined),
    updateProfileIdentity: vi.fn(async () => undefined),
    createProject: vi.fn(async () => ({ id: "project-1" })),
  },
  planningSource: {
    createProjectStage: vi.fn(async () => ({ id: "stage-1" })),
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

vi.mock("@/data/planning-source", async () => {
  const actual = await vi.importActual<typeof import("@/data/planning-source")>("@/data/planning-source");
  return { ...actual, getPlanningSource: async () => planningSource };
});

vi.mock("@/data/profile-gender-hint-source", () => ({
  requestProfileGenderHint: vi.fn(async () => undefined),
}));

vi.mock("@/hooks/useTierQuota", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useTierQuota")>("@/hooks/useTierQuota");
  return { ...actual, useTierQuota: () => ({ data: state.quota }) };
});

vi.mock("@/hooks/use-orgs", () => ({
  useCreateOrganization: () => ({ isPending: false, mutateAsync: createOrgMock }),
  useSetActiveOrg: () => ({ isPending: false, mutateAsync: vi.fn(async () => undefined) }),
}));

vi.mock("@/hooks/use-toast", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-toast")>("@/hooks/use-toast");
  return { ...actual, toast: toastMock };
});

import { OnboardingStepper } from "@/components/onboarding/OnboardingStepper";

function renderStepper(onComplete: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <OnboardingStepper onComplete={onComplete} />
    </QueryClientProvider>,
  );
}

async function finishStagesStep(onComplete: () => void) {
  renderStepper(onComplete);
  fireEvent.click(screen.getByRole("button", { name: /continue|далее|продолжить/i }));
  const nameInput = await screen.findByPlaceholderText(/project name|название проекта/i);
  fireEvent.change(nameInput, { target: { value: "Org step project" } });
  fireEvent.click(screen.getByRole("button", { name: /create & continue|создать и продолжить/i }));
  await screen.findByRole("button", { name: /add stage|добавить этап/i });
  fireEvent.click(screen.getByRole("button", { name: /^(continue|далее)$/i }));
}

const orgStepTitle = /want to create a team workspace\?|создать рабочую организацию\?/i;

describe("OnboardingStepper organization step", () => {
  beforeEach(() => {
    state.mode = { kind: "supabase", profileId: "u1" };
    state.quota = { plan_code: "free" };
  });
  afterEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it.each([
    ["free", { plan_code: "free" }],
    ["Master", { plan_code: "master" }],
    ["unknown", undefined],
  ])("does not offer an organization when the plan is %s and finishes after the stages", async (_label, quota) => {
    state.quota = quota;
    const onComplete = vi.fn();
    await finishStagesStep(onComplete);

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(orgStepTitle)).not.toBeInTheDocument();
  });

  it("offers the organization step on the Brigade plan", async () => {
    state.quota = { plan_code: "brigade" };
    const onComplete = vi.fn();
    await finishStagesStep(onComplete);

    expect(await screen.findByText(orgStepTitle)).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("shows the Brigade paywall instead of the raw database error when creation is refused", async () => {
    state.quota = { plan_code: "brigade" };
    createOrgMock.mockRejectedValue(
      Object.assign(new Error("organization_requires_brigade"), { code: "P0001" }),
    );
    const onComplete = vi.fn();
    await finishStagesStep(onComplete);

    fireEvent.click(await screen.findByRole("button", { name: /yes, create one|хочу создать организацию/i }));
    fireEvent.change(screen.getByPlaceholderText(/acme studio|студия ромашка/i), { target: { value: "Crew" } });
    fireEvent.click(screen.getByRole("button", { name: /^(create|создать)$/i }));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const toasts = toastMock.mock.calls.map(([arg]) => arg as { title?: string; description?: string });
    expect(toasts.map((toast) => toast.title)).toContain("Organizations are available on the Brigade plan");
    expect(toasts.map((toast) => toast.description)).not.toContain("organization_requires_brigade");
    expect(onComplete).not.toHaveBeenCalled();
  });
});
