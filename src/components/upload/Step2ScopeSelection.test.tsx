import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const activeOrgMock = vi.fn();
const projectsMock = vi.fn();

vi.mock("@/hooks/use-orgs", () => ({ useActiveOrg: () => activeOrgMock() }));
vi.mock("@/hooks/use-mock-data", () => ({ useProjects: () => projectsMock() }));

import { Step2ScopeSelection } from "@/components/upload/Step2ScopeSelection";

const noop = () => {};

function renderStep2(props: Partial<React.ComponentProps<typeof Step2ScopeSelection>> = {}) {
  return render(
    <Step2ScopeSelection
      type="catalog"
      scope={null}
      onScopeChange={noop}
      onProjectChange={noop}
      onBack={noop}
      onNext={noop}
      {...props}
    />,
  );
}

describe("Step2ScopeSelection", () => {
  beforeEach(() => {
    activeOrgMock.mockReturnValue(null);
    projectsMock.mockReturnValue([]);
  });

  it("hides the Public option for document uploads but shows it for catalogs", () => {
    const { rerender } = renderStep2({ type: "document" });
    expect(screen.queryByText("Public")).not.toBeInTheDocument();

    rerender(
      <Step2ScopeSelection
        type="catalog"
        scope={null}
        onScopeChange={noop}
        onProjectChange={noop}
        onBack={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("disables the org option when the user has no active org", () => {
    renderStep2({ type: "catalog" });
    const orgRadio = screen.getByRole("radio", { name: /Organization/i });
    expect(orgRadio).toBeDisabled();
  });

  it("requires a scope before Next is enabled", () => {
    renderStep2({ scope: null });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("requires a project selection before Next is enabled for project scope", () => {
    projectsMock.mockReturnValue([{ id: "p1", title: "Project One" }]);
    const { rerender } = renderStep2({ type: "catalog", scope: "project", projectId: undefined });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    rerender(
      <Step2ScopeSelection
        type="catalog"
        scope="project"
        projectId="p1"
        onScopeChange={noop}
        onProjectChange={noop}
        onBack={noop}
        onNext={noop}
      />,
    );
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("advances with the chosen scope on Next", () => {
    const onNext = vi.fn();
    renderStep2({ type: "catalog", scope: "personal", onNext });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledWith("personal", undefined);
  });
});
