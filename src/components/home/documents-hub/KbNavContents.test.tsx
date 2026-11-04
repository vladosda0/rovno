// docs-library slice 7, frame 1: the open document's contents as a cascade in
// the «Документы» left menu. English locale in tests.
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { normalizeKbRow } from "@/lib/knowledge-base/kbConfig.mjs";
import { normalizeKbClause } from "@/lib/knowledge-base/kbFullText.mjs";

const DOC = normalizeKbRow({
  doc_id: "SP-014", slug: "sp-29-13330", designation: "СП 29.13330", title: "Полы", category: "Свод правил",
  folder: "sp", display_mode: "full_text", full_text_available: true, text_label: "verified",
  edition_date: "2018-07-18", text_checked_at: "2026-10-22", text_source_url: "https://minstroyrf.gov.ru/docs/1/",
});
const CLAUSES = [
  { anchor: "p-4", number: "4", level: 1, heading: "Общие положения", body: "", position: 1 },
  { anchor: "p-5", number: "5", level: 1, heading: "Полы в помещениях с мокрым режимом", body: "", position: 2 },
  { anchor: "p-5-4", number: "5.4", level: 2, heading: null, body: "Уклон к трапу.", position: 3 },
  { anchor: "p-pril-a", number: "Приложение А", level: 1, heading: "Приложение А", body: "", position: 4 },
].map(normalizeKbClause);

vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbDocumentBySlug: () => Promise.resolve(DOC),
  fetchKbClauses: () => Promise.resolve(CLAUSES),
  fetchKbSpFullTextEnabled: () => Promise.resolve(true),
}));

import { KbNavContents } from "./KbNavContents";

function renderNav(onFolder = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <KbNavContents slug="sp-29-13330" onFolder={onFolder} />
    </QueryClientProvider>,
  );
  return onFolder;
}

afterEach(() => {
  window.location.hash = "";
});

describe("KbNavContents", () => {
  it("shows folder › document › sections, appendices folded", async () => {
    renderNav();
    expect(await screen.findByText("4 Общие положения")).toBeInTheDocument();
    expect(screen.getByText("СП 29.13330 · Полы")).toBeInTheDocument();
    expect(screen.getByText("5 Полы в помещениях с мокрым режимом")).toBeInTheDocument();
    expect(screen.queryByText("Приложение А")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Appendices" }));
    expect(screen.getByText("Приложение А")).toBeInTheDocument();
  });

  it("a section sets the address hash and becomes current; the same section again scrolls back to it", async () => {
    renderNav();
    const section = await screen.findByText("5 Полы в помещениях с мокрым режимом");
    fireEvent.click(section);
    expect(window.location.hash).toBe("#p-5");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(await screen.findByRole("button", { current: "location" })).toHaveTextContent("5 Полы");
    const target = document.createElement("div");
    target.id = "p-5";
    const scroll = vi.fn();
    target.scrollIntoView = scroll;
    document.body.appendChild(target);
    fireEvent.click(screen.getByText("5 Полы в помещениях с мокрым режимом"));
    expect(scroll).toHaveBeenCalled();
    target.remove();
  });

  it("the folder row goes back to the folder", async () => {
    const onFolder = renderNav();
    fireEvent.click(await screen.findByText("Codes of practice (SP)"));
    expect(onFolder).toHaveBeenCalled();
  });
});
