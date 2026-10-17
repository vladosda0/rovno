import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { DOCUMENT_BLANKS, matchesTemplateQuery } from "@/components/home/document-blanks";
import { bodyHasOwnTitle, splitBlocks } from "../../../scripts/document-blanks/build.mjs";

const PUBLIC_DIR = path.resolve(__dirname, "../../../public");

function blankPath(href: string) {
  return path.join(PUBLIC_DIR, href);
}

async function documentText(href: string) {
  const zip = await JSZip.loadAsync(fs.readFileSync(blankPath(href)));
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<w:tab\/>/g, " ").replace(/<[^>]+>/g, "");
}

async function sheetText(href: string) {
  const wb = new ExcelJS.Workbook();
  // exceljs types its own Buffer; Node 22's readFileSync returns NonSharedBuffer.
  await wb.xlsx.load(fs.readFileSync(blankPath(href)) as unknown as ExcelJS.Buffer);
  const values: string[] = [];
  wb.worksheets[0].eachRow((row) => row.eachCell((cell) => values.push(String(cell.value ?? ""))));
  return values.join("\n");
}

const DOCX_HEADINGS: Record<string, string> = {
  "dogovor-bytovoj": "ДОГОВОР ПОДРЯДА",
  "dogovor-stroitelnyj": "ДОГОВОР СТРОИТЕЛЬНОГО ПОДРЯДА",
  dopsoglashenie: "ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ",
  "uvedomlenie-o-priostanovke": "Уведомление о приостановке работ",
  pretenziya: "ПРЕТЕНЗИЯ",
  "akt-sdachi-priemki": "Акт сдачи-приёмки выполненных работ",
  "akt-o-nedostatkah": "Акт о выявленных недостатках",
  "akt-materialov": "Акт приёма-передачи материалов от Заказчика",
  "akt-skrytyh-rabot": "освидетельствования скрытых работ",
};

describe("document blanks", () => {
  it("lists eleven blanks, each with an existing file", () => {
    expect(DOCUMENT_BLANKS).toHaveLength(11);
    for (const blank of DOCUMENT_BLANKS) {
      const file = blankPath(blank.href);
      expect(fs.existsSync(file), blank.href).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(1000);
      expect(blank.downloadName.endsWith(`.${blank.format}`)).toBe(true);
    }
  });

  it.each(Object.entries(DOCX_HEADINGS))("%s.docx carries its heading and no markdown residue", async (slug, heading) => {
    const text = await documentText(`/templates/blanks/${slug}.docx`);
    expect(text).toContain(heading);
    expect(text).not.toContain("**");
    expect(text).not.toContain("<!--");
    expect(text).not.toMatch(/\|---/);
  });

  it("КС-2 and КС-3 carry the unified form name and OKUD code", async () => {
    const ks2 = await sheetText("/templates/blanks/ks-2.xlsx");
    expect(ks2).toContain("Унифицированная форма № КС-2");
    expect(ks2).toContain("0322005");
    expect(ks2).toContain("АКТ О ПРИЕМКЕ ВЫПОЛНЕННЫХ РАБОТ");
    const ks3 = await sheetText("/templates/blanks/ks-3.xlsx");
    expect(ks3).toContain("Унифицированная форма № КС-3");
    expect(ks3).toContain("0322001");
    expect(ks3).toContain("СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ");
  });

  it("prints the # title unless the text before the first page break has its own caps title", () => {
    expect(bodyHasOwnTitle(splitBlocks("# Претензия\n\nКому: ___\n\n**ПРЕТЕНЗИЯ**\n\nТекст"))).toBe(true);
    expect(bodyHasOwnTitle(splitBlocks("# Акт\n\n**Акт № ____**\n\nТекст"))).toBe(false);
    expect(bodyHasOwnTitle(splitBlocks("# Договор\n\nТекст\n\n---\n\n**ПРИЛОЖЕНИЕ № 1**"))).toBe(false);
    expect(bodyHasOwnTitle(splitBlocks("# Договор\n\n---\n\n**СМЕТА**"))).toBe(false);
  });
});

describe("matchesTemplateQuery", () => {
  it("needs every query word somewhere in the title or description", () => {
    expect(matchesTemplateQuery("компанией смета", "Договор с компанией", "Работы: смета, сроки")).toBe(true);
    expect(matchesTemplateQuery("акт xyz", "Акт сдачи-приёмки", "Перечень")).toBe(false);
    expect(matchesTemplateQuery("   ", "Что угодно")).toBe(true);
    expect(matchesTemplateQuery("ПРИЕМКИ", "Акт сдачи-приёмки")).toBe(true);
  });
});
