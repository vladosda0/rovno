import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VersionDiffList } from "@/components/estimate-v2/VersionDiffList";
import type { EstimateV2StructuredChange } from "@/types/estimate-v2";

const change: EstimateV2StructuredChange = {
  entityKind: "line",
  entityId: "line-1",
  changeType: "updated",
  stageId: "stage-1",
  stageTitle: "Shell",
  workId: "work-1",
  workTitle: "Framing",
  title: "Concrete",
  stageNumber: 1,
  workNumber: "1.1",
  fieldChanges: [
    { field: "costUnitCents", before: 10000, after: 12000, label: "cost price" },
    { field: "markupBps", before: 1000, after: 1500, label: "markup" },
    { field: "discountBpsOverride", before: 500, after: 0, label: "discount" },
    { field: "clientTotalCents", before: 15000, after: 18000, label: "client total" },
  ],
};

describe("VersionDiffList", () => {
  it("hides internal financial field changes when sensitive detail is unavailable", () => {
    render(
      <VersionDiffList
        changes={[change]}
        projectMode="contractor"
        currency="RUB"
        showSensitiveDetail={false}
      />,
    );

    expect(screen.queryByText(/cost price changed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/markup changed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/discount changed/i)).not.toBeInTheDocument();
    expect(screen.getByText(/client total changed/i)).toBeInTheDocument();
  });
});
