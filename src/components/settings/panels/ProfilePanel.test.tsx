import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfilePanel } from "@/components/settings/panels/ProfilePanel";
import { __unsafeResetStoreForTests } from "@/data/store";
import {
  clearDemoSession,
  clearStoredAuthProfile,
  enterDemoSession,
  setAuthRole,
  setStoredAuthProfile,
} from "@/lib/auth-state";

describe("ProfilePanel", () => {
  function createQueryClient() {
    return new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    __unsafeResetStoreForTests();
  });

  it("renders seeded demo identity while demo mode is active", () => {
    setStoredAuthProfile({
      email: "real-user@example.com",
      name: "Real Workspace User",
    });
    setAuthRole("owner");
    enterDemoSession("project-1");
    __unsafeResetStoreForTests();

    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ProfilePanel />
      </QueryClientProvider>,
    );

    expect(screen.getByDisplayValue("Алексей Петров")).toBeInTheDocument();
    expect(screen.getByDisplayValue("alex@rovno.ai")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Real Workspace User")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("real-user@example.com")).not.toBeInTheDocument();
  });
});
