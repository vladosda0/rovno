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
let clausesNow: ReturnType<typeof normalizeKbClause>[] = [];
const CLAUSES = [
  { anchor: "p-4", number: "4", level: 1, heading: "Общие положения", body: "", position: 1 },
  { anchor: "p-5", number: "5", level: 1, heading: "Полы в помещениях с мокрым режимом", body: "", position: 2 },
  { anchor: "p-5-4", number: "5.4", level: 2, heading: null, body: "Уклон к трапу.", position: 3 },
  { anchor: "p-pril-a", number: "Приложение А", level: 1, heading: "Приложение А", body: "", position: 4 },
].map(normalizeKbClause);

vi.mock("@/lib/knowledge-base/api", () => ({
  fetchKbDocumentBySlug: () => Promise.resolve(DOC),
  fetchKbClauses: () => Promise.resolve(clausesNow.length ? clausesNow : CLAUSES),
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
  clausesNow = [];
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

  it("a law: chapters, the open chapter shows its articles, the current article is marked (slice 9, frame 1 A)", async () => {
    clausesNow = [
      { anchor: "gl-5", number: null, level: 1, heading: "Глава 5. Планирование", body: "", position: 1 },
      { anchor: "st-42", number: null, level: 2, heading: "Статья 42. Проект планировки", body: "Текст.", position: 2 },
      { anchor: "gl-6", number: null, level: 1, heading: "Глава 6. Проектирование", body: "", position: 3 },
      { anchor: "st-51", number: null, level: 2, heading: "Статья 51. Разрешение на строительство", body: "", position: 4 },
      { anchor: "st-51-ch-7", number: "7", level: 3, heading: null, body: "Заявление.", position: 5 },
    ].map(normalizeKbClause);
    window.location.hash = "#st-51-ch-7";
    renderNav();
    expect(await screen.findByText("Глава 6. Проектирование")).toBeInTheDocument();
    expect(screen.getByText("Глава 5. Планирование")).toBeInTheDocument();
    expect(screen.getByText("Статья 51. Разрешение на строительство").closest("button")).toHaveAttribute("aria-current", "location");
    expect(screen.queryByText("Статья 42. Проект планировки")).not.toBeInTheDocument();
  });

  it("a short law without chapters lists its articles", async () => {
    clausesNow = [
      { anchor: "st-1", number: null, level: 2, heading: "Статья 1. Предмет", body: "Текст.", position: 1 },
      { anchor: "st-2", number: null, level: 2, heading: "Статья 2. Понятия", body: "Текст.", position: 2 },
    ].map(normalizeKbClause);
    window.location.hash = "#st-2";
    renderNav();
    expect(await screen.findByText("Статья 1. Предмет")).toBeInTheDocument();
    expect(screen.getByText("Статья 2. Понятия").closest("button")).toHaveAttribute("aria-current", "location");
  });

  it("a law with a preamble and no chapters lists «Преамбула» and its articles (show 9.2в, frame 3)", async () => {
    clausesNow = [
      { anchor: "gl-pre", number: null, level: 1, heading: "Преамбула", body: "Настоящий закон устанавливает.", position: 1 },
      { anchor: "st-1", number: null, level: 2, heading: "Статья 1. Предмет", body: "Текст.", position: 2 },
      { anchor: "st-2", number: null, level: 2, heading: "Статья 2. Понятия", body: "Текст.", position: 3 },
      { anchor: "gl-sig", number: null, level: 1, heading: null, body: "Президент Российской Федерации", position: 4 },
    ].map(normalizeKbClause);
    window.location.hash = "#st-2";
    renderNav();
    expect(await screen.findByText("Преамбула")).toBeInTheDocument();
    expect(screen.getByText("Статья 1. Предмет")).toBeInTheDocument();
    expect(screen.getByText("Статья 2. Понятия").closest("button")).toHaveAttribute("aria-current", "location");
  });

  it("a law with a preamble and chapters: «Преамбула» is a row of its own, the open chapter shows its articles", async () => {
    clausesNow = [
      { anchor: "gl-pre", number: null, level: 1, heading: "Преамбула", body: "Настоящий закон устанавливает.", position: 1 },
      { anchor: "gl-1", number: null, level: 1, heading: "Глава 1. Общие положения", body: "", position: 2 },
      { anchor: "st-1", number: null, level: 2, heading: "Статья 1. Предмет", body: "Текст.", position: 3 },
      { anchor: "gl-2", number: null, level: 1, heading: "Глава 2. Права", body: "", position: 4 },
      { anchor: "st-5", number: null, level: 2, heading: "Статья 5. Право", body: "Текст.", position: 5 },
    ].map(normalizeKbClause);
    window.location.hash = "#st-5";
    renderNav();
    expect(await screen.findByText("Преамбула")).toBeInTheDocument();
    expect(screen.getByText("Глава 1. Общие положения")).toBeInTheDocument();
    expect(screen.getByText("Статья 5. Право").closest("button")).toHaveAttribute("aria-current", "location");
    expect(screen.queryByText("Статья 1. Предмет")).not.toBeInTheDocument();
  });

  it("an open appendix stays marked in a building code (slice 9 keeps SP as it was)", async () => {
    window.location.hash = "#p-pril-a";
    renderNav();
    fireEvent.click(await screen.findByRole("button", { name: "Appendices" }));
    expect(screen.getByText("Приложение А").closest("button")).toHaveAttribute("aria-current", "location");
  });

  it("the folder row goes back to the folder", async () => {
    const onFolder = renderNav();
    fireEvent.click(await screen.findByText("Codes of practice (SP)"));
    expect(onFolder).toHaveBeenCalled();
  });
});
