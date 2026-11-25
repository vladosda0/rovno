import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const preferencesMutate = vi.fn();
let state: {
  preferences: Record<string, string> | undefined;
  isLoading: boolean;
  isError?: boolean;
  isRefetching?: boolean;
  refetch?: () => void;
};

vi.mock("@/hooks/use-workspace-source", () => ({
  useWorkspaceMode: () => ({ kind: "supabase", profileId: "u1" }),
  useWorkspaceProfilePreferencesState: () => state,
  useUpdateWorkspaceProfilePreferences: () => ({ mutateAsync: preferencesMutate, isPending: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { PreferencesPanel } from "@/components/settings/panels/PreferencesPanel";

describe("PreferencesPanel save", () => {
  beforeEach(() => {
    preferencesMutate.mockReset().mockResolvedValue({});
  });

  it("is off while the stored preferences are not on screen", () => {
    state = { preferences: undefined, isLoading: false };
    render(<PreferencesPanel />);

    const save = screen.getByRole("button", { name: /save preferences/i });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(preferencesMutate).not.toHaveBeenCalled();
  });

  it("is on once they are", () => {
    state = {
      preferences: {
        currency: "USD",
        units: "metric",
        dateFormat: "dd.MM.yyyy",
        weekStart: "monday",
        aiOutputLanguage: "en",
        automationLevel: "manual",
      },
      isLoading: false,
    };
    render(<PreferencesPanel />);

    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(preferencesMutate).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "USD", aiOutputLanguage: "en" }),
    );
  });

  it("says the stored preferences failed to load and offers a retry", () => {
    const refetch = vi.fn();
    state = { preferences: undefined, isLoading: false, isError: true, refetch };
    render(<PreferencesPanel />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your preferences.");
    expect(screen.queryByRole("button", { name: /save preferences/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows no error while the preferences are still loading", () => {
    state = { preferences: undefined, isLoading: true, isError: false, refetch: vi.fn() };
    render(<PreferencesPanel />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save preferences/i })).toBeDisabled();
  });

  it("keeps Save when only a refetch failed and the preferences are on screen", () => {
    state = {
      preferences: {
        currency: "USD",
        units: "metric",
        dateFormat: "dd.MM.yyyy",
        weekStart: "monday",
        aiOutputLanguage: "en",
        automationLevel: "manual",
      },
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    };
    render(<PreferencesPanel />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save preferences/i })).toBeEnabled();
  });

  it("holds Retry while a retry is already on its way", () => {
    state = { preferences: undefined, isLoading: false, isError: true, isRefetching: true, refetch: vi.fn() };
    render(<PreferencesPanel />);

    expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  });
});
