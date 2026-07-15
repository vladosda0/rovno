import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Settings from "@/pages/Settings";
import { clearDemoSession, enterDemoSession } from "@/lib/auth-state";

// The page pulls the full settings panel tree; the panels talk to supabase on
// mount, so stub the client (the demo guard must redirect before any of it).
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  },
}));

function renderSettingsRoute() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/settings"]}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
          <Route path="/home" element={<div>home-route</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Settings demo guard", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearDemoSession();
  });

  it("redirects /settings to /home while a demo session is active", () => {
    enterDemoSession();
    renderSettingsRoute();

    expect(screen.getByText("home-route")).toBeInTheDocument();
  });

  it("keeps /settings reachable outside the demo", () => {
    renderSettingsRoute();

    expect(screen.queryByText("home-route")).not.toBeInTheDocument();
  });
});
