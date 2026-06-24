import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { EstimateConstructor } from "@/components/estimate-v2/EstimateConstructor";
import type { ConstructorTemplate } from "@/hooks/use-canonical-stages-with-works";
import type { CanonicalCatalog } from "@/hooks/use-canonical-catalog";

const { applyStagesSpy, addWorksSpy, catalogRef } = vi.hoisted(() => ({
  applyStagesSpy: vi.fn(),
  addWorksSpy: vi.fn(),
  catalogRef: { value: undefined as CanonicalCatalog | undefined },
}));

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
        {
          templateWorkId: "tw1",
          systemWorkArticleId: "wa1",
          title: "Опалубка",
          resourceCount: 3,
          resourceLines: [
            { id: "rl1", title: "Доска", resourceType: "material", unitDisplay: "м³", qtyDefault: 1, systemResourceArticleId: "ra1" },
            { id: "rl2", title: "Гвозди", resourceType: "material", unitDisplay: "кг", qtyDefault: 2, systemResourceArticleId: "ra2" },
            { id: "rl3", title: "Работа плотника", resourceType: "labor", unitDisplay: "ч", qtyDefault: 4, systemResourceArticleId: null },
          ],
        },
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
vi.mock("@/hooks/use-add-library-work", () => ({
  useAddLibraryWork: () => ({ addWorks: addWorksSpy, isAdding: false }),
}));
vi.mock("@/hooks/use-canonical-catalog", () => ({
  useCanonicalCatalog: () => ({ data: catalogRef.value, isLoading: false }),
}));

type ConstructorProps = React.ComponentProps<typeof EstimateConstructor>;

function renderConstructor(props: Partial<ConstructorProps> = {}) {
  return render(
    <EstimateConstructor
      open
      onOpenChange={() => {}}
      projectId="p1"
      estimateVersionId="v1"
      canApply
      profileId="prof1"
      {...props}
    />,
  );
}

describe("EstimateConstructor", () => {
  beforeEach(() => {
    applyStagesSpy.mockReset();
    addWorksSpy.mockReset();
    catalogRef.value = undefined;
  });

  it("shows the rovno.ai stage tree with a disabled Catalog tab (apply-stages mode)", () => {
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

  it("add-work mode: selecting works and clicking 'Add works' calls addWorks for the target stage", () => {
    renderConstructor({ target: { stageId: "ps-target" } });
    // checking the template stage selects all its works to add into the target stage
    fireEvent.click(screen.getByLabelText("Фундамент"));
    fireEvent.click(screen.getByRole("button", { name: "estimate.constructor.addWorkButton" }));
    expect(addWorksSpy).toHaveBeenCalledTimes(1);
    expect(addWorksSpy).toHaveBeenCalledWith("ps-target", [
      { templateWorkId: "tw1", excludedResourceLineIds: [] },
      { templateWorkId: "tw2", excludedResourceLineIds: [] },
    ]);
    expect(applyStagesSpy).not.toHaveBeenCalled();
  });

  it("add-work mode: expanding a work and deselecting a resource passes its index to addWorks", () => {
    renderConstructor({ target: { stageId: "ps-target" } });
    // expand the stage (Radix only mounts its works when open), then check it → both works selected
    fireEvent.click(screen.getByRole("button", { name: /Фундамент/ }));
    fireEvent.click(screen.getByLabelText("Фундамент"));
    // expand Опалубка (tw1) to reveal its 3 resources, then deselect "Гвозди" (index 1)
    fireEvent.click(screen.getByRole("button", { name: /Опалубка/ }));
    fireEvent.click(screen.getByLabelText("Гвозди"));
    fireEvent.click(screen.getByRole("button", { name: "estimate.constructor.addWorkButton" }));
    expect(addWorksSpy).toHaveBeenCalledWith("ps-target", [
      { templateWorkId: "tw1", excludedResourceLineIds: ["rl2"] },
      { templateWorkId: "tw2", excludedResourceLineIds: [] },
    ]);
  });

  it("add-resource (catalog) mode: clicking a catalog leaf calls onAddCatalogResource", () => {
    catalogRef.value = {
      mode: "drill",
      subcategory: "Сыпучие",
      resources: [
        {
          id: "r1",
          name: "Песок речной",
          defaultResourceType: "material",
          unitDisplay: "м³",
          rovnoSku: "RS-SAND-001",
          subcategory: "Сыпучие",
        },
      ],
    };
    const onAddCatalogResource = vi.fn();
    renderConstructor({
      target: { stageId: "ps-target", workId: "pw-target" },
      initialTab: "catalog",
      onAddCatalogResource,
    });
    // estimates tab is disabled in add-resource mode; the catalog leaf is clickable
    expect(screen.getByText("estimate.constructor.tabs.estimates").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("Песок речной"));
    expect(onAddCatalogResource).toHaveBeenCalledWith(expect.objectContaining({ id: "r1", name: "Песок речной" }));
  });
});
