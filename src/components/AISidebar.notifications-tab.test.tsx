import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";
import { AISidebar } from "@/components/AISidebar";
import type { ShurikPanelTab } from "@/components/ai/ShurikPanelTabs";
import {
  __unsafeResetStoreForTests,
  addMember,
  addProject,
  addShurikMessage,
  getShurikMessages,
} from "@/data/store";
import { clearDemoSession, clearStoredAuthProfile, setAuthRole, setStoredAuthProfile } from "@/lib/auth-state";

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

describe("AISidebar tabs: Chat and Notifications", () => {
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

  function addMoneyMessage() {
    addShurikMessage({
      id: "msg-money",
      user_id: profileId,
      project_id: null,
      type: "billing_payment_failed",
      title: "Не прошло списание за подписку",
      body: "Не прошло списание 2 990 ₽ за подписку. Автопродление выключено.",
      is_read: false,
      read_at: null,
      created_at: new Date().toISOString(),
      payload: { action_label: "Обновить карту", action_href: "/settings?tab=billing" },
    });
  }

  it("opens on Chat with the composer, and carries the unread number on the Notifications tab", () => {
    addMoneyMessage();
    renderSidebar();

    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    const notificationsTab = screen.getByRole("tab", { name: /Notifications/ });
    expect(within(notificationsTab).getByTestId("shurik-unread-badge")).toHaveTextContent("1");
    expect(screen.getByPlaceholderText("Ask Shurik...")).toBeVisible();
    expect(screen.queryByText(/Не прошло списание 2 990 ₽/)).not.toBeInTheDocument();
  });

  it("shows Shurik's message without an input field on Notifications and marks it read", () => {
    addMoneyMessage();
    renderSidebar();

    fireEvent.click(screen.getByRole("tab", { name: /Notifications/ }));

    expect(screen.getByRole("tab", { name: /Notifications/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/Не прошло списание 2 990 ₽/)).toBeVisible();
    expect(screen.getByPlaceholderText("Ask Shurik...")).not.toBeVisible();
    expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();

    const figure = screen.getByTestId("shurik-message-msg-money").querySelector("img")!;
    expect(figure.getAttribute("src")).toBe("/shurik/salute.png");

    expect(getShurikMessages(profileId)[0].is_read).toBe(true);
    expect(screen.queryByTestId("shurik-unread-badge")).not.toBeInTheDocument();
  });

  it("brings the composer and what was typed back on Chat", () => {
    renderSidebar();
    fireEvent.change(screen.getByPlaceholderText("Ask Shurik..."), { target: { value: "half a question" } });

    fireEvent.click(screen.getByRole("tab", { name: /Notifications/ }));
    expect(screen.getByText("No notifications")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));

    const composer = screen.getByPlaceholderText("Ask Shurik...");
    expect(composer).toBeVisible();
    expect(composer).toHaveValue("half a question");
  });

  it("gives each tab a panel that is named by it", () => {
    addMoneyMessage();
    renderSidebar();

    const chatPanel = screen.getByRole("tabpanel", { name: "Chat" });
    expect(within(chatPanel).getByPlaceholderText("Ask Shurik...")).toBeVisible();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);

    fireEvent.keyDown(screen.getByRole("tab", { name: "Chat" }), { key: "ArrowRight" });

    const notificationsPanel = screen.getByRole("tabpanel", { name: /Notifications/ });
    expect(within(notificationsPanel).getByText(/Не прошло списание 2 990 ₽/)).toBeVisible();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });

  it("can be opened straight on Notifications", () => {
    addMoneyMessage();
    renderSidebar("notifications");

    expect(screen.getByText(/Не прошло списание 2 990 ₽/)).toBeVisible();
    expect(screen.getByPlaceholderText("Ask Shurik...")).not.toBeVisible();
  });
});
