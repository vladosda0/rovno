#!/usr/bin/env node
/**
 * Builds the downloadable document blanks shown in "Шаблоны документов":
 *   public/templates/blanks/*.docx  from  scripts/document-blanks/texts/*.md
 *   public/templates/blanks/ks-2.xlsx, ks-3.xlsx  from the layouts below
 *
 * The built files are committed and served statically; the texts are the
 * source of truth, so a wording change is a diff in texts/ plus a rebuild:
 *   node scripts/document-blanks/build.mjs
 *
 * Markdown subset understood by the .docx builder (what the texts use):
 *   "# Title"            document name; skipped when the body before the first "---" has its own title (an all-bold block in capitals)
 *   "## Heading"         bold section heading
 *   "**...**"            bold, inline or whole line
 *   "| a | b |" blocks   table with borders; the "|---|" row is the header separator
 *   "- item"             list line
 *   "(...)" lines        field hint under a blank, printed small
 *   blank line           paragraph break; single newlines are line breaks
 *   "---"                page break (before an appendix)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEXTS_DIR = path.join(__dirname, "texts");
const OUT_DIR = path.resolve(__dirname, "../../public/templates/blanks");

const FONT = "Times New Roman";
const SIZE = 24; // half-points: 12 pt
const HINT_SIZE = 18; // 9 pt
const MARGIN = 1134; // twips: 2 cm
const CONTENT_WIDTH = 11906 - 2 * MARGIN; // A4 width minus margins
// Fixed so a rebuild of unchanged layouts keeps the same workbook properties (.xlsx only).
const BUILT_AT = new Date("2026-10-18T00:00:00Z");

export const DOCX_BLANKS = [
  "dogovor-bytovoj",
  "dogovor-stroitelnyj",
  "dopsoglashenie",
  "uvedomlenie-o-priostanovke",
  "pretenziya",
  "akt-sdachi-priemki",
  "akt-o-nedostatkah",
  "akt-materialov",
  "akt-skrytyh-rabot",
];

function runs(text, base = {}) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((part) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    return new TextRun({
      text: bold ? part.slice(2, -2) : part,
      bold: bold || base.bold,
      size: base.size ?? SIZE,
      italics: base.italics,
      font: FONT,
    });
  });
}

function isHint(line) {
  const t = line.trim();
  return t.startsWith("(") && t.endsWith(")");
}

function paragraphBlock(lines, opts = {}) {
  const out = [];
  let current = [];
  const flush = () => {
    if (current.length === 0) return;
    const children = [];
    current.forEach((line, i) => {
      const hint = isHint(line);
      if (i > 0) children.push(new TextRun({ text: "", break: 1, font: FONT }));
      children.push(...runs(line.trim(), hint ? { size: HINT_SIZE, italics: true } : {}));
    });
    out.push(new Paragraph({ children, alignment: opts.alignment, spacing: { after: 120 } }));
    current = [];
  };
  for (const line of lines) {
    if (/^\s*- /.test(line)) {
      flush();
      out.push(
        new Paragraph({
          children: runs(`– ${line.replace(/^\s*- /, "")}`),
          indent: { left: 567, hanging: 283 },
          spacing: { after: 60 },
        }),
      );
    } else {
      current.push(line);
    }
  }
  flush();
  return out;
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: "000000" };

function tableBlock(lines) {
  const rows = lines
    .filter((l) => !/^\|\s*:?-{3,}/.test(l))
    .map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
  const width = Math.max(...rows.map((r) => r.length));
  // A narrow "№" column, the rest shares the line; explicit widths keep LibreOffice and Pages from collapsing it.
  const numbered = width > 2 && rows[0][0] === "№";
  const narrow = numbered ? 567 : 0;
  const rest = Math.floor((CONTENT_WIDTH - narrow) / (width - (numbered ? 1 : 0)));
  const columnWidths = Array.from({ length: width }, (_, i) => (numbered && i === 0 ? narrow : rest));
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths,
    layout: TableLayoutType.FIXED,
    rows: rows.map(
      (cells, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          children: Array.from({ length: width }, (_, i) =>
            new TableCell({
              width: { size: columnWidths[i], type: WidthType.DXA },
              borders: { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER },
              children: [
                new Paragraph({
                  children: runs(cells[i] ?? "", { bold: rowIndex === 0, size: 20 }),
                }),
              ],
            }),
          ),
        }),
    ),
  });
}

export function splitBlocks(markdown) {
  return markdown
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").filter((l) => l.trim()))
    .filter((b) => b.length > 0);
}

const isTitleBlock = (lines) => lines.every((l) => /^\*\*.+\*\*$/.test(l.trim())) && /[А-ЯЁ]{3,}/.test(lines[0]);

/** True when the text before the first "---" page break has its own caps title, so "# Title" is not printed. */
export function bodyHasOwnTitle(blocks) {
  const firstBreak = blocks.findIndex((lines) => lines.length === 1 && lines[0].trim() === "---");
  return blocks.slice(0, firstBreak === -1 ? blocks.length : firstBreak).some(isTitleBlock);
}

export function markdownToDocxChildren(markdown) {
  const blocks = splitBlocks(markdown);
  const children = [];
  let title = null;
  if (blocks[0]?.[0]?.startsWith("# ")) title = blocks.shift()[0].slice(2).trim();
  if (title && !bodyHasOwnTitle(blocks)) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({ text: title, bold: true, size: 28, font: FONT })],
      }),
    );
  }
  blocks.forEach((lines) => {
    if (lines.length === 1 && lines[0].trim() === "---") {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    } else if (lines[0].startsWith("## ")) {
      children.push(
        new Paragraph({
          spacing: { before: 240, after: 120 },
          children: runs(lines[0].slice(3).trim(), { bold: true }),
        }),
      );
      if (lines.length > 1) children.push(...paragraphBlock(lines.slice(1)));
    } else if (lines.every((l) => l.trim().startsWith("|"))) {
      children.push(tableBlock(lines), new Paragraph({ children: [] }));
    } else {
      children.push(...paragraphBlock(lines, { alignment: isTitleBlock(lines) ? AlignmentType.CENTER : undefined }));
    }
  });
  return children;
}

async function buildDocx(slug) {
  const markdown = fs.readFileSync(path.join(TEXTS_DIR, `${slug}.md`), "utf8");
  const title = markdown.match(/^# (.+)$/m)?.[1] ?? slug;
  const doc = new Document({
    creator: "Ровно",
    title,
    lastModifiedBy: "Ровно",
    styles: { default: { document: { run: { font: FONT, size: SIZE } } } },
    sections: [
      {
        properties: { page: { margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
        children: markdownToDocxChildren(markdown),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

// ---------- КС-2 и КС-3: постановление Госкомстата России от 11.11.1999 № 100 ----------

const THIN = { style: "thin", color: { argb: "FF000000" } };
const BOX = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function header(ws, { form, okud, lastCol }) {
  const right = (row, text, opts = {}) => {
    const cell = ws.getCell(row, lastCol);
    cell.value = text;
    cell.alignment = { horizontal: "right", wrapText: false };
    cell.font = { name: FONT, size: opts.size ?? 8, bold: opts.bold };
  };
  right(1, `Унифицированная форма № ${form}`, { size: 9 });
  right(2, "Утверждена постановлением Госкомстата России от 11.11.99 № 100", { size: 8 });

  const codeCol = lastCol;
  const labelCol = lastCol - 1;
  const set = (row, col, value, extra = {}) => {
    const c = ws.getCell(row, col);
    c.value = value;
    c.font = { name: FONT, size: 9, ...extra.font };
    if (extra.border) c.border = BOX;
    if (extra.align) c.alignment = extra.align;
    return c;
  };
  set(4, codeCol, "Код", { border: true, align: { horizontal: "center" } });
  set(5, labelCol, "Форма по ОКУД", { align: { horizontal: "right" } });
  set(5, codeCol, okud, { border: true, align: { horizontal: "center" } });

  const parties = [
    ["Инвестор", "(организация, адрес, телефон, факс)", "по ОКПО"],
    ["Заказчик (Генподрядчик)", "(организация, адрес, телефон, факс)", "по ОКПО"],
    ["Подрядчик (Субподрядчик)", "(организация, адрес, телефон, факс)", "по ОКПО"],
    ["Стройка", "(наименование, адрес)", ""],
    ["Объект", "(наименование)", ""],
  ];
  let row = 6;
  for (const [label, hint, code] of parties) {
    set(row, 1, label, { font: { size: 9 } });
    ws.mergeCells(row, 2, row, labelCol - 1);
    ws.getCell(row, 2).border = { bottom: THIN };
    if (code) set(row, labelCol, code, { align: { horizontal: "right" } });
    set(row, codeCol, "", { border: true });
    set(row + 1, 2, hint, { font: { size: 7, italic: true } });
    row += 2;
  }
  set(row, labelCol, "Вид деятельности по ОКДП", { align: { horizontal: "right" } });
  set(row, codeCol, "", { border: true });
  row += 1;
  set(row, labelCol - 2, "Договор подряда (контракт)", { align: { horizontal: "right" } });
  set(row, labelCol - 1, "номер", { align: { horizontal: "right" } });
  set(row, codeCol, "", { border: true });
  row += 1;
  set(row, labelCol - 1, "дата", { align: { horizontal: "right" } });
  set(row, codeCol, "", { border: true });
  row += 1;
  set(row, labelCol, "Вид операции", { align: { horizontal: "right" } });
  set(row, codeCol, "", { border: true });
  return row + 2;
}

function docNumberBlock(ws, row, startCol, title) {
  const labels = ["Номер документа", "Дата составления", "Отчетный период"];
  const c = (r, col, v, border = true) => {
    const cell = ws.getCell(r, col);
    cell.value = v;
    cell.font = { name: FONT, size: 8 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    if (border) cell.border = BOX;
  };
  c(row, startCol, labels[0]);
  c(row, startCol + 1, labels[1]);
  ws.mergeCells(row, startCol + 2, row, startCol + 3);
  c(row, startCol + 2, labels[2]);
  c(row + 1, startCol, "");
  c(row + 1, startCol + 1, "");
  c(row + 1, startCol + 2, "с");
  c(row + 1, startCol + 3, "по");
  for (let i = 0; i < 4; i++) c(row + 2, startCol + i, "");
  ws.mergeCells(row + 1, 1, row + 2, startCol - 1);
  const t = ws.getCell(row + 1, 1);
  t.value = title;
  t.font = { name: FONT, size: 12, bold: true };
  t.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  return row + 4;
}

function tableHead(ws, row, groups, numbers) {
  // groups: [{ text, span, sub?: [..] }]
  let col = 1;
  for (const g of groups) {
    const cell = ws.getCell(row, col);
    cell.value = g.text;
    if (g.sub) {
      ws.mergeCells(row, col, row, col + g.sub.length - 1);
      g.sub.forEach((s, i) => {
        const sc = ws.getCell(row + 1, col + i);
        sc.value = s;
      });
      col += g.sub.length;
    } else {
      ws.mergeCells(row, col, row + 1, col);
      col += 1;
    }
  }
  numbers.forEach((n, i) => (ws.getCell(row + 2, i + 1).value = n));
  for (let r = row; r <= row + 2; r++) {
    for (let c = 1; c <= numbers.length; c++) {
      const cell = ws.getCell(r, c);
      cell.border = BOX;
      cell.font = { name: FONT, size: 8, bold: r < row + 2 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    }
  }
  ws.getRow(row).height = 42;
  ws.getRow(row + 1).height = 42;
  return row + 3;
}

function emptyRows(ws, row, count, cols) {
  for (let r = row; r < row + count; r++) {
    for (let c = 1; c <= cols; c++) {
      const cell = ws.getCell(r, c);
      cell.border = BOX;
      cell.font = { name: FONT, size: 9 };
    }
    ws.getRow(r).height = 18;
  }
  return row + count;
}

function signatures(ws, row, blocks) {
  for (const label of blocks) {
    const l = ws.getCell(row, 1);
    l.value = label;
    l.font = { name: FONT, size: 9, bold: true };
    ws.getCell(row + 1, 2).border = { bottom: THIN };
    ws.getCell(row + 1, 4).border = { bottom: THIN };
    ws.getCell(row + 1, 6).border = { bottom: THIN };
    [
      [2, "(должность)"],
      [4, "(подпись)"],
      [6, "(расшифровка подписи)"],
    ].forEach(([col, text]) => {
      const c = ws.getCell(row + 2, col);
      c.value = text;
      c.font = { name: FONT, size: 7, italic: true };
      c.alignment = { horizontal: "center" };
    });
    ws.getCell(row + 3, 2).value = "М. П.";
    ws.getCell(row + 3, 2).font = { name: FONT, size: 8 };
    row += 5;
  }
  return row;
}

function sheetSetup(ws, widths) {
  ws.columns = widths.map((width) => ({ width }));
  ws.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
}

function workbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ровно";
  wb.created = BUILT_AT;
  wb.modified = BUILT_AT;
  return wb;
}

async function buildKs2() {
  const wb = workbook();
  const ws = wb.addWorksheet("КС-2");
  sheetSetup(ws, [8, 10, 44, 14, 12, 12, 14, 16]);
  let row = header(ws, { form: "КС-2", okud: "0322005", lastCol: 8 });
  row = docNumberBlock(ws, row, 5, "АКТ О ПРИЕМКЕ ВЫПОЛНЕННЫХ РАБОТ");
  ws.getCell(row, 1).value = "Сметная (договорная) стоимость в соответствии с договором подряда (субподряда)";
  ws.getCell(row, 1).font = { name: FONT, size: 9 };
  ws.getCell(row, 7).border = { bottom: THIN };
  ws.getCell(row, 8).value = "руб.";
  row += 2;
  row = tableHead(
    ws,
    row,
    [
      { text: "Номер", sub: ["по порядку", "позиции по смете"] },
      { text: "Наименование работ" },
      { text: "Номер единичной расценки" },
      { text: "Единица измерения" },
      { text: "Выполнено работ", sub: ["количество", "цена за единицу, руб.", "стоимость, руб."] },
    ],
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  row = emptyRows(ws, row, 15, 8);
  for (const label of ["Итого", "Сумма НДС", "Всего с учетом НДС"]) {
    ws.getCell(row, 6).value = label;
    ws.getCell(row, 6).font = { name: FONT, size: 9, bold: true };
    ws.getCell(row, 8).border = BOX;
    row += 1;
  }
  row += 1;
  signatures(ws, row, ["Сдал", "Принял"]);
  return wb.xlsx.writeBuffer();
}

async function buildKs3() {
  const wb = workbook();
  const ws = wb.addWorksheet("КС-3");
  sheetSetup(ws, [8, 52, 10, 18, 18, 18]);
  let row = header(ws, { form: "КС-3", okud: "0322001", lastCol: 6 });
  row = docNumberBlock(ws, row, 3, "СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ");
  row = tableHead(
    ws,
    row,
    [
      { text: "Номер по порядку" },
      {
        text: "Наименование пусковых комплексов, этапов, объектов, видов выполненных работ, оборудования, затрат",
      },
      { text: "Код" },
      {
        text: "Стоимость выполненных работ и затрат, руб.",
        sub: ["с начала проведения работ", "с начала года", "в том числе за отчетный период"],
      },
    ],
    [1, 2, 3, 4, 5, 6],
  );
  const first = ws.getCell(row, 2);
  first.value = "Всего работ и затрат, включенных в сметную стоимость, в том числе:";
  row = emptyRows(ws, row, 13, 6);
  ws.getCell(row - 13, 2).font = { name: FONT, size: 9, bold: true };
  for (const label of ["Итого", "Сумма НДС", "Всего с учетом НДС"]) {
    ws.getCell(row, 2).value = label;
    ws.getCell(row, 2).font = { name: FONT, size: 9, bold: true };
    ws.getCell(row, 2).alignment = { horizontal: "right" };
    for (let c = 4; c <= 6; c++) ws.getCell(row, c).border = BOX;
    row += 1;
  }
  row += 1;
  signatures(ws, row, ["Заказчик (Генподрядчик)", "Подрядчик (Субподрядчик)"]);
  return wb.xlsx.writeBuffer();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const slug of DOCX_BLANKS) {
    const buffer = await buildDocx(slug);
    fs.writeFileSync(path.join(OUT_DIR, `${slug}.docx`), buffer);
    console.log(`blanks/${slug}.docx  ${buffer.length} bytes`);
  }
  for (const [name, build] of [
    ["ks-2", buildKs2],
    ["ks-3", buildKs3],
  ]) {
    const buffer = Buffer.from(await build());
    fs.writeFileSync(path.join(OUT_DIR, `${name}.xlsx`), buffer);
    console.log(`blanks/${name}.xlsx  ${buffer.length} bytes`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
