import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { KnowledgeBaseTab } from "@/components/home/KnowledgeBaseTab";

function renderKB() {
  return render(
    <MemoryRouter>
      <KnowledgeBaseTab />
    </MemoryRouter>,
  );
}

describe("KnowledgeBaseTab", () => {
  it("renders the empty-state heading and explanation", () => {
    renderKB();
    expect(screen.getByRole("heading", { name: "Knowledge base" })).toBeInTheDocument();
    expect(screen.getByText(/Regulations, GOSTs/i)).toBeInTheDocument();
    expect(screen.getByText(/Section in development/i)).toBeInTheDocument();
  });
});
