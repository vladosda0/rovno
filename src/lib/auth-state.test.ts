import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

import { completeOnboarding, hasCompletedOnboarding, isOnboarded } from "@/lib/auth-state";

describe("auth-state onboarding completion", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("hydrates local onboarding state from the Supabase profile", async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { onboarding_completed_at: "2026-04-24T20:00:00.000Z" },
            error: null,
          }),
        })),
      })),
    });

    await expect(hasCompletedOnboarding("profile-1")).resolves.toBe(true);
    expect(isOnboarded("profile-1")).toBe(true);
  });

  it("mirrors onboarding completion to the Supabase profile", async () => {
    const eqMock = vi.fn().mockResolvedValue({ error: null });
    const updateMock = vi.fn(() => ({ eq: eqMock }));
    fromMock.mockReturnValueOnce({ update: updateMock });

    await completeOnboarding("profile-1");

    expect(isOnboarded("profile-1")).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      onboarding_completed_at: expect.any(String),
    });
    expect(eqMock).toHaveBeenCalledWith("id", "profile-1");
  });
});
