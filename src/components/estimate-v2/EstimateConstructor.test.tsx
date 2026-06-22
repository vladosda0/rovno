import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { EstimateConstructor } from "@/components/estimate-v2/EstimateConstructor";
import type { ConstructorTemplate } from "@/hooks/use-canonical-stages-with-works";

const { applyStagesSpy } = vi.hoisted(() => ({ applyStagesSpy: vi.fn() }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const tree: ConstructorTemplate = {
  templateId: "tpl",
  title: "rovno.ai",
  stages: [
    {
      templateStageId: "ts1",
      systemStageArticleId: "sa1",
      title: "Фундамент",
      workCount: 2,
      resourceCount: 5,
      works: [
        { templateWorkId: "tw1", systemWorkArticleId: "wa1", title: "Опалубка", resourceCount: 3, resourceLines: [] },
        { templateWorkId: "tw2", systemWorkArticleId: "wa2", title: "Бетонирование", resourceCount: 2, resourceLines: [] },
      ],
    },
  ],
};

vi.mock("@/hooks/use-canonical-stages-with-works", () => ({
  useCanonicalStagesWithWorks: () => ({ data: tree, isLoading: false }),
}));
vi.mock("@/hooks/use-apply-template-stages", () => ({
  useApplyTemplateStages: () => ({ applyStages: applyStagesSpy, isApplying: false }),
}));

function renderConstructor() {
  return render(
    <EstimateConstructor
      open
      onOpenChange={() => {}}
      projectId="p1"
      estimateVersionId="v1"
      canApply
      profileId="prof1"
    />,
  );
}

describe("EstimateConstructor", () => {
  it("shows the rovno.ai stage tree with a disabled Catalog tab", () => {
    renderConstructor();
    expect(screen.getByText("Фундамент")).toBeInTheDocument();
    expect(screen.getByText("estimate.constructor.tabs.estimates")).toBeInTheDocument();
    const catalog = screen.getByText("estimate.constructor.tabs.catalog").closest("button");
    expect(catalog).toBeDisabled();
  });

  it("applies the checked stage when 'Apply selected' is clicked", () => {
    renderConstructor();
    // checking the stage selects all of its works
    fireEvent.click(screen.getByLabelText("Фундамент"));
    fireEvent.click(screen.getByRole("button", { name: "estimate.constructor.applyButton" }));
    expect(applyStagesSpy).toHaveBeenCalledTimes(1);
    expect(applyStagesSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        templateStageId: "ts1",
        orderedTemplateWorkIds: ["tw1", "tw2"],
        uncheckedTemplateWorkIds: [],
      }),
    ]);
  });

  it("keeps the apply button disabled with no selection", () => {
    renderConstructor();
    expect(screen.getByRole("button", { name: "estimate.constructor.applyButton" })).toBeDisabled();
  });
});
