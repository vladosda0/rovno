import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { ResourceModal } from "@/components/estimate-v2/ResourceModal";
import type { EstimateV2ResourceLine } from "@/types/estimate-v2";

const { priceComparisonSpy } = vi.hoisted(() => ({ priceComparisonSpy: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

vi.mock("@/hooks/use-resource-article", () => ({
  useResourceArticleDetail: () => ({
    isLoading: false,
    data: {
      article: {
        id: "a1",
        name: "Песок речной 0.5-1.0",
        canonicalName: "Песок речной",
        categoryPath: "rovno_seed / Материалы / Сыпучие и грунты",
        subcategory: "Сыпучие и грунты",
        kind: "leaf",
        unitDisplay: "м³",
        unitOriginal: "м3",
        conversionFactor: 1,
        okpd2Code: "08.12.11",
        rovnoSku: "RS-SAND-001",
        defaultResourceType: "material",
        source: "rovno_seed",
        isResidentialCurated: true,
      },
      siblings: [],
    },
  }),
  useResourceArticlePriceComparison: (...args: unknown[]) => {
    priceComparisonSpy(...args);
    return {
      data: {
        articleId: "a1",
        sampleCount: 4,
        projectCount: 3,
        medianCents: 50000,
        avgCents: 52000,
        minCents: 40000,
        maxCents: 70000,
      },
    };
  },
}));

const line: EstimateV2ResourceLine = {
  id: "l1",
  projectId: "p1",
  stageId: "s1",
  workId: "w1",
  title: "Песок речной",
  type: "material",
  unit: "м³",
  qtyMilli: 2000,
  costUnitCents: 48000,
  systemResourceArticleId: "a1",
  markupBps: 2000,
  discountBpsOverride: null,
  assigneeId: null,
  assigneeName: null,
  assigneeEmail: null,
  receivedCents: 0,
  pnlPlaceholderCents: 0,
  createdAt: "2026-06-14T00:00:00Z",
  updatedAt: "2026-06-14T00:00:00Z",
};

describe("ResourceModal", () => {
  it("renders all six tabs with suppliers/guides disabled", () => {
    render(
      <ResourceModal
        open
        onOpenChange={() => {}}
        articleId="a1"
        projectId="p1"
        line={line}
        lines={[line]}
        versions={[]}
        canViewSensitiveDetail
      />,
    );

    expect(screen.getByText("estimate.resourceModal.tabs.description")).toBeInTheDocument();
    expect(screen.getByText("estimate.resourceModal.tabs.article")).toBeInTheDocument();
    expect(screen.getByText("estimate.resourceModal.tabs.context")).toBeInTheDocument();
    expect(screen.getByText("estimate.resourceModal.tabs.priceHistory")).toBeInTheDocument();

    const suppliers = screen.getByText("estimate.resourceModal.tabs.suppliers").closest("button");
    const guides = screen.getByText("estimate.resourceModal.tabs.guides").closest("button");
    expect(suppliers).toBeDisabled();
    expect(guides).toBeDisabled();
  });

  it("shows the canonical article on the default tab", () => {
    render(
      <ResourceModal
        open
        onOpenChange={() => {}}
        articleId="a1"
        projectId="p1"
        line={line}
        lines={[line]}
        versions={[]}
        canViewSensitiveDetail
      />,
    );
    // default (description) tab shows the source badge + subcategory
    expect(screen.getByText("rovno_seed")).toBeInTheDocument();
    expect(screen.getByText("Сыпучие и грунты")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <ResourceModal
        open={false}
        onOpenChange={() => {}}
        articleId="a1"
        projectId="p1"
        line={line}
        lines={[line]}
        versions={[]}
        canViewSensitiveDetail
      />,
    );
    expect(screen.queryByText("estimate.resourceModal.tabs.description")).not.toBeInTheDocument();
  });

  it("disables the cross-project price-comparison query without detail access", () => {
    priceComparisonSpy.mockClear();
    render(
      <ResourceModal
        open
        onOpenChange={() => {}}
        articleId="a1"
        projectId="p1"
        line={line}
        lines={[line]}
        versions={[]}
        canViewSensitiveDetail={false}
      />,
    );
    // The cross-project aggregate (other projects' unit prices) must never be fetched for a
    // summary/none finance-visibility viewer: the RPC query is disabled.
    expect(priceComparisonSpy).toHaveBeenCalledWith("a1", "p1", expect.objectContaining({ enabled: false }));
  });

  it("enables the price-comparison query with detail access", () => {
    priceComparisonSpy.mockClear();
    render(
      <ResourceModal
        open
        onOpenChange={() => {}}
        articleId="a1"
        projectId="p1"
        line={line}
        lines={[line]}
        versions={[]}
        canViewSensitiveDetail
      />,
    );
    expect(priceComparisonSpy).toHaveBeenCalledWith("a1", "p1", expect.objectContaining({ enabled: true }));
  });
});
