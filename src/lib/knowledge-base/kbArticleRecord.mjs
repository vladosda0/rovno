// A registry record about one article, chapter or section of a code or law
// (docs-library 9.9): «ст. 220 НК РФ», «гл. 31 НК РФ», «ст. 40 218-ФЗ». Such a
// record has no text of its own; it opens its place inside the code's text
// (the code's page at the anchor), or says why it cannot.
//
// Anchors follow rovno-db scripts/kb-law-text.mjs slug(): «Статья 220» → st-220,
// «Глава 31» → gl-31, «Раздел X» → rz-x, a superscript index «39¹» → st-39s1, a
// real dotted number «3.7» → st-3-7. Registry designations write superscript
// articles with a dot («ст. 217.1» is «Статья 217¹», anchor st-217s1), so a
// dotted number tries both spellings and the code's own anchors decide.

const SUPER = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const NUMBER = "(\\d+(?:\\.\\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)*)";
// «ст. 55.5-1» (55⁵⁻¹) and «ст. 702-729» (a range) both have «-N»: an end not
// greater than the last part of the number is an index, a greater one a range.
// «ст. 7.30-7.32» (an end with a dot) is always a range.
const HEAD = new RegExp(`^(?:ч\\.\\s*(\\d+)\\s+)?(ст|гл)\\.\\s*${NUMBER}(?:-(\\d+)(?![.\\d]))?`, "u");
const SECTION = /^разд\.\s*([IVXLC]+|\d+)/u;
const ARTICLE_ANYWHERE = new RegExp(`ст\\.\\s*${NUMBER}`, "u");
// «НК РФ», «ГрК РФ», «КоАП РФ»: a short name of up to five letters before «РФ».
const CODE_NAME = /(?:^|[\s(,;])([А-ЯЁ][А-Яа-яЁё]{0,4})\s+РФ(?![А-Яа-яЁё])/u;
const LAW_NUMBER = /(?:^|[\s(,;№])(\d+-ФЗ)(?![А-Яа-яЁё\d])/u;
const RF_LAW = /(Закон[а-я]*\s+РФ\s+)?№\s*(\d+(?:-\d+)?)/u;

/** «55.5-1», «39¹⁻²»: head 55 with index 5 and sub-index 1 (anchor st-55s5-1 or a sibling spelling). */
function indexSpellings(prefix, head, a, b) {
  return [`${prefix}-${head}s${a}-${b}`, `${prefix}-${head}s${a}s${b}`, `${prefix}-${head}-${a}-${b}`];
}

function spellings(prefix, number) {
  const sup = number.match(/^(\d+)([⁰¹²³⁴⁵⁶⁷⁸⁹]+)⁻([⁰¹²³⁴⁵⁶⁷⁸⁹]+)$/u);
  if (sup) {
    const digits = (run) => [...run].map((c) => SUPER[c]).join("");
    return indexSpellings(prefix, sup[1], digits(sup[2]), digits(sup[3]));
  }
  const base = number.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu, (run) => `s${[...run].map((c) => SUPER[c]).join("")}`);
  if (!base.includes(".")) return [`${prefix}-${base.toLowerCase()}`];
  const [head, ...rest] = base.split(".");
  const dashed = `${prefix}-${base.replace(/\./g, "-")}`;
  const indexed = `${prefix}-${head}${rest.map((r) => `s${r}`).join("")}`;
  return [...new Set([dashed, indexed])];
}

/** The code a designation names: «НК РФ», «218-ФЗ», «№2300-1» (with a label for the reason line). */
function codeIn(text) {
  const name = text.match(CODE_NAME);
  if (name && !/^Закон/u.test(name[1])) return { code: `${name[1]} РФ`, codeLabel: `${name[1]} РФ` };
  const law = text.match(LAW_NUMBER);
  if (law) return { code: law[1], codeLabel: law[1] };
  const rf = text.match(RF_LAW);
  if (rf) return { code: `№${rf[2]}`, codeLabel: rf[1] ? `Закон РФ №${rf[2]}` : `№${rf[2]}` };
  return null;
}

/**
 * «ст. 220 НК РФ» → { unit, code, codeLabel, candidates: ["st-220"] }; null when the
 * designation is not about one place of a named code or law.
 */
export function parseKbArticleRef(designation) {
  if (typeof designation !== "string") return null;
  const text = designation.replace(/ /g, " ").trim();
  let unit;
  let candidates;
  let rest;
  const head = text.match(HEAD);
  const section = head ? null : text.match(SECTION);
  if (head) {
    const [whole, part, word, number, end] = head;
    const kind = word === "ст" ? "st" : "gl";
    unit = kind;
    const parts = number.split(".");
    const last = Number(parts[parts.length - 1]);
    const own =
      end !== undefined && parts.length === 2 && /^\d+$/.test(parts[1]) && Number(end) <= last
        ? indexSpellings(kind, parts[0], parts[1], end)
        : spellings(kind, number);
    candidates = part && kind === "st" ? [...own.map((a) => `${a}-ch-${part}`), ...own] : own;
    rest = text.slice(whole.length);
  } else if (section) {
    unit = "rz";
    candidates = [`rz-${section[1].toLowerCase()}`];
    rest = text.slice(section[0].length);
    // «разд. X ТК РФ (ст. 209 и далее)»: the first article when the section has no anchor.
    const first = rest.match(ARTICLE_ANYWHERE);
    if (first) candidates.push(...spellings("st", first[1]));
  } else {
    return null;
  }
  const code = codeIn(rest);
  if (!code) return null;
  return { unit, ...code, candidates };
}

/**
 * Every key a document with text is found by: its code name and the law numbers
 * after it («ЗК РФ, 136-ФЗ» → ЗК РФ, 136-ФЗ), a leading law number («218-ФЗ»), a
 * leading bare number of a law of the RF («2395-1 от …» → №2395-1).
 */
export function kbCodeKeys(designation) {
  if (typeof designation !== "string") return [];
  const text = designation.replace(/\u00a0/g, " ").trim();
  const keys = [];
  const first = kbCodeKey(text);
  if (first) keys.push(first);
  if (first && / РФ$/u.test(first)) for (const m of text.matchAll(/(\d+-ФЗ)(?![А-Яа-яЁё\d])/gu)) keys.push(m[1]);
  const bare = text.match(/^(\d+-\d+)(?:\s|$)/u);
  if (bare) keys.push(`№${bare[1]}`);
  return [...new Set(keys)];
}

/** The main key a document with text is found by: its code name, else its leading law number or №. */
export function kbCodeKey(designation) {
  if (typeof designation !== "string") return null;
  const text = designation.replace(/ /g, " ").trim();
  const name = text.match(/^([А-ЯЁ][А-Яа-яЁё]{0,4})\s+РФ(?![А-Яа-яЁё])/u);
  if (name && !/^(Закон|ПП)$/u.test(name[1])) return `${name[1]} РФ`;
  const law = text.match(/^(\d+-ФЗ)(?![А-Яа-яЁё\d])/u);
  if (law) return law[1];
  const rf = text.match(/^Закон\s+РФ\s+№\s*(\d+(?:-\d+)?)/u);
  if (rf) return `№${rf[1]}`;
  return null;
}

/** Every document keyed by `code` (two for «69-ФЗ», ГрК and the heat law for «190-ФЗ»). */
export function matchKbCodes(code, docs) {
  return (docs ?? []).filter((d) => kbCodeKeys(d.designation).includes(code));
}

/** The one document with text keyed by `code`; null when none or more than one. */
export function pickKbCode(code, docs) {
  const hits = matchKbCodes(code, docs);
  return hits.length === 1 ? hits[0] : null;
}

/**
 * What a record without text does: { kind: "open", slug, anchor, ref } inside its
 * code, { kind: "reason", why: "codeMissing" | "notFound", codeLabel, ref }, or
 * null when it is not an article record or the base already gives its own reason.
 * `codeAnchors` are the anchors found in the picked code (all of them, or just the
 * candidates that exist).
 */
export function resolveKbArticleRecord(record, codes, codeAnchors) {
  if (!record || record.textUnavailableReason) return null;
  // Only the «Законы и акты» folder: «ст. 48.2 ГрК РФ» in «Прочее» is a registry card, not the article.
  if (record.folder !== undefined && record.folder !== "laws") return null;
  const ref = parseKbArticleRef(record.designation);
  if (!ref) return null;
  const hits = matchKbCodes(ref.code, codes);
  // Two documents answer to the number: no guess and no promise, the plain line stays.
  if (hits.length > 1) return { kind: "reason", why: "ambiguous", codeLabel: ref.codeLabel, ref };
  const code = hits[0];
  if (!code) return { kind: "reason", why: "codeMissing", codeLabel: ref.codeLabel, ref };
  const present = new Set(codeAnchors ?? []);
  const anchor = ref.candidates.find((a) => present.has(a));
  if (!anchor) return { kind: "reason", why: "notFound", codeLabel: ref.codeLabel, ref };
  return { kind: "open", slug: code.slug, anchor, ref };
}

/** The reason line (frame 5 A) for a resolution of kind "reason", else null. */
export function kbArticleReason(resolution, t) {
  if (!resolution || resolution.kind !== "reason" || resolution.why === "ambiguous") return null;
  return t(`home.knowledgeBase.article.${resolution.why}`, { code: resolution.codeLabel });
}
