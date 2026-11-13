import { describe, expect, it } from "vitest";
import {
  KB_FOLDERS,
  buildKbDocumentView,
  displayTitle,
  kbHeading,
  normalizeKbRow,
  formatKbDate,
  kbDocPath,
  safeSourceLinks,
  sanitizeSearchTerm,
  searchOrFilter,
  sourceButtonLabel,
  sourceHost,
} from "./kbConfig.mjs";

describe("KB_FOLDERS", () => {
  it("lists the ten folders in the approved order", () => {
    expect(KB_FOLDERS).toEqual([
      "sp", "gost", "laws", "snip", "sanpin", "guides", "manufacturers", "international", "cis", "other",
    ]);
  });
});

describe("displayTitle", () => {
  it("joins designation and title with a space", () => {
    expect(displayTitle({ designation: "СП 71.13330", title: "Изоляционные и отделочные покрытия" }))
      .toBe("СП 71.13330 Изоляционные и отделочные покрытия");
  });
  it("falls back to the title when there is no designation", () => {
    expect(displayTitle({ designation: null, title: "Аквафор: паспорт" })).toBe("Аквафор: паспорт");
    expect(displayTitle({ designation: "  ", title: "X" })).toBe("X");
  });
  it("keeps the designation when the title starts with a longer code, not the same one", () => {
    expect(displayTitle({ designation: "СП 7", title: "СП 71.13330 Покрытия" })).toBe("СП 7 СП 71.13330 Покрытия");
    expect(displayTitle({ designation: "AS 4055", title: "AS 4055: ветровые нагрузки" })).toBe("AS 4055: ветровые нагрузки");
  });
  it("shows the designation alone when the title is blank", () => {
    expect(kbHeading({ designation: "ГОСТ 30547", title: "" })).toBe("ГОСТ 30547");
  });
});

describe("formatKbDate", () => {
  it("formats an ISO date as DD.MM.YYYY without timezone drift", () => {
    expect(formatKbDate("2026-10-13")).toBe("13.10.2026");
    expect(formatKbDate("2026-01-02T00:00:00+00:00")).toBe("02.01.2026");
  });
  it("returns null for empty or malformed input", () => {
    expect(formatKbDate(null)).toBeNull();
    expect(formatKbDate("")).toBeNull();
    expect(formatKbDate("13.10.2026")).toBeNull();
  });
});

describe("safeSourceLinks", () => {
  it("keeps only http/https links and puts official first", () => {
    const links = safeSourceLinks([
      { url: "https://www.consultant.ru/document/cons_doc_LAW_1/", kind: "copy" },
      { url: "javascript:alert(1)", kind: "official" },
      { url: "ftp://example.com/a", kind: "official" },
      { url: "https://minstroyrf.gov.ru/docs/14844/", kind: "official" },
      { url: "not a url", kind: "copy" },
      { kind: "copy" },
      null,
    ]);
    expect(links.map((l) => l.url)).toEqual([
      "https://minstroyrf.gov.ru/docs/14844/",
      "https://www.consultant.ru/document/cons_doc_LAW_1/",
    ]);
  });
  it("tolerates non-array input", () => {
    expect(safeSourceLinks(null)).toEqual([]);
    expect(safeSourceLinks({})).toEqual([]);
  });
});

describe("sourceHost", () => {
  it("drops a leading www.", () => {
    expect(sourceHost("https://www.aquaphor.ru/x.pdf")).toBe("aquaphor.ru");
  });
});

describe("sourceButtonLabel", () => {
  const label = (url: string, kind: string, folder = "sp") => sourceButtonLabel({ url, kind }, folder);

  it("names the Minstroy catalog", () => {
    expect(label("https://minstroyrf.gov.ru/docs/?search=sp", "catalog")).toEqual({ key: "minstroyCatalog", host: "minstroyrf.gov.ru" });
  });
  it("names the Minstroy site", () => {
    expect(label("https://www.minstroyrf.gov.ru/docs/14844/", "official").key).toBe("minstroy");
  });
  it("names КонсультантПлюс for consultant.ru and its subdomains", () => {
    expect(label("https://www.consultant.ru/document/1/", "copy").key).toBe("consultant");
    expect(label("https://login.consultant.ru/link/?req=doc", "copy").key).toBe("consultant");
  });
  it("names gostexpert.ru", () => {
    expect(label("https://gostexpert.ru/gost/gost-30547-97", "copy").key).toBe("gostexpert");
  });
  it("names a manufacturer PDF ignoring case and query", () => {
    expect(label("https://www.aquaphor.ru/docs/Passport.PDF?v=2", "official", "manufacturers").key).toBe("manufacturerPdf");
  });
  it("names a manufacturer site otherwise", () => {
    expect(label("https://www.aquaphor.ru/catalog/", "official", "manufacturers").key).toBe("manufacturerSite");
  });
  it("does not call a PDF outside the manufacturers folder a manufacturer PDF", () => {
    expect(label("https://example.org/a.pdf", "official", "gost")).toEqual({ key: "generic", host: "example.org" });
  });
  it("falls back to the host without www.", () => {
    expect(label("https://www.normacs.ru/Doclist/doc/1.html", "copy")).toEqual({ key: "generic", host: "normacs.ru" });
  });
});

describe("sanitizeSearchTerm / searchOrFilter", () => {
  it("neutralises PostgREST and LIKE metacharacters", () => {
    expect(sanitizeSearchTerm("  50%, (ред.) *x\\\"  ")).toBe("50__ _ред._ _x__");
  });
  it("returns an empty string for blank input", () => {
    expect(sanitizeSearchTerm("   ")).toBe("");
  });
  it("builds an or-filter over designation and title", () => {
    expect(searchOrFilter("СП 71")).toBe("designation.ilike.%СП 71%,title.ilike.%СП 71%");
    expect(searchOrFilter("a,b")).toBe("designation.ilike.%a_b%,title.ilike.%a_b%");
    expect(searchOrFilter(" ")).toBeNull();
  });
});

describe("kbDocPath", () => {
  it("builds the public path with a trailing slash", () => {
    expect(kbDocPath("sp-71-13330")).toBe("/baza/sp-71-13330/");
  });
});

describe("titles that already carry the designation", () => {
  const rows: Array<[string | null, string, string, string]> = [
    ["СП 71.13330", "Изоляционные покрытия", "СП 71.13330 Изоляционные покрытия", "СП 71.13330 · Изоляционные покрытия"],
    ["СП 71.13330", "СП 71.13330.2017 Изоляционные покрытия", "СП 71.13330.2017 Изоляционные покрытия", "СП 71.13330.2017 Изоляционные покрытия"],
    ["ГОСТ 30547-97", "  гост 30547-97 Материалы рулонные", "гост 30547-97 Материалы рулонные", "гост 30547-97 Материалы рулонные"],
    [" 218-ФЗ ", "218-ФЗ О государственной регистрации", "218-ФЗ О государственной регистрации", "218-ФЗ О государственной регистрации"],
    [null, "Еврокод 2", "Еврокод 2", "Еврокод 2"],
  ];
  it.each(rows)("designation %j + title %j", (designation, title, tile, heading) => {
    expect(displayTitle({ designation, title })).toBe(tile);
    expect(kbHeading({ designation, title })).toBe(heading);
  });
});

describe("source row names the site for known hosts", () => {
  const t = (key: string, vars: Record<string, unknown> = {}) =>
    key === "home.knowledgeBase.sourceWithName" ? `${vars.name}, ${vars.host}` : key.startsWith("home.knowledgeBase.sourceName.") ? key.split(".").pop()! : key;
  const sourceRow = (url: string) =>
    buildKbDocumentView(normalizeKbRow({ title: "x", source_links: [{ url, kind: "official" }] }), t).rows.find((r) => r.key === "source")?.value;

  it.each([
    ["https://minstroyrf.gov.ru/docs/14844/", "minstroy, minstroyrf.gov.ru"],
    ["https://www.consultant.ru/document/1/", "consultant, consultant.ru"],
    ["https://login.consultant.ru/link/?req=doc", "consultant, login.consultant.ru"],
    ["https://publication.pravo.gov.ru/document/1", "pravo, publication.pravo.gov.ru"],
    ["https://pravo.gov.ru/", "pravo, pravo.gov.ru"],
    ["https://gostexpert.ru/gost/1", "gostexpert.ru"],
    ["https://www.aquaphor.ru/x.pdf", "aquaphor.ru"],
  ])("%s → %s", (url, expected) => {
    expect(sourceRow(url)).toBe(expected);
  });
});

describe("the note instead of the full text (docs-library slice 9, frame 5 A)", () => {
  const t = (key: string) => key;
  const doc = (over: Record<string, unknown> = {}) =>
    normalizeKbRow({ title: "Положение по техническому обследованию жилых зданий", display_mode: "full_text", last_checked_at: "2026-10-13", ...over });

  it("says the reason when there is one, «later» otherwise, nothing for a card", () => {
    expect(buildKbDocumentView(doc({ text_unavailable_reason: "Официального текста нет." }), t).fullTextNote).toBe("Официального текста нет.");
    expect(buildKbDocumentView(doc(), t).fullTextNote).toBe("home.knowledgeBase.fullTextLater");
    expect(buildKbDocumentView(doc({ display_mode: "card" }), t).fullTextNote).toBeNull();
  });

  it("a readable document has no note", () => {
    const readable = doc({
      folder: "snip", full_text_available: true, text_label: "copy", edition_date: "1988-07-06",
      text_checked_at: "2026-11-13", text_source_url: "https://meganorm.ru/x.htm",
    });
    expect(buildKbDocumentView(readable, t).fullTextNote).toBeNull();
    expect(buildKbDocumentView(readable, t).rows.find((r) => r.key === "checked")).toBeUndefined();
    expect(buildKbDocumentView(readable, t).copyNotice).toBe("home.knowledgeBase.reader.copyNotice");
  });
});
