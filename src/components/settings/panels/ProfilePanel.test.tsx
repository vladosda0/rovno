import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProfilePanel } from "@/components/settings/panels/ProfilePanel";
import { __unsafeResetStoreForTests, getCurrentUserForMode } from "@/data/store";
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

  describe("the gender field", () => {
    function renderDemoPanel() {
      setAuthRole("owner");
      enterDemoSession("project-1");
      __unsafeResetStoreForTests();
      render(
        <QueryClientProvider client={createQueryClient()}>
          <ProfilePanel />
        </QueryClientProvider>,
      );
    }

    const option = (name: RegExp) => screen.getByRole("button", { name });
    const saveButton = () => screen.getByRole("button", { name: /save changes|сохранить изменения/i });

    it("shows «not stated» for a profile with no gender, with nothing to save", () => {
      renderDemoPanel();

      expect(option(/prefer not to say|не указывать/i)).toHaveAttribute("aria-pressed", "true");
      expect(saveButton()).toBeDisabled();
    });

    it("saves a chosen gender with the common button", async () => {
      renderDemoPanel();

      fireEvent.click(option(/^(female|женский)$/i));
      expect(saveButton()).toBeEnabled();
      fireEvent.click(saveButton());

      await waitFor(() => expect(getCurrentUserForMode("demo").gender).toBe("female"));
    });

    it("shows the saved value after the save, with nothing left to save", async () => {
      renderDemoPanel();

      fireEvent.click(option(/^(female|женский)$/i));
      fireEvent.click(saveButton());

      await waitFor(() => expect(saveButton()).toBeDisabled());
      expect(option(/^(female|женский)$/i)).toHaveAttribute("aria-pressed", "true");
    });

    it("clears a stored gender when «not stated» is picked and saved", async () => {
      renderDemoPanel();

      fireEvent.click(option(/^(female|женский)$/i));
      fireEvent.click(saveButton());
      await waitFor(() => expect(getCurrentUserForMode("demo").gender).toBe("female"));

      fireEvent.click(option(/prefer not to say|не указывать/i));
      await waitFor(() => expect(saveButton()).toBeEnabled());
      fireEvent.click(saveButton());

      await waitFor(() => expect(getCurrentUserForMode("demo").gender ?? null).toBeNull());
    });

    it("returns to the stored value on discard", () => {
      renderDemoPanel();

      fireEvent.click(option(/^(male|мужской)$/i));
      fireEvent.click(screen.getByRole("button", { name: /discard|отменить|сбросить/i }));

      expect(option(/prefer not to say|не указывать/i)).toHaveAttribute("aria-pressed", "true");
      expect(saveButton()).toBeDisabled();
    });
  });
});
