import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TopBar } from "@/components/TopBar";
import { __unsafeResetStoreForTests } from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("TopBar", () => {
  beforeEach(() => {
    Object.defineProperty(window, "PointerEvent", {
      configurable: true,
      writable: true,
      value: MouseEvent,
    });
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    setStoredAuthProfile({
      email: "jane@example.com",
      name: "Jane Doe",
    });
    setAuthRole("owner");
    __unsafeResetStoreForTests();
  });

  it("hides the top-right avatar menu on home while keeping account actions in the logo dropdown", async () => {
    const queryClient = createQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <TopBar aiSidebarCollapsed onToggleAiSidebar={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.queryByText("JD")).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: /rovno/i }), { button: 0, ctrlKey: false });

    expect(await screen.findByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Log out" })).toBeInTheDocument();
  });
});
