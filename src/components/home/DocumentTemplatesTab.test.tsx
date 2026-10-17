import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import i18n from "@/i18n";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DocumentTemplatesTab } from "@/components/home/DocumentTemplatesTab";
import { DOCUMENT_BLANKS } from "@/components/home/document-blanks";

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

  describe("document blanks", () => {
    afterEach(async () => {
      await i18n.changeLanguage("en");
    });

    function blanksSection() {
      return screen.getByRole("region", { name: "Document blanks" });
    }

    it("offers every blank as a direct download with a readable file name", () => {
      renderTab();
      const links = within(blanksSection()).getAllByRole("link");
      expect(links).toHaveLength(11);
      for (const blank of DOCUMENT_BLANKS) {
        const link = links.find((l) => l.getAttribute("href") === blank.href);
        expect(link, blank.id).toBeDefined();
        expect(link).toHaveAttribute("download", blank.downloadName);
      }
      const names = links.map((link) => link.getAttribute("aria-label"));
      expect(new Set(names).size).toBe(11);
      expect(names).toContain("Download (.xlsx): КС-2 · Certificate of completed works");
      expect(screen.queryByText("More document templates will be added in upcoming releases.")).not.toBeInTheDocument();
    });

    it("filters cards by title and description, hiding empty groups and sections", async () => {
      await i18n.changeLanguage("ru");
      renderTab();
      const search = screen.getByRole("searchbox", { name: "Найти шаблон или бланк" });

      fireEvent.change(search, { target: { value: "акт" } });
      const section = screen.getByRole("region", { name: "Бланки документов" });
      expect(within(section).getAllByRole("link")).toHaveLength(5);
      expect(screen.queryByText("Договор и переписка сторон")).not.toBeInTheDocument();
      expect(screen.getByText("Приёмка работ")).toBeInTheDocument();
      expect(screen.queryByText("Закреплённые шаблоны Ровно")).not.toBeInTheDocument();

      fireEvent.change(search, { target: { value: "ПРИЕМКИ" } });
      expect(screen.getByText("Акт сдачи-приёмки работ")).toBeInTheDocument();

      fireEvent.change(search, { target: { value: "смет" } });
      expect(screen.getByText("Шаблон сметы (CSV)")).toBeInTheDocument();

      fireEvent.change(search, { target: { value: "смета КС-6" } });
      expect(screen.getByText("По запросу «смета КС-6» ничего не нашлось.")).toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Бланки документов" })).not.toBeInTheDocument();

      fireEvent.change(search, { target: { value: "компанией договор" } });
      expect(screen.getByText("Договор строительного подряда с компанией")).toBeInTheDocument();
      expect(screen.queryByText("Договор подряда с частным заказчиком")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Очистить поиск" }));
      expect(search).toHaveValue("");
      expect(within(screen.getByRole("region", { name: "Бланки документов" })).getAllByRole("link")).toHaveLength(11);
      expect(screen.getByText("Закреплённые шаблоны Ровно")).toBeInTheDocument();
    });
  });
});
