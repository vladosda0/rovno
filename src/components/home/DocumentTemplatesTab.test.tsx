import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DocumentTemplatesTab } from "@/components/home/DocumentTemplatesTab";

function renderTab() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <DocumentTemplatesTab />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

describe("DocumentTemplatesTab", () => {
  it("renders the three pinned Rovno templates", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Document templates" })).toBeInTheDocument();
    expect(screen.getByText(/Resource catalog template/i)).toBeInTheDocument();
    expect(screen.getByText(/Estimate template \(CSV\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Contractor business card template/i)).toBeInTheDocument();
  });

  it("links the catalog and estimate templates to their static files and enables the visitka button", () => {
    renderTab();
    const catalogLink = screen
      .getByRole("link", { name: /Download template \(\.xlsx\)/i });
    expect(catalogLink).toHaveAttribute("href", "/templates/rovno-catalog-template.xlsx");

    const csvLink = screen
      .getByRole("link", { name: /Download empty template \(\.csv\)/i });
    expect(csvLink).toHaveAttribute("href", "/templates/rovno-estimate-template.csv");

    // 3.2.2 wires this button to open the multi-step upload modal (visitka).
    const createBtn = screen.getByRole("button", { name: /Create business card/i });
    expect(createBtn).not.toBeDisabled();
  });

  it("renders the visitka field preview list", () => {
    renderTab();
    expect(screen.getByText("Organization name")).toBeInTheDocument();
    expect(screen.getByText(/Contacts \(email, phone, messengers\)/i)).toBeInTheDocument();
    expect(screen.getByText("Service region")).toBeInTheDocument();
    expect(screen.getByText("Specializations")).toBeInTheDocument();
    expect(screen.getByText("Years of experience")).toBeInTheDocument();
    expect(screen.getByText("Avatar or logo")).toBeInTheDocument();
  });
});
