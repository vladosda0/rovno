import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { NotificationsPanel } from "@/components/settings/panels/NotificationsPanel";

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationsPanel />
    </QueryClientProvider>,
  );
}

describe("NotificationsPanel", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("seeds toggles from saved preferences and persists the full resolved map on save", async () => {
    // Persisted state: in-app off, weekly digest, one event explicitly flipped off
    // (task_assigned defaults to on in the catalog).
    localStorage.setItem("notification-preferences", JSON.stringify({
      inAppEnabled: false,
      emailEnabled: false,
      digestFrequency: "weekly",
      eventToggles: { task_assigned: false },
    }));

    renderPanel();

    // Wait for the loaded preferences to seed the digest selector.
    expect(await screen.findByText("Weekly")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("notification-preferences") ?? "{}") as {
        inAppEnabled?: boolean;
        digestFrequency?: string;
        eventToggles?: Record<string, boolean>;
      };
      // Seeded in-app value (false) is preserved.
      expect(saved.inAppEnabled).toBe(false);
      expect(saved.digestFrequency).toBe("weekly");
      // The complete resolved map is persisted: explicit override + catalog defaults.
      expect(saved.eventToggles?.task_assigned).toBe(false);
      expect(saved.eventToggles?.task_due).toBe(true);
      expect(saved.eventToggles?.task_status).toBe(false);
      expect(saved.eventToggles?.doc_scan).toBe(true);
      expect(saved.eventToggles?.mention).toBe(true);
    });
  });

  it("preserves email_enabled on save (the panel never edits it)", async () => {
    // email_enabled:true is the dangerous regression to guard: the panel must
    // not clobber it back to false (it only edits in-app, digest, and events).
    // Seed eventToggles:{} so task_due appears ONLY after Save writes the full
    // resolved map — that is our "save completed" signal, so the emailEnabled
    // assertion is checked against the post-save state, not the seed.
    localStorage.setItem("notification-preferences", JSON.stringify({
      inAppEnabled: true,
      emailEnabled: true,
      digestFrequency: "instant",
      eventToggles: {},
    }));

    renderPanel();

    const saveButton = screen.getByRole("button", { name: /save preferences/i });
    // The button is disabled until the preferences query settles (seeded state).
    await waitFor(() => expect(saveButton).not.toBeDisabled());

    fireEvent.click(saveButton);

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("notification-preferences") ?? "{}") as {
        emailEnabled?: boolean;
        eventToggles?: Record<string, boolean>;
      };
      // Post-save signal (the seed had no task_due key):
      expect(saved.eventToggles?.task_due).toBe(true);
      // Preserved across the save (panel never sends emailEnabled):
      expect(saved.emailEnabled).toBe(true);
    });
  });
});
