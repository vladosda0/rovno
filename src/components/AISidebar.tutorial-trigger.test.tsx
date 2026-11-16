import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { AISidebar } from "@/components/AISidebar";

vi.mock("@/components/onboarding/TutorialModal", () => ({
  TutorialModal: ({ tutorialKey, shouldOpen }: { tutorialKey: string; shouldOpen?: boolean }) => (
    <div data-testid={`tutorial-${tutorialKey}`} data-should-open={String(Boolean(shouldOpen))} />
  ),
}));

import type { ShurikPanelTab } from "@/components/ai/ShurikPanelTabs";
import {
  __unsafeResetStoreForTests,
  addMember,
  addProject,
} from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";

const chatTutorialArmed = () =>
  screen.getByTestId("tutorial-ai_sidebar").getAttribute("data-should-open") === "true";

function ControlledSidebar({ initialTab = "chat" }: { initialTab?: ShurikPanelTab }) {
  const [tab, setTab] = useState<ShurikPanelTab>(initialTab);
  return <AISidebar collapsed={false} onCollapsedChange={vi.fn()} panelTab={tab} onPanelTabChange={setTab} />;
}

function renderSidebar(initialTab?: ShurikPanelTab) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/project/project-a/dashboard"]}>
        <ControlledSidebar initialTab={initialTab} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AISidebar chat tutorial trigger", () => {
  let profileId = "";

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setAuthRole("guest");
    clearStoredAuthProfile();
    clearDemoSession();
    const profile = setStoredAuthProfile({ email: "owner@example.com", name: "Owner User" });
    profileId = profile.id;
    setAuthRole("owner");
    __unsafeResetStoreForTests();

    addProject({
      id: "project-a",
      owner_id: profile.id,
      title: "Project A",
      type: "residential",
      automation_level: "assisted",
      current_stage_id: "",
      progress_pct: 0,
    });
    addMember({
      project_id: "project-a",
      user_id: profile.id,
      role: "owner",
      ai_access: "project_pool",
      credit_limit: 500,
      used_credits: 0,
    });
  });

  it("does not open the chat tutorial on a first press of the Notifications tab", () => {
    renderSidebar();
    const notificationsTab = screen.getByRole("tab", { name: /Notifications/ });

    fireEvent.pointerDown(notificationsTab);
    fireEvent.click(notificationsTab);

    expect(chatTutorialArmed()).toBe(false);
  });

  it("does not open the chat tutorial on a press inside the Notifications panel", () => {
    renderSidebar("notifications");

    fireEvent.pointerDown(screen.getByRole("tabpanel", { name: /Notifications/ }));

    expect(chatTutorialArmed()).toBe(false);
  });

  it("opens the chat tutorial on a first press inside the chat", () => {
    renderSidebar();
    expect(chatTutorialArmed()).toBe(false);

    fireEvent.pointerDown(screen.getByLabelText("Ask Shurik..."));

    expect(chatTutorialArmed()).toBe(true);
  });

  it("opens the chat tutorial on the first press in the chat after visiting Notifications", () => {
    renderSidebar("notifications");
    const chatTab = screen.getByRole("tab", { name: "Chat" });

    fireEvent.pointerDown(chatTab);
    fireEvent.click(chatTab);
    fireEvent.pointerDown(screen.getByLabelText("Ask Shurik..."));

    expect(chatTutorialArmed()).toBe(true);
  });
});
