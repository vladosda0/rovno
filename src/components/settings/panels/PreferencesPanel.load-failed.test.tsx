import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const preferencesMutate = vi.fn();
let state: { preferences: Record<string, string> | undefined; isLoading: boolean };

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
});
