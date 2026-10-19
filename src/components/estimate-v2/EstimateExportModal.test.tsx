import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ExportPayload } from "@/lib/estimate-export-data";
import { EstimateExportModal } from "@/components/estimate-v2/EstimateExportModal";

const { mockDownloadSheets, mockPrint, mockToast, mockSaveOrgCard, mockSaveClientInfo, orgCard, clientInfo } = vi.hoisted(() => ({
  orgCard: { data: { legalName: "ООО Ремонт", signatoryName: "Петров П. П." } },
  clientInfo: { data: { name: "Иванов И. И." } },
  mockDownloadSheets: vi.fn(),
  mockPrint: vi.fn(),
  mockToast: vi.fn(),
  mockSaveOrgCard: vi.fn(),
  mockSaveClientInfo: vi.fn(),
}));

vi.mock("@/lib/download-pdf", () => ({ downloadSheetsAsPdf: mockDownloadSheets }));
vi.mock("@/lib/print-html", () => ({ printHtmlDocument: mockPrint }));
vi.mock("@/hooks/use-toast", () => ({
  toast: mockToast,
  useToast: () => ({ toast: mockToast, dismiss: vi.fn(), toasts: [] }),
}));
vi.mock("@/hooks/use-orgs", () => ({ useActiveOrg: () => ({ id: "org-1" }) }));
vi.mock("@/hooks/use-org-card", () => ({
  useOrgCard: () => orgCard,
  useClientInfo: () => clientInfo,
  useSetOrgCard: () => ({ mutateAsync: mockSaveOrgCard }),
  useSetClientInfo: () => ({ mutateAsync: mockSaveClientInfo }),
}));

function payload(): ExportPayload {
  return {
    projectId: "p1",
    projectTitle: "Ленина 42",
    currency: "RUB",
    projectMode: "build_myself",
    hasSensitiveDetail: false,
    hasSummaryClientPricing: true,
    hasDiscountedClientTotal: false,
    stages: [
      {
        id: "s1",
        title: "Демонтаж",
        number: 1,
        works: [
          {
            id: "w1",
            title: "Снос перегородок",
            number: "1.1",
            lines: [
              {
                id: "l1",
                title: "Работа",
                type: "labor",
                typeLabel: "Работа",
                qtyMilli: 1000,
                unit: "м²",
                costUnitCents: 1000,
                costTotalCents: 1000,
                markupBps: 0,
                discountBps: 0,
                clientUnitCents: 1000,
                clientTotalCents: 1000,
                discountedClientTotalCents: null,
              },
            ],
          },
        ],
      },
    ],
    totals: {
      subtotalBeforeDiscountCents: 1000,
      discountTotalCents: 0,
      taxableBaseCents: 1000,
      vatBps: 0,
      taxAmountCents: 0,
      totalIncVatCents: 1000,
    },
    versionShareId: null,
    generatedAt: "2026-10-15T00:00:00.000Z",
  };
}

function renderModal(canShowInternal = true, data: ExportPayload = payload()) {
  return render(
    <EstimateExportModal
      open
      onOpenChange={vi.fn()}
      payload={data}
      canShowInternal={canShowInternal}
      onDownloadCsv={vi.fn()}
      onEnsureShareLink={vi.fn()}
    />,
  );
}

describe("EstimateExportModal: Download PDF", () => {
  beforeEach(() => {
    mockDownloadSheets.mockReset();
    mockDownloadSheets.mockResolvedValue(undefined);
    mockPrint.mockReset();
    mockToast.mockReset();
    mockSaveOrgCard.mockReset();
    mockSaveOrgCard.mockResolvedValue(undefined);
    mockSaveClientInfo.mockReset();
    mockSaveClientInfo.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves a PDF file of the chosen variant and opens no print dialog", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(mockDownloadSheets).toHaveBeenCalledTimes(1));
    const [sheets, options] = mockDownloadSheets.mock.calls[0];
    expect(sheets.length).toBeGreaterThan(0);
    expect(sheets[0].textContent).toContain("Снос перегородок");
    expect(options).toEqual(
      expect.objectContaining({ orientation: "portrait", fileName: expect.stringContaining("Ленина 42") }),
    );
    expect(mockPrint).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Save as PDF" }),
    );
  });

  it("lays the internal variant out on landscape pages", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("radio", { name: /Internal/ }));
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() => expect(mockDownloadSheets).toHaveBeenCalledTimes(1));
    expect(mockDownloadSheets.mock.calls[0][1]).toEqual(
      expect.objectContaining({ orientation: "landscape", fileName: expect.stringContaining("Internal") }),
    );
  });

  it("tells the person when the file could not be built", async () => {
    mockDownloadSheets.mockRejectedValue(new Error("canvas"));
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
    expect(mockPrint).not.toHaveBeenCalled();
  });

  it("puts the signing details into the file after saving them, once per click", async () => {
    let finishSave: () => void = () => {};
    mockSaveOrgCard.mockReturnValue(new Promise<void>((resolve) => { finishSave = resolve; }));
    renderModal();

    fireEvent.click(screen.getByRole("radio", { name: /For signing/ }));
    const button = screen.getByRole("button", { name: "Download PDF" });
    fireEvent.click(button);
    fireEvent.click(button);
    finishSave();

    await waitFor(() => expect(mockDownloadSheets).toHaveBeenCalledTimes(1));
    const sheets: HTMLElement[] = mockDownloadSheets.mock.calls[0][0];
    const text = sheets.map((sheet) => sheet.textContent).join(" ");
    expect(text).toContain("ООО Ремонт");
    expect(text).toContain("Иванов И. И.");
    expect(mockSaveOrgCard).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockDownloadSheets).toHaveBeenCalledTimes(1);
  });

  it("builds the file from the estimate as it was when the button was pressed", async () => {
    let finishSave: () => void = () => {};
    mockSaveOrgCard.mockReturnValue(new Promise<void>((resolve) => { finishSave = resolve; }));
    const { rerender } = renderModal();

    fireEvent.click(screen.getByRole("radio", { name: /For signing/ }));
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    const changed = payload();
    changed.stages[0].works[0].title = "Покраска стен";
    rerender(
      <EstimateExportModal
        open
        onOpenChange={vi.fn()}
        payload={changed}
        canShowInternal
        onDownloadCsv={vi.fn()}
        onEnsureShareLink={vi.fn()}
      />,
    );
    finishSave();

    await waitFor(() => expect(mockDownloadSheets).toHaveBeenCalledTimes(1));
    const text = mockDownloadSheets.mock.calls[0][0].map((sheet: HTMLElement) => sheet.textContent).join(" ");
    expect(text).toContain("Снос перегородок");
  });

  it("tells the person when the signing details could not be saved", async () => {
    mockSaveOrgCard.mockRejectedValue(new Error("network"));
    renderModal();

    fireEvent.click(screen.getByRole("radio", { name: /For signing/ }));
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })),
    );
    expect(mockDownloadSheets).not.toHaveBeenCalled();
  });

  it("still prints with Print", async () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "Print" }));

    await waitFor(() => expect(mockPrint).toHaveBeenCalledTimes(1));
    expect(mockDownloadSheets).not.toHaveBeenCalled();
  });
});
