import { describe, expect, it } from "vitest";
import type { ClientInfo, OrgCard } from "@/types/org-card";
import type {
  ExportLineRow,
  ExportPayload,
  ExportStageGroup,
  ExportVariant,
} from "@/lib/estimate-export-data";
import {
  type EstimateDocumentLabels,
  buildEstimateBlocks,
  renderEstimatePagesToHtml,
} from "./EstimateDocument";

function line(id: string, total: number): ExportLineRow {
  return {
    id,
    title: `Line ${id}`,
    type: "material",
    typeLabel: "Материал",
    qtyMilli: 1000,
    unit: "шт",
    costUnitCents: total,
    costTotalCents: total,
    markupBps: 0,
    discountBps: 0,
    clientUnitCents: total,
    clientTotalCents: total,
    discountedClientTotalCents: null,
  };
}

function stage(n: number, works: number, lines: number): ExportStageGroup {
  return {
    id: `s${n}`,
    title: `Stage ${n}`,
    number: n,
    works: Array.from({ length: works }, (_, w) => ({
      id: `s${n}w${w}`,
      title: `Work ${n}.${w}`,
      number: `${n}.${w + 1}`,
      lines: Array.from({ length: lines }, (_, l) => line(`s${n}w${w}l${l}`, 1000)),
    })),
  };
}

function payload(stages: ExportStageGroup[]): ExportPayload {
  return {
    projectId: "p1",
    projectTitle: "Тестовый проект",
    currency: "RUB",
    projectMode: "build_myself",
    hasSensitiveDetail: false,
    hasSummaryClientPricing: true,
    hasDiscountedClientTotal: false,
    stages,
    totals: {
      subtotalBeforeDiscountCents: 1000,
      discountTotalCents: 0,
      taxableBaseCents: 1000,
      vatBps: 0,
      taxAmountCents: 0,
      totalIncVatCents: 1000,
    },
    versionShareId: null,
    generatedAt: "2026-06-29T00:00:00.000Z",
  };
}

const LABELS: EstimateDocumentLabels = {
  title: "Смета",
  project: "Проект",
  generated: "Сформирована",
  contractor: "Исполнитель",
  customer: "Заказчик",
  org: {
    legalName: "Наименование",
    inn: "ИНН",
    kpp: "КПП",
    ogrn: "ОГРН",
    legalAddress: "Юр. адрес",
    postalAddress: "Почт. адрес",
    bank: "Банк",
    bankAccount: "Счёт",
    correspondentAccount: "Корр. счёт",
    bik: "БИК",
    phone: "Тел.",
    email: "Email",
    signatory: "Подписант",
  },
  client: { name: "Имя", inn: "ИНН", address: "Адрес", phone: "Тел.", email: "Email" },
  col: {
    number: "№",
    title: "Наименование",
    type: "Тип",
    qty: "Кол-во",
    unit: "Ед.",
    costUnit: "Себест. за ед.",
    costTotal: "Себест. итого",
    markup: "Наценка",
    discount: "Скидка",
    unitPrice: "Цена за ед.",
    total: "Итого",
    discountedTotal: "Со скидкой",
  },
  stageWordSingular: "Этап",
  workWordSingular: "Работа",
  stageSubtotal: "Итого по этапу",
  workSubtotal: "Итого по работе",
  totals: {
    subtotal: "Подытог",
    discount: "Скидка",
    taxableBase: "База",
    vat: "НДС",
    totalIncVat: "Итого с НДС",
  },
  signatures: { contractor: "Исполнитель", customer: "Заказчик", date: "Дата", nameHint: "/ ФИО /" },
  resourceType: {},
  placeholder: "—",
};

const EMPTY_ORG = null as OrgCard | null;
const EMPTY_CLIENT = null as ClientInfo | null;

function buildProps(stages: ExportStageGroup[], variant: ExportVariant = "client_simple") {
  return {
    payload: payload(stages),
    variant,
    orgCard: EMPTY_ORG,
    clientInfo: EMPTY_CLIENT,
    labels: LABELS,
  };
}

describe("buildEstimateBlocks", () => {
  it("emits header, per-stage header/work/subtotal, then totals in document order", () => {
    const blocks = buildEstimateBlocks(buildProps([stage(1, 2, 1), stage(2, 1, 1)]));
    expect(blocks.map((b) => b.kind)).toEqual([
      "header",
      "stageHeader",
      "work",
      "work",
      "stageSubtotal",
      "stageHeader",
      "work",
      "stageSubtotal",
      "totals",
    ]);
  });

  it("marks stage headers keepWithNext so they are not stranded", () => {
    const blocks = buildEstimateBlocks(buildProps([stage(1, 1, 1)]));
    const stageHeader = blocks.find((b) => b.kind === "stageHeader");
    expect(stageHeader?.keepWithNext).toBe(true);
  });

  it("includes requisites and signatures only for the signing variant", () => {
    const simple = buildEstimateBlocks(buildProps([stage(1, 1, 1)], "client_simple"));
    expect(simple.some((b) => b.kind === "requisites")).toBe(false);
    expect(simple.some((b) => b.kind === "signatures")).toBe(false);

    const signing = buildEstimateBlocks(buildProps([stage(1, 1, 1)], "client_signing"));
    expect(signing.some((b) => b.kind === "requisites")).toBe(true);
    expect(signing.some((b) => b.kind === "signatures")).toBe(true);
  });

  it("gives every block a unique id", () => {
    const blocks = buildEstimateBlocks(buildProps([stage(1, 3, 2), stage(2, 2, 2)]));
    const ids = blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("renderEstimatePagesToHtml", () => {
  it("renders one print sheet per supplied page, with a page break between them", () => {
    const props = buildProps([stage(1, 1, 1), stage(2, 1, 1)]);
    const blocks = buildEstimateBlocks(props);
    const pages = [
      blocks.slice(0, 3).map((b) => b.id),
      blocks.slice(3).map((b) => b.id),
    ];
    const html = renderEstimatePagesToHtml(props, pages, "Смета — Тест");

    const sheetCount = (html.match(/est-sheet-print/g) ?? []).length;
    // 2 sheets in the body + 2 rules referencing the class in the stylesheet
    expect(sheetCount).toBeGreaterThanOrEqual(2);
    expect((html.match(/class="est-sheet-print"/g) ?? []).length).toBe(2);
    expect(html).toContain("break-after: page");
    expect(html).toContain("break-inside: avoid");
    expect(html).toContain("@page");
    expect(html).toContain("Тестовый проект");
  });

  it("falls back to a single flowing page when no layout is supplied", () => {
    const props = buildProps([stage(1, 1, 1)]);
    const html = renderEstimatePagesToHtml(props, null, "Смета");
    expect((html.match(/class="est-sheet-print"/g) ?? []).length).toBe(1);
  });

  it("escapes the document title", () => {
    const props = buildProps([stage(1, 1, 1)]);
    const html = renderEstimatePagesToHtml(props, null, "<script>Тест</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<title><script>");
  });

  it("loads the Inter webfont so print metrics match the Inter-measured preview", () => {
    const props = buildProps([stage(1, 1, 1)]);
    const html = renderEstimatePagesToHtml(props, null, "Смета");
    expect(html).toContain("fonts.googleapis.com/css2?family=Inter");
    // link must be in the head, before the body content
    expect(html.indexOf("family=Inter")).toBeLessThan(html.indexOf("<body>"));
  });

  it("rejects a stale layout that does not partition the current blocks", () => {
    const props = buildProps([stage(1, 1, 1), stage(2, 1, 1)]);
    // A layout referencing a phantom id (e.g. from a previous estimate/variant)
    // must NOT be trusted — it would drop real blocks. Fall back to one sheet.
    const stalePages = [["header", "phantom-block"], ["totals"]];
    const html = renderEstimatePagesToHtml(props, stalePages, "Смета");
    expect((html.match(/class="est-sheet-print"/g) ?? []).length).toBe(1);
    expect(html).not.toContain("phantom-block");
    // every stage still present despite the bad layout
    expect(html).toContain("Stage 1");
    expect(html).toContain("Stage 2");
  });

  it("rejects a layout that omits some current blocks", () => {
    const props = buildProps([stage(1, 1, 1)]);
    const blocks = buildEstimateBlocks(props);
    // drop the last block from the layout
    const partial = [blocks.slice(0, -1).map((b) => b.id)];
    const html = renderEstimatePagesToHtml(props, partial, "Смета");
    expect((html.match(/class="est-sheet-print"/g) ?? []).length).toBe(1);
  });

  it("accepts a valid full-partition layout across multiple pages", () => {
    const props = buildProps([stage(1, 2, 1), stage(2, 2, 1)]);
    const blocks = buildEstimateBlocks(props);
    const mid = Math.ceil(blocks.length / 2);
    const pages = [blocks.slice(0, mid).map((b) => b.id), blocks.slice(mid).map((b) => b.id)];
    const html = renderEstimatePagesToHtml(props, pages, "Смета");
    expect((html.match(/class="est-sheet-print"/g) ?? []).length).toBe(2);
  });
});
