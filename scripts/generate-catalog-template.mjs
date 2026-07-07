#!/usr/bin/env node
/**
 * Generates the downloadable price-list template for User Catalog Upload v1:
 *   public/templates/rovno-price-list-template.xlsx
 *
 * The file is committed (build-time artifact, not a runtime dependency) and
 * served statically; the upload page links it with a Russian download name.
 * Re-run after changing columns/examples:
 *   node scripts/generate-catalog-template.mjs
 *
 * Contract notes:
 * - Headers are matched BY TEXT by the parser
 *   (rovno-db/supabase/functions/parse-price-list/parsing.ts) — change them
 *   in both places or uploads break.
 * - Example-row names are recognized by the parser (EXAMPLE_ROW warning for
 *   users who forget to delete them) — keep the names in sync too.
 * - "Тип ресурса" carries an Excel data-validation dropdown with the six
 *   Russian labels; the parser maps them back to the canonical enum.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(__dirname, "../public/templates/rovno-price-list-template.xlsx");

const TYPE_LABELS = ["Материал", "Инструмент", "Труд", "Субподряд", "Накладные", "Прочее"];

// Дропдаун покрывает строки 2..1001 — синхронно с лимитом парсера в 1000 строк.
const DROPDOWN_LAST_ROW = 1001;

const EXAMPLE_ROWS = [
  ["Песок речной 0.5-1.0", "м³", 850, "Материал", "SUPPLIER-001"],
  ["Кладка газобетонных блоков", "м²", 1200, "Труд", ""],
  ["Аренда виброплиты", "смена", 1500, "Инструмент", ""],
];

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Rovno";

  const sheet = workbook.addWorksheet("Прайс-лист", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: "Наименование", key: "name", width: 44 },
    { header: "Единица", key: "unit", width: 12 },
    { header: "Цена за единицу", key: "price", width: 16 },
    { header: "Тип ресурса", key: "type", width: 16 },
    { header: "Артикул поставщика", key: "sku", width: 20 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFEEECD8" }, // brand cream background
  };

  for (const row of EXAMPLE_ROWS) {
    sheet.addRow(row);
  }

  sheet.dataValidations.add(`D2:D${DROPDOWN_LAST_ROW}`, {
    type: "list",
    allowBlank: true,
    formulae: [`"${TYPE_LABELS.join(",")}"`],
    showErrorMessage: false,
  });

  await workbook.xlsx.writeFile(OUT_PATH);
  console.log(`written: ${path.relative(process.cwd(), OUT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
