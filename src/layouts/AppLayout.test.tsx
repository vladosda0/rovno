import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import AppLayout from "@/layouts/AppLayout";
import { closePhotoConsult, openPhotoConsult } from "@/lib/photo-consult-store";
import { __unsafeResetStoreForTests, addMember, addProject, addShurikMessage } from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";
import type { ShurikMessage } from "@/types/entities";
import {
  clearAiSidebarSessionPreference,
  writeAiSidebarSessionPreference,
} from "@/lib/ai-sidebar-session";

/** Lazy `AISidebar` + Suspense can exceed RTL's default findBy timeout on slow CI runners. */
const SIDEBAR_FIND_TIMEOUT_MS = 10_000;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

function NavProbe() {
  const navigate = useNavigate();
  return (
    <>
      {["/home", "/settings", "/settings?tab=billing", "/project/project-1/dashboard"].map((to) => (
        <button key={to} type="button" onClick={() => navigate(to)}>{`go ${to}`}</button>
      ))}
    </>
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

describe("AppLayout", () => {
  let profileId = "";

  function addUnreadMessage(partial: Partial<ShurikMessage> = {}) {
    addShurikMessage({
      id: "msg-1",
      user_id: profileId,
      project_id: null,
      type: "billing_payment_failed",
      title: "Не прошло списание за подписку",
      body: "Не прошло списание 2 990 ₽ за подписку. Автопродление выключено.",
      is_read: false,
      read_at: null,
      created_at: new Date().toISOString(),
      payload: { action_label: "Обновить карту", action_href: "/settings?tab=billing" },
      ...partial,
    });
  }

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    const profile = setStoredAuthProfile({
      email: "owner@example.com",
      name: "Owner User",
    });
    profileId = profile.id;
    setAuthRole("owner");
    __unsafeResetStoreForTests();

    addProject({
      id: "project-1",
      owner_id: profile.id,
      title: "Project One",
      type: "residential",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    addMember({
      project_id: "project-1",
      user_id: profile.id,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 500,
      used_credits: 0,
    });

    // Warm module cache so AppLayout's `lazy(() => import(AISidebar))` resolves under parallel test load.
    await import("@/components/AISidebar");
  });

  afterEach(() => {
    act(() => {
      closePhotoConsult();
    });
  });

  function renderLayout(path = "/project/project-1/dashboard") {
    const queryClient = createQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/project/:id/dashboard" element={<div>Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("starts with AI sidebar open when no session preference is set", async () => {
    renderLayout();
    expect(await screen.findByLabelText("Ask Shurik...", undefined, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Shurik" })).not.toBeInTheDocument();
  });

  it("restores explicit close preference across remount in the same session", async () => {
    const firstRender = renderLayout();
    fireEvent.click(await screen.findByRole("button", { name: /toggle shurik's panel/i }, { timeout: SIDEBAR_FIND_TIMEOUT_MS }));
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();
    firstRender.unmount();

    renderLayout();
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();
  });

  it("does not mount project AI sidebar on /home (MVP policy)", async () => {
    const queryClient = createQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/home" element={<div>Home surface</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByLabelText("Ask Shurik...")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /toggle shurik's panel/i })).not.toBeInTheDocument();
  });

  it("opens again after clearing session preference", async () => {
    writeAiSidebarSessionPreference(true);
    const collapsedRender = renderLayout();
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();
    collapsedRender.unmount();

    clearAiSidebarSessionPreference();
    const reopenedRender = renderLayout();
    expect(await screen.findByLabelText("Ask Shurik...", undefined, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toBeInTheDocument();
    reopenedRender.unmount();
  });

  it("shows Shurik hanging in the corner instead of a strip when the sidebar is collapsed", async () => {
    writeAiSidebarSessionPreference(true);
    const { container } = renderLayout();

    const opener = screen.getByRole("button", { name: "Open Shurik" });
    const figure = opener.querySelector("img");
    expect(figure?.getAttribute("src")).toBe("/shurik/avatar.png");
    expect(figure?.parentElement).toHaveClass("animate-shurik-sway");
    expect(opener).toHaveClass("fixed", "bottom-4", "left-4");
    expect(container.querySelector(".w-12.border-r")).toBeNull();

    fireEvent.click(opener);
    expect(await screen.findByLabelText("Ask Shurik...", undefined, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Shurik" })).not.toBeInTheDocument();
  });

  it("leaves room under the page for the hanging Shurik only while the sidebar is collapsed", async () => {
    writeAiSidebarSessionPreference(true);
    renderLayout();
    expect(screen.getByRole("main")).toHaveClass("md:pb-24");

    fireEvent.click(screen.getByRole("button", { name: "Open Shurik" }));
    await screen.findByLabelText("Ask Shurik...", undefined, { timeout: SIDEBAR_FIND_TIMEOUT_MS });
    expect(screen.getByRole("main")).not.toHaveClass("md:pb-24");
  });

  function renderOutsideProject(path = "/home") {
    return render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/home" element={<div>Home surface</div>} />
              <Route path="/settings" element={<LocationProbe />} />
              <Route path="/billing/checkout" element={<div>Checkout surface</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it.each(["/home", "/settings", "/billing/checkout"])(
    "hangs Shurik in the same bottom-left corner outside a project: %s",
    (path) => {
      renderOutsideProject(path);

      const opener = screen.getByRole("button", { name: "Open Shurik" });
      expect(opener).toHaveClass("fixed", "bottom-4", "left-4");
      expect(opener.querySelector("img")?.parentElement).toHaveClass("animate-shurik-sway");
      expect(screen.queryByTestId("shurik-unread-badge")).not.toBeInTheDocument();
      expect(screen.getByRole("main")).toHaveClass("md:pb-24");
    },
  );

  it("opens a panel with notifications only outside a project: no Chat tab, no input, a Notifications heading", () => {
    addUnreadMessage();
    renderOutsideProject("/home");

    const opener = screen.getByRole("button", { name: "Open Shurik, 1 unread notification" });
    expect(within(opener).getByTestId("shurik-unread-badge")).toHaveTextContent("1");
    fireEvent.click(opener);

    const panel = screen.getByRole("complementary", { name: "Notifications" });
    expect(within(panel).getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(within(panel).getByText(/Не прошло списание 2 990 ₽/)).toBeInTheDocument();
    expect(within(panel).getByTestId("shurik-message-msg-1").querySelector("img")?.getAttribute("src")).toBe("/shurik/salute.png");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ask Shurik...")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Open Shurik/ })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveClass("md:pb-24");

    fireEvent.click(within(panel).getByRole("button", { name: "Close notifications" }));
    expect(screen.queryByRole("complementary", { name: "Notifications" })).not.toBeInTheDocument();
    // Opening the panel read the message, so the number is gone.
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();
  });

  it("says there is nothing when the panel outside a project is empty", () => {
    renderOutsideProject("/home");
    fireEvent.click(screen.getByRole("button", { name: "Open Shurik" }));

    expect(within(screen.getByRole("complementary", { name: "Notifications" })).getByText("No notifications")).toBeInTheDocument();
  });

  it("shows the first line outside a project too and opens the panel from it", () => {
    renderOutsideProject("/home");

    act(() => {
      addUnreadMessage();
    });
    fireEvent.click(screen.getByTestId("shurik-peek"));

    expect(screen.getByRole("complementary", { name: "Notifications" })).toBeInTheDocument();
  });

  function renderWholeApp(path: string) {
    return render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter initialEntries={[path]}>
          <NavProbe />
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/home" element={<div>Home surface</div>} />
              <Route path="/settings" element={<LocationProbe />} />
              <Route path="/project/:id/dashboard" element={<div>Dashboard</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("closes the panel outside a project once the message's button has opened its page", () => {
    addUnreadMessage();
    renderOutsideProject("/home");
    fireEvent.click(screen.getByRole("button", { name: /^Open Shurik/ }));

    fireEvent.click(screen.getByRole("button", { name: "Обновить карту" }));

    expect(screen.getByTestId("location")).toHaveTextContent("/settings?tab=billing");
    expect(screen.queryByRole("complementary", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("closes the panel outside a project when the page under it changes, a query string included", () => {
    renderWholeApp("/home");
    fireEvent.click(screen.getByRole("button", { name: "Open Shurik" }));
    expect(screen.getByRole("complementary", { name: "Notifications" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "go /settings" }));
    expect(screen.queryByRole("complementary", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveClass("hidden");

    fireEvent.click(screen.getByRole("button", { name: "Open Shurik" }));
    expect(screen.getByRole("complementary", { name: "Notifications" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "go /settings?tab=billing" }));
    expect(screen.queryByRole("complementary", { name: "Notifications" })).not.toBeInTheDocument();
  });

  it("does not bring the panel outside a project back after a trip into a project", () => {
    writeAiSidebarSessionPreference(true);
    renderWholeApp("/home");
    fireEvent.click(screen.getByRole("button", { name: "Open Shurik" }));
    expect(screen.getByRole("complementary", { name: "Notifications" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "go /project/project-1/dashboard" }));
    fireEvent.click(screen.getByRole("button", { name: "go /home" }));

    expect(screen.queryByRole("complementary", { name: "Notifications" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();
  });

  it("keeps the first line on screen when the person crosses from a project to the home page", () => {
    writeAiSidebarSessionPreference(true);
    renderWholeApp("/project/project-1/dashboard");
    act(() => {
      addUnreadMessage();
    });
    const peek = screen.getByTestId("shurik-peek");

    fireEvent.click(screen.getByRole("button", { name: "go /home" }));

    expect(screen.getByText("Home surface")).toBeInTheDocument();
    expect(screen.getByTestId("shurik-peek")).toBe(peek);
  });

  it("opens on Chat when the panel is opened for the chat, even if Notifications was shown last", async () => {
    renderLayout();
    fireEvent.click(await screen.findByRole("tab", { name: /Notifications/ }, { timeout: SIDEBAR_FIND_TIMEOUT_MS }));
    expect(screen.getByRole("tab", { name: /Notifications/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: /toggle shurik's panel/i }));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();

    act(() => {
      openPhotoConsult({
        photo: {
          id: "photo-1",
          project_id: "project-1",
          caption: "Paver alignment check",
          uploader_id: "owner",
          is_final: false,
          created_at: "2026-03-07T10:00:00.000Z",
        },
      });
    });

    expect(await screen.findByRole("tab", { name: "Chat" }, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Paver alignment check")).toBeVisible();
  });

  it("re-reads who is signed in when that changes outside a project", () => {
    renderOutsideProject("/home");
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();

    act(() => {
      setAuthRole("guest");
    });

    expect(screen.queryByRole("button", { name: /^Open Shurik/ })).not.toBeInTheDocument();
  });

  it("shows no Shurik outside a project to a guest, and leaves no room for him", () => {
    setAuthRole("guest");
    writeAiSidebarSessionPreference(true);
    renderOutsideProject("/home");

    expect(screen.queryByRole("button", { name: /^Open Shurik/ })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).not.toHaveClass("md:pb-24");
  });

  describe("on a phone", () => {
    const desktopWidth = window.innerWidth;

    beforeEach(() => {
      window.innerWidth = 390;
    });

    afterEach(() => {
      window.innerWidth = desktopWidth;
    });

    it("puts a 30px Shurik in the top bar on the right with a 13px number on his corner", () => {
      addUnreadMessage();
      renderOutsideProject("/home");

      const opener = within(screen.getByRole("banner")).getByRole("button", { name: "Open Shurik, 1 unread notification" });
      const figure = opener.querySelector("img")!;
      expect(figure.getAttribute("width")).toBe("30");
      expect(figure.getAttribute("height")).toBe("30");
      const badge = within(opener).getByTestId("shurik-unread-badge");
      expect(badge).toHaveTextContent("1");
      expect(badge).toHaveClass("h-[13px]", "min-w-[13px]", "absolute", "-right-[7px]", "-top-[5px]");
      // He is the last thing in the bar: on the right.
      expect(opener.parentElement?.lastElementChild).toBe(opener);
    });

    it("opens the notifications panel over the whole screen outside a project, and the page comes back with the button", () => {
      addUnreadMessage();
      renderOutsideProject("/home");

      fireEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: /^Open Shurik/ }));

      const panel = screen.getByRole("complementary", { name: "Notifications" });
      expect(panel).toHaveClass("w-full");
      expect(screen.getByRole("main")).toHaveClass("hidden", "md:block");

      fireEvent.click(within(panel).getByRole("button", { name: "Обновить карту" }));
      expect(screen.getByTestId("location")).toHaveTextContent("/settings?tab=billing");
      expect(screen.queryByRole("complementary", { name: "Notifications" })).not.toBeInTheDocument();
    });

    it("opens the project panel on Notifications from the top bar", async () => {
      addUnreadMessage();
      renderLayout();
      expect(screen.queryByRole("tab")).not.toBeInTheDocument();

      fireEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: /^Open Shurik/ }));

      expect(await screen.findByRole("tab", { name: /Notifications/ }, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByText(/Не прошло списание 2 990 ₽/)).toBeVisible();
    });

    it("has no Shurik in the top bar for a guest", () => {
      setAuthRole("guest");
      renderOutsideProject("/home");

      expect(within(screen.getByRole("banner")).queryByRole("button", { name: /^Open Shurik/ })).not.toBeInTheDocument();
    });
  });

  it("keeps Shurik out of the top bar on a wide screen", () => {
    renderOutsideProject("/home");

    expect(within(screen.getByRole("banner")).queryByRole("button", { name: /^Open Shurik/ })).not.toBeInTheDocument();
  });

  it("keeps the hanging Shurik off screens narrower than the tablet breakpoint", () => {
    writeAiSidebarSessionPreference(true);
    renderLayout();

    expect(screen.getByRole("button", { name: "Open Shurik" })).toHaveClass("hidden", "md:block");
  });

  it("puts the number of unread messages on the hanging Shurik and none when all are read", () => {
    writeAiSidebarSessionPreference(true);
    const first = renderLayout();
    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();
    expect(screen.queryByTestId("shurik-unread-badge")).not.toBeInTheDocument();
    first.unmount();

    addUnreadMessage({ id: "msg-1" });
    addUnreadMessage({ id: "msg-2" });
    renderLayout();

    const opener = screen.getByRole("button", { name: "Open Shurik, 2 unread notifications" });
    expect(within(opener).getByTestId("shurik-unread-badge")).toHaveTextContent("2");
  });

  it("shows the first line of a message that arrives while the panel is closed and opens on Notifications from it", async () => {
    writeAiSidebarSessionPreference(true);
    renderLayout();
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();

    act(() => {
      addUnreadMessage();
    });

    const peek = screen.getByTestId("shurik-peek");
    expect(peek).toHaveTextContent("Не прошло списание за подписку");

    fireEvent.click(peek);

    const notificationsTab = await screen.findByRole("tab", { name: /Notifications/ }, { timeout: SIDEBAR_FIND_TIMEOUT_MS });
    expect(notificationsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Не прошло списание 2 990 ₽/)).toBeVisible();
    expect(screen.getByLabelText("Ask Shurik...")).not.toBeVisible();
    expect(screen.queryByTestId("shurik-peek")).not.toBeInTheDocument();
  });

  it("opens on Notifications from the hanging Shurik while something is unread, and on Chat otherwise", async () => {
    writeAiSidebarSessionPreference(true);
    const first = renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Open Shurik" }));
    expect(await screen.findByRole("tab", { name: "Chat" }, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toHaveAttribute("aria-selected", "true");
    first.unmount();

    writeAiSidebarSessionPreference(true);
    addUnreadMessage();
    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: /^Open Shurik, 1 unread/ }));
    expect(await screen.findByRole("tab", { name: /Notifications/ }, { timeout: SIDEBAR_FIND_TIMEOUT_MS })).toHaveAttribute("aria-selected", "true");
  });

  it("auto-opens the AI sidebar when photo consult is triggered while collapsed", async () => {
    writeAiSidebarSessionPreference(true);
    renderLayout();

    expect(screen.getByRole("button", { name: "Open Shurik" })).toBeInTheDocument();

    act(() => {
      openPhotoConsult({
        photo: {
          id: "photo-1",
          project_id: "project-1",
          caption: "Paver alignment check",
          uploader_id: "owner",
          is_final: false,
          created_at: "2026-03-07T10:00:00.000Z",
        },
      });
    });

    expect(await screen.findByText("Paver alignment check")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open Shurik" })).not.toBeInTheDocument();
    expect(sessionStorage.getItem("workspace-ai-sidebar-collapsed")).toBe("true");
  });
});
