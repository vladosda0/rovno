import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";

const listMock = vi.fn();
const detailMock = vi.fn();

vi.mock("@/hooks/use-estimate-templates", () => ({
  useEstimateTemplates: (scopeFilter?: string | null) => listMock(scopeFilter),
  useEstimateTemplateDetail: (templateId: string | null | undefined) => detailMock(templateId),
}));

import { EstimateTemplatesTab } from "@/components/home/EstimateTemplatesTab";

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TooltipProvider>
          <EstimateTemplatesTab />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const CANONICAL_SUMMARY = {
  id: "tpl-1",
  ownerKind: "system" as const,
  ownerLabel: "rovno.ai",
  title: "rovno.ai канонический ИЖС",
  description: "Базовый шаблон сметы по ИЖС.",
  scope: "ИЖС",
  publishedToPublic: true,
  coverImageUrl: null,
  stageCount: 21,
  isManageable: false,
  updatedAt: "2026-05-12T10:00:00Z",
};

const TWENTY_ONE_STAGES = Array.from({ length: 21 }, (_, idx) => ({
  id: `stage-${idx + 1}`,
  title: `Stage ${idx + 1}`,
  description: `Stage description ${idx + 1}`,
  scopeTag: "ИЖС",
  sortHint: (idx + 1) * 10,
  workCount: 0,
  resourceCount: 0,
  works: [],
}));

const DETAIL = {
  id: "tpl-1",
  ownerKind: "system" as const,
  ownerId: null,
  title: "rovno.ai канонический ИЖС",
  description: "Базовый шаблон сметы по ИЖС.",
  scope: "ИЖС",
  publishedToPublic: true,
  coverImageUrl: null,
  updatedAt: "2026-05-12T10:00:00Z",
  createdAt: "2026-05-12T10:00:00Z",
  stages: TWENTY_ONE_STAGES,
};

describe("EstimateTemplatesTab", () => {
  beforeEach(() => {
    listMock.mockReset();
    detailMock.mockReset();
    detailMock.mockReturnValue({ data: null, isPending: false, isError: false });
  });

  it("renders template cards from list_estimate_templates", () => {
    listMock.mockReturnValue({ data: [CANONICAL_SUMMARY], isPending: false, isError: false });
    renderTab();
    expect(screen.getByRole("heading", { name: "Estimate templates" })).toBeInTheDocument();
    expect(screen.getByText("rovno.ai канонический ИЖС")).toBeInTheDocument();
    expect(screen.getByText("21 stages")).toBeInTheDocument();
  });

  it("opens the detail dialog with 21 stages and a disabled Apply button", async () => {
    listMock.mockReturnValue({ data: [CANONICAL_SUMMARY], isPending: false, isError: false });
    detailMock.mockImplementation((id: string | null) =>
      id ? { data: DETAIL, isPending: false, isError: false } : { data: null, isPending: false, isError: false },
    );

    renderTab();
    fireEvent.click(screen.getByText("rovno.ai канонический ИЖС"));

    const dialog = await screen.findByRole("dialog");
    const stages = within(dialog).getAllByRole("listitem");
    expect(stages).toHaveLength(21);
    expect(within(dialog).getByText("Stage 1")).toBeInTheDocument();
    expect(within(dialog).getByText("Stage 21")).toBeInTheDocument();

    const applyBtn = within(dialog).getByRole("button", { name: "Apply to estimate" });
    expect(applyBtn).toBeDisabled();
  });

  it("shows the empty state when no templates are returned", () => {
    listMock.mockReturnValue({ data: [], isPending: false, isError: false });
    renderTab();
    expect(screen.getByText("No templates available.")).toBeInTheDocument();
  });

  it("shows the error message when the RPC fails", async () => {
    listMock.mockReturnValue({ data: undefined, isPending: false, isError: true });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText("Failed to load templates.")).toBeInTheDocument();
    });
  });
});
