import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CatalogsTab } from "@/components/home/CatalogsTab";

function renderCatalogs() {
  return render(
    <MemoryRouter>
      <CatalogsTab />
    </MemoryRouter>,
  );
}

describe("CatalogsTab", () => {
  it("renders the empty-state heading and explanation", () => {
    renderCatalogs();
    expect(screen.getByRole("heading", { name: "Resource catalogs" })).toBeInTheDocument();
    expect(
      screen.getByText(/catalogs of materials, tools and services/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Catalogs are in development/i)).toBeInTheDocument();
  });
});
