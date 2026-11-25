// «Что изменилось» (docs-library slice 8, step 8.4; mockup docs-library-s8.html
// v3, frames 1-3, 5, 7): the rows of `kb_changes_feed` (rovno-db, step 8.2) as
// lines for people, grouped by month, newest first. One module for the in-app
// page, the guest page /baza/izmeneniya/ and its prerendered HTML, so the three
// say the same thing.

export const KB_CHANGES_PATH = "/baza/izmeneniya/";

const toDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const toNumber = (v) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const toText = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

function formatDate(iso) {
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : null;
}

export function normalizeKbChangeRow(row) {
  const r = row ?? {};
  return {
    date: toDate(r.listed_on),
    event: typeof r.event === "string" ? r.event : "",
    docSlug: toText(r.doc_slug),
    docHeading: toText(r.doc_heading),
    amendmentNo: toNumber(r.amendment_no),
    effectiveFrom: toDate(r.effective_from),
    replacedBySlug: toText(r.replaced_by_slug),
    replacedByHeading: toText(r.replaced_by_heading),
    solutionsRechecked: toNumber(r.solutions_rechecked) ?? 0,
    solutionSlug: toText(r.solution_slug),
    solutionTitle: toText(r.solution_title),
    afterDocSlug: toText(r.after_doc_slug),
    afterDocHeading: toText(r.after_doc_heading),
    afterAmendmentNo: toNumber(r.after_amendment_no),
    afterEvent: toText(r.after_event),
  };
}

const K = "home.knowledgeBase.changes.";
const AMENDMENT_EVENTS = new Set(["amendment_approved", "amendment_effective", "amendment_pending"]);
const DOC_EVENTS = new Set([...AMENDMENT_EVENTS, "cancelled", "replaced", "document_added"]);

const docPart = (slug, heading) => ({ text: heading ?? slug, doc: slug });

/**
 * One line: { key, iso, date, parts, note }. A part is plain text, or carries
 * `doc` / `solution` (a slug) when it names something that opens. Null for a
 * row people are not shown (unknown event, no date, nothing to name).
 */
export function kbChangeEntry(row, t, index = 0) {
  const r = normalizeKbChangeRow(row);
  if (!r.date) return null;
  let parts;
  let note = null;
  const rechecked = r.solutionsRechecked > 0 ? t(`${K}rechecked`, { count: r.solutionsRechecked }) : null;

  if (DOC_EVENTS.has(r.event)) {
    if (!r.docSlug && !r.docHeading) return null;
    if (AMENDMENT_EVENTS.has(r.event) && r.amendmentNo === null) return null;
    const subject = r.docSlug ? docPart(r.docSlug, r.docHeading) : { text: r.docHeading };
    const no = r.amendmentNo;
    switch (r.event) {
      case "amendment_approved":
        parts = [subject, {
          text: r.effectiveFrom
            ? t(`${K}approved`, { no, date: formatDate(r.effectiveFrom) })
            : t(`${K}approvedNoDate`, { no }),
        }];
        note = t(`${K}approvedNote`);
        break;
      case "amendment_effective":
        parts = [subject, { text: t(`${K}effective`, { no }) }];
        break;
      case "amendment_pending":
        parts = [subject, { text: t(`${K}pending`, { no }) }];
        note = t(`${K}pendingNote`);
        break;
      case "replaced":
        if (r.replacedBySlug || r.replacedByHeading) {
          const replacement = r.replacedBySlug ? docPart(r.replacedBySlug, r.replacedByHeading) : { text: r.replacedByHeading };
          parts = [subject, { text: t(`${K}replaced`) }, replacement];
        } else {
          parts = [subject, { text: t(`${K}cancelled`) }];
        }
        note = rechecked;
        break;
      case "cancelled":
        parts = [subject, { text: t(`${K}cancelled`) }];
        note = rechecked;
        break;
      default:
        parts = [subject, { text: t(`${K}added`) }];
        note = t(`${K}addedNote`);
    }
  } else if (r.event === "solution_rechecked") {
    if (!r.solutionSlug || !r.solutionTitle) return null;
    const subject = { text: t(`${K}solution`, { title: r.solutionTitle }), solution: r.solutionSlug };
    const after = r.afterDocSlug ? docPart(r.afterDocSlug, r.afterDocHeading) : r.afterDocHeading ? { text: r.afterDocHeading } : null;
    if (after && r.afterAmendmentNo !== null && (!r.afterEvent || AMENDMENT_EVENTS.has(r.afterEvent))) {
      parts = [subject, { text: t(`${K}solutionAfterAmendment`, { no: r.afterAmendmentNo }) }, after];
    } else if (after && (r.afterEvent === "cancelled" || r.afterEvent === "replaced")) {
      parts = [subject, { text: t(`${K}solutionAfterCancel`) }, after];
    } else if (after) {
      parts = [subject, { text: t(`${K}solutionAfterChange`) }, after];
    } else {
      parts = [subject, { text: t(`${K}solutionRewritten`) }];
    }
    note = t(`${K}solutionNote`);
  } else {
    return null;
  }
  return { key: `${r.date}:${r.event}:${r.docSlug ?? r.solutionSlug ?? ""}:${r.amendmentNo ?? ""}:${index}`, iso: r.date, date: formatDate(r.date), parts, note };
}

/** «ноябрь», «November»: the month on its own, as a calendar names it. */
export function kbMonthName(iso, language) {
  const date = new Date(`${iso.slice(0, 7)}-15T12:00:00Z`);
  return new Intl.DateTimeFormat(language, { month: "long", timeZone: "UTC" }).format(date);
}

/** «Ноябрь 2026». */
export function kbMonthLabel(iso, language) {
  const month = kbMonthName(iso, language);
  return `${month.charAt(0).toLocaleUpperCase(language)}${month.slice(1)} ${iso.slice(0, 4)}`;
}

/** [{ key: "2026-11", label: "Ноябрь 2026", entries }], newest month and newest line first. */
export function kbChangeMonths(rows, t, language) {
  const entries = (Array.isArray(rows) ? rows : [])
    .map((row, i) => kbChangeEntry(row, t, i))
    .filter(Boolean)
    .sort((a, b) => b.iso.localeCompare(a.iso));
  const months = [];
  for (const entry of entries) {
    const key = entry.iso.slice(0, 7);
    let month = months.at(-1);
    if (!month || month.key !== key) {
      month = { key, label: kbMonthLabel(entry.iso, language), entries: [] };
      months.push(month);
    }
    month.entries.push(entry);
  }
  return months;
}

/** «За ноябрь: 3» under the tile; null while the month has nothing (frame 1). */
export function kbChangesMonthLine(count, t, language, today) {
  if (!(count > 0)) return null;
  return t(`${K}monthCount`, { month: kbMonthName(today, language), count });
}
