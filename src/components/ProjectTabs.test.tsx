import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ProjectTabs } from "@/components/ProjectTabs";

describe("ProjectTabs", () => {
  it("keeps Procurement and HR tabs visible in planning and in-work flows", () => {
    const { rerender } = render(
      <MemoryRouter>
        <ProjectTabs projectId="project-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Procurement" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HR" })).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ProjectTabs projectId="project-1" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: "Procurement" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "HR" })).toBeInTheDocument();
  });
});
