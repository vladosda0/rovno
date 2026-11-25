// The «Сведения / История» window under a knowledge-base label (docs-library
// slice 7, mockup v6 approved 03.11): one template for a document of any status
// and for a solution card; only the info rows and the history entries differ.
// History rows come from `kb_document_history` / `kb_solution_history`
// (rovno-db, step 7.3); future entries (an approved amendment not yet in force)
// come first and are drawn blue.

// kbFullText.mjs (imported by kbConfig.mjs) imports this module, so the date
// helper is local rather than imported back from kbConfig.mjs.
function formatKbDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

const toNumber = (v) => (typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
const toDate = (v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const toUrl = (v) => (typeof v === "string" && /^https:\/\//.test(v) ? v : null);

/** `kb_documents.upcoming_amendments` → [{ no, url, effectiveFrom }], bad rows dropped. */
export function normalizeUpcomingAmendments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => ({ no: toNumber(a?.no), url: toUrl(a?.url), effectiveFrom: toDate(a?.effective_from) }))
    .filter((a) => a.no !== null && a.effectiveFrom !== null)
    .sort((x, y) => x.effectiveFrom.localeCompare(y.effectiveFrom) || x.no - y.no);
}

/** One history row from either RPC, normalised. */
export function normalizeHistoryRow(row) {
  const r = row ?? {};
  return {
    date: toDate(r.occurred_on),
    event: typeof r.event === "string" ? r.event : "",
    amendmentNo: toNumber(r.amendment_no),
    url: toUrl(r.link_url),
    replacedBySlug: typeof r.replaced_by_slug === "string" ? r.replaced_by_slug : null,
    replacedByDesignation: typeof r.replaced_by_designation === "string" ? r.replaced_by_designation : null,
    docDesignation: typeof r.doc_designation === "string" ? r.doc_designation : null,
    future: r.is_future === true,
  };
}

const KNOWN = new Set([
  "amendment_upcoming", "amendment_approved", "amendment_effective", "amendment_pending",
  "text_checked", "cancelled", "replaced", "document_added",
  "solution_checking", "solution_rechecked", "checked",
]);

/**
 * Entries for the window: { key, date, text, link: { href, label, external } | null, future }.
 * `appliedList` is «1-4» for the «текст сверен, вписаны изменения № 1-4» line.
 * Unknown events are skipped rather than shown raw.
 */
export function kbHistoryEntries(rows, t, { appliedList = null, docPath = (slug) => `/baza/${slug}/`, pending = [] } = {}) {
  const out = [];
  const pendingLogged = new Set();
  rows.map(normalizeHistoryRow).forEach((r, i) => {
    if (!r.date || !KNOWN.has(r.event)) return;
    const amendment = r.amendmentNo !== null
      ? { href: r.url, label: t("home.knowledgeBase.history.amendment", { no: r.amendmentNo }), external: true }
      : null;
    let text;
    let link = null;
    let suffix = null;
    switch (r.event) {
      case "amendment_upcoming":
        text = t("home.knowledgeBase.history.upcoming");
        link = amendment;
        break;
      case "amendment_approved":
        text = t("home.knowledgeBase.history.approved");
        link = amendment;
        break;
      case "amendment_effective":
        text = t("home.knowledgeBase.history.effective");
        link = amendment;
        break;
      case "amendment_pending":
        text = t("home.knowledgeBase.history.pending");
        link = amendment;
        suffix = t("home.knowledgeBase.history.pendingSuffix");
        if (r.amendmentNo !== null) pendingLogged.add(r.amendmentNo);
        break;
      case "text_checked":
        text = appliedList
          ? t(/^\d+$/.test(appliedList) ? "home.knowledgeBase.history.textCheckedWithOne" : "home.knowledgeBase.history.textCheckedWith", { list: appliedList })
          : t("home.knowledgeBase.history.textChecked");
        break;
      case "cancelled":
        text = t("home.knowledgeBase.history.cancelled");
        break;
      case "replaced":
        text = t("home.knowledgeBase.history.replaced");
        if (r.replacedBySlug) {
          link = { href: docPath(r.replacedBySlug), label: r.replacedByDesignation ?? r.replacedBySlug, external: false };
        }
        break;
      case "document_added":
        text = t("home.knowledgeBase.history.added");
        break;
      case "solution_checking":
        text = r.docDesignation
          ? t("home.knowledgeBase.history.solutionCheckingDoc", { doc: r.docDesignation })
          : t("home.knowledgeBase.history.solutionChecking");
        break;
      case "solution_rechecked":
        text = t("home.knowledgeBase.history.solutionRechecked");
        break;
      default:
        text = t("home.knowledgeBase.history.solutionChecked");
    }
    out.push({ key: `${r.event}:${r.date}:${r.amendmentNo ?? ""}:${i}`, date: formatKbDate(r.date), iso: r.date, text, link, suffix, future: r.future });
  });
  // Amendments marked «not in the text yet» before slice 7 have no journal row:
  // they still get their line, without a date, right under the future entries.
  const undated = [];
  for (const p of pending) {
    if (pendingLogged.has(p.no)) continue;
    undated.push(p.url
      ? { key: `pending:${p.no}`, date: null, iso: "", text: t("home.knowledgeBase.history.pending"),
          link: { href: p.url, label: t("home.knowledgeBase.history.amendment", { no: p.no }), external: true },
          suffix: t("home.knowledgeBase.history.pendingSuffix"), future: false }
      : { key: `pending:${p.no}`, date: null, iso: "", text: t("home.knowledgeBase.pending.missingOne", { list: String(p.no) }),
          link: null, suffix: null, future: false });
  }
  out.sort((a, b) => Number(b.future) - Number(a.future) || b.iso.localeCompare(a.iso));
  const firstPast = out.findIndex((e) => !e.future);
  out.splice(firstPast === -1 ? out.length : firstPast, 0, ...undated);
  return out;
}

/** Today in Moscow, YYYY-MM-DD: from this date on an amendment is in force, not upcoming. */
export function kbMoscowToday(now = new Date()) {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** The clock inside the green label: an approved amendment is still waiting for its date. */
export function kbHasUpcoming(doc, today = kbMoscowToday()) {
  return (
    doc?.docStatus === "active" &&
    Array.isArray(doc.upcomingAmendments) &&
    doc.upcomingAmendments.some((a) => a.effectiveFrom > today)
  );
}
