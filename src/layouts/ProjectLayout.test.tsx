import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProjectLayout from "@/layouts/ProjectLayout";

function renderProjectLayout(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/project/:id" element={<ProjectLayout />}>
          <Route path="dashboard" element={<div>Dashboard</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProjectLayout", () => {
  it("redirects bare project routes to the dashboard tab", async () => {
    renderProjectLayout("/project/project-1");

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
  });

  it("renders nested project routes without adding auth gating", () => {
    renderProjectLayout("/project/project-1/dashboard");

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });
});
