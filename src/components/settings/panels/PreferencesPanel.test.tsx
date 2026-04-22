import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PreferencesPanel } from "@/components/settings/panels/PreferencesPanel";

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PreferencesPanel />
    </QueryClientProvider>,
  );
}

describe("PreferencesPanel", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("loads saved defaults and persists them for AI answers", async () => {
    localStorage.setItem("profile-preferences", JSON.stringify({
      currency: "RUB",
      units: "metric",
      dateFormat: "dd.MM.yyyy",
      weekStart: "monday",
      aiOutputLanguage: "ru",
      automationLevel: "manual",
    }));

    renderPanel();

    expect(await screen.findByText("₽ Russian Ruble (RUB)")).toBeInTheDocument();
    expect(screen.getByText("Metric (m, m², kg)")).toBeInTheDocument();
    // "Русский" appears in both the Interface Language and the AI output language selects.
    expect(screen.getAllByText("Русский").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("profile-preferences") ?? "{}") as Record<string, unknown>;
      expect(saved.currency).toBe("RUB");
      expect(saved.units).toBe("metric");
      expect(saved.aiOutputLanguage).toBe("ru");
      expect(saved.automationLevel).toBe("manual");
    });
  });
});
