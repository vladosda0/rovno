// Static blanks built by scripts/document-blanks/build.mjs into public/templates/blanks/.
export type DocumentBlankGroup = "contract" | "acceptance";
export type DocumentBlankSource = "rovno" | "goskomstat" | "minstroy";

export interface DocumentBlank {
  id: string;
  group: DocumentBlankGroup;
  format: "docx" | "xlsx";
  href: string;
  downloadName: string;
  source: DocumentBlankSource;
}

function blank(
  id: string,
  group: DocumentBlankGroup,
  format: DocumentBlank["format"],
  downloadName: string,
  source: DocumentBlankSource = "rovno",
): DocumentBlank {
  return {
    id,
    group,
    format,
    href: `/templates/blanks/${id}.${format}`,
    downloadName: `${downloadName}.${format}`,
    source,
  };
}

export const DOCUMENT_BLANKS: DocumentBlank[] = [
  blank("dogovor-bytovoj", "contract", "docx", "Договор подряда с частным заказчиком"),
  blank("dogovor-stroitelnyj", "contract", "docx", "Договор строительного подряда с компанией"),
  blank("dopsoglashenie", "contract", "docx", "Дополнительное соглашение"),
  blank("uvedomlenie-o-priostanovke", "contract", "docx", "Уведомление о приостановке работ"),
  blank("pretenziya", "contract", "docx", "Претензия"),
  blank("akt-sdachi-priemki", "acceptance", "docx", "Акт сдачи-приёмки работ"),
  blank("akt-o-nedostatkah", "acceptance", "docx", "Акт о выявленных недостатках"),
  blank("akt-materialov", "acceptance", "docx", "Акт приёма-передачи материалов от заказчика"),
  blank("akt-skrytyh-rabot", "acceptance", "docx", "Акт освидетельствования скрытых работ", "minstroy"),
  blank("ks-2", "acceptance", "xlsx", "КС-2 Акт о приёмке выполненных работ", "goskomstat"),
  blank("ks-3", "acceptance", "xlsx", "КС-3 Справка о стоимости выполненных работ и затрат", "goskomstat"),
];

export const DOCUMENT_BLANK_GROUPS: DocumentBlankGroup[] = ["contract", "acceptance"];

/** Lowercase and fold «ё» so «приемка» finds «приёмка». */
export function normalizeTemplateQuery(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** Every word of the query must occur in the title or description. */
export function matchesTemplateQuery(query: string, ...texts: string[]): boolean {
  const words = normalizeTemplateQuery(query).split(" ").filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeTemplateQuery(texts.join(" "));
  return words.every((word) => haystack.includes(word));
}
