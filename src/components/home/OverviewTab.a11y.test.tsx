// The two Home widget controls are icon-only, so their aria-label is the whole
// accessible name a screen reader gets on the first screen after login.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { OverviewTab } from "@/components/home/OverviewTab";
import i18n from "@/i18n";

const mocks = vi.hoisted(() => ({
  useProjects: vi.fn(() => []),
  useCurrentUser: vi.fn(() => null),
  useWorkspaceMode: vi.fn(() => ({ kind: "demo" as const })),
  useProjectsRecentEventsState: vi.fn(() => ({ eventsByProject: {}, isSettled: true })),
  useWorkspaceProjectsSensitiveDetailMap: vi.fn(() => ({
    canViewSensitiveDetailByProjectId: new Map<string, boolean>(),
    isLoading: false,
  })),
  getAllTasks: vi.fn(() => []),
  getProject: vi.fn(() => undefined),
  getUserById: vi.fn(() => undefined),
  // Список проектов на главной берёт статус и прогресс из сметы и задач, и эта
  // ветка тянет @/data/store глубже: inventory-store зовёт getProjects прямо
  // при загрузке модуля. Без этих двух мок недостаточен, и файл падает на
  // импорте, а не на проверке.
  getProjects: vi.fn(() => []),
  getStages: vi.fn(() => []),
  getTasks: vi.fn(() => []),
  subscribe: vi.fn(() => () => {}),
}));

vi.mock("@/hooks/use-mock-data", () => ({
  useProjects: mocks.useProjects,
  useCurrentUser: mocks.useCurrentUser,
  useWorkspaceMode: mocks.useWorkspaceMode,
}));

vi.mock("@/hooks/use-activity-source", () => ({
  useProjectsRecentEventsState: mocks.useProjectsRecentEventsState,
}));

vi.mock("@/hooks/use-home-sensitive-detail-map", () => ({
  useWorkspaceProjectsSensitiveDetailMap: mocks.useWorkspaceProjectsSensitiveDetailMap,
}));

vi.mock("@/data/store", () => ({
  getAllTasks: mocks.getAllTasks,
  getProject: mocks.getProject,
  getUserById: mocks.getUserById,
  getProjects: mocks.getProjects,
  getStages: mocks.getStages,
  getTasks: mocks.getTasks,
  subscribe: mocks.subscribe,
}));

vi.mock("@/components/home/OrgBlock", () => ({
  OrgBlock: () => null,
}));

vi.mock("@/components/home/PendingInvitationsBlock", () => ({
  PendingInvitationsBlock: () => null,
}));

async function switchLanguage(lang: string) {
  await act(async () => {
    await i18n.changeLanguage(lang);
  });
}

beforeEach(async () => {
  await switchLanguage("ru");
});

afterEach(async () => {
  await switchLanguage("en");
});

describe("OverviewTab view-all controls", () => {
  it("names both widget controls in Russian", () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OverviewTab />
      </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByRole("button", { name: "Все проекты" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Все задачи" })).toBeInTheDocument();
  });

  it("leaves no English accessible name on the widgets", () => {
    const { container } = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OverviewTab />
      </MemoryRouter>
      </QueryClientProvider>,
    );

    const english = Array.from(container.querySelectorAll("[aria-label]")).filter((el) =>
      (el.getAttribute("aria-label") ?? "").startsWith("View all"),
    );
    expect(english).toEqual([]);
  });
});

describe("OverviewTab cards and quick actions", () => {
  function renderOverview() {
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OverviewTab />
      </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("explains an empty recent-activity card instead of showing a bare heading", () => {
    renderOverview();

    const heading = screen.getByRole("heading", { name: "Недавняя активность" });
    const card = heading.parentElement as HTMLElement;
    expect(card.textContent?.replace(heading.textContent ?? "", "").trim()).toBe(
      "Пока нет активности по проектам.",
    );
  });

  it("offers no «Новая задача» quick action that only opens the task list", () => {
    renderOverview();

    expect(screen.queryByRole("button", { name: /Новая задача/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Все задачи" })).toBeInTheDocument();
  });
});

describe("OverviewTab recent activity with events", () => {
  afterEach(() => {
    mocks.useProjects.mockReturnValue([]);
    mocks.useProjectsRecentEventsState.mockReturnValue({ eventsByProject: {}, isSettled: true });
  });

  it("does not claim «no activity» while the events are still loading", () => {
    mocks.useProjectsRecentEventsState.mockReturnValue({ eventsByProject: {}, isSettled: false });

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OverviewTab />
      </MemoryRouter>
      </QueryClientProvider>,
    );

    const card = screen.getByRole("heading", { name: "Недавняя активность" }).parentElement as HTMLElement;
    expect(card).not.toHaveTextContent("Пока нет активности по проектам.");
  });

  it("does not show the empty line when a project has events", () => {
    mocks.useProjects.mockReturnValue([{ id: "p1", title: "Дом", progress_pct: 0 }] as never);
    mocks.useProjectsRecentEventsState.mockReturnValue({ isSettled: true, eventsByProject: {
      p1: [{
        id: "e1",
        project_id: "p1",
        actor_id: "u1",
        type: "task_created",
        object_type: "task",
        object_id: "t1",
        timestamp: "2026-11-01T10:00:00.000Z",
        payload: { title: "Залить фундамент" },
      }],
    } } as never);

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OverviewTab />
      </MemoryRouter>
      </QueryClientProvider>,
    );

    const card = screen.getByRole("heading", { name: "Недавняя активность" }).parentElement as HTMLElement;
    expect(card).toHaveTextContent("— Дом");
    expect(card).not.toHaveTextContent("Пока нет активности по проектам.");
  });
});
