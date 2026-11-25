// Search and AI-search surface of the public knowledge base (docs-library).
//
// Plain ESM shared by the SPA (useDocumentHead) and the prerenderer, so the
// static HTML a crawler reads and the hydrated page carry the same title,
// description, breadcrumbs and JSON-LD. Practice this follows:
//   - Google «AI features and your website»: no special files or markup are
//     needed; what counts is text in the HTML, internal links, and structured
//     data that matches the visible page.
//   - Yandex Neuro picks sources from pages already ranking in ordinary search,
//     so the same fundamentals; IndexNow (scripts/indexnow-submit.mjs) gets
//     new pages to Yandex and Bing in hours.
//   - schema.org/Legislation (from the ELI ontology) for normative documents:
//     identifier, version date, legal force, the issuing body.
// Types live in kbSeo.d.mts.

import { KB_FOLDERS, displayTitle, kbDocPath, kbHeading, sourceHost } from "./kbConfig.mjs";
import { kbBodyPieces, kbCopyNotice, kbEditionLine, kbEditionNote, kbFullTextReadable, kbTextLabel } from "./kbFullText.mjs";
import { KB_SOLUTIONS_PATH, kbSolutionDocuments, kbSolutionPath } from "./kbSolutions.mjs";
import { KB_CHANGES_PATH } from "./kbChanges.mjs";

export const SITE_ORIGIN = "https://rovno.ai";
export const KB_SITE_SECTION = "База знаний Ровно";
export const KB_INDEX_PATH = "/baza/";
/** Documents per public folder page: the largest folder (manufacturers, ~4k) splits into pages. */
export const KB_FOLDER_PAGE_SIZE = 500;

/** Folders whose documents are normative acts (schema.org Legislation); the rest are CreativeWork. */
const NORMATIVE_FOLDERS = new Set(["sp", "gost", "laws", "snip", "sanpin", "cis", "international"]);

export function kbFolderPath(folder, page = 1) {
  return page > 1 ? `/baza/razdel/${folder}/${page}/` : `/baza/razdel/${folder}/`;
}

export function kbFolderPageCount(total) {
  return Math.max(1, Math.ceil(total / KB_FOLDER_PAGE_SIZE));
}

const abs = (path) => (path === "/" ? SITE_ORIGIN : `${SITE_ORIGIN}${path}`);

/** The visible breadcrumb trail; the BreadcrumbList markup is built from the same list. */
export function kbBreadcrumbTrail(t, { folder = null, doc = null } = {}) {
  const trail = [
    { name: "Главная", path: "/" },
    { name: t("home.knowledgeBase.title"), path: KB_INDEX_PATH },
  ];
  const f = doc?.folder ?? folder;
  if (f) trail.push({ name: t(`home.knowledgeBase.folders.${f}.title`), path: kbFolderPath(f) });
  if (doc) trail.push({ name: doc.designation ?? doc.title, path: kbDocPath(doc.slug) });
  return trail;
}

function breadcrumbJsonLd(trail) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((entry, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: entry.name,
      item: abs(entry.path),
    })),
  };
}

const PUBLISHER = {
  "@type": "Organization",
  "@id": `${SITE_ORIGIN}/#organization`,
  name: "Ровно ИИ",
  url: SITE_ORIGIN,
  logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/rovno-logo.png` },
};

const WEBSITE = {
  "@type": "WebSite",
  "@id": `${SITE_ORIGIN}/#website`,
  name: "Ровно ИИ",
  url: SITE_ORIGIN,
  inLanguage: "ru-RU",
  publisher: { "@id": PUBLISHER["@id"] },
};

function clip(text, max = 160) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * <title>: a readable full text says so («полный текст»), the query people type
 * for a norm. Kept short of ~70 characters where the heading allows.
 */
export function kbDocumentTitle(doc, { spFullText = true } = {}) {
  const heading = kbHeading(doc);
  return kbFullTextReadable(doc, spFullText)
    ? `${heading} — полный текст | ${KB_SITE_SECTION}`
    : `${heading} — ${KB_SITE_SECTION}`;
}

/**
 * <meta description>, ≤160 characters. A readable full text leads with what the
 * page gives (the text, the contents, links to clauses) and the edition line,
 * then the first words of the text; a card keeps the registry facts.
 */
export function kbDocumentDescription(doc, t, { spFullText = true, firstText = null } = {}) {
  const title = displayTitle(doc);
  if (kbFullTextReadable(doc, spFullText)) {
    const edition = kbEditionLine(doc, t);
    const parts = [`${title}: полный текст онлайн, оглавление и ссылки на пункты`, edition, firstText].filter(Boolean);
    return clip(parts.join(". "));
  }
  const parts = [doc?.category, doc?.applicabilityNote, doc?.edition ? `Редакция: ${doc.edition}` : null]
    .filter((p) => typeof p === "string" && p.trim());
  return clip(`${title}. ${parts.join(". ")}`);
}

/** The first body text of a document, for the description. */
export function kbFirstText(clauses) {
  // A law clause's edition note is not its text (slice 9).
  // A table line (step 9.3) is cells, not prose for a description.
  const texts = (clauses ?? []).map((x) => kbBodyPieces(kbEditionNote(x).text).filter((p) => p.kind === "text").map((p) => p.text).join("\n"));
  const text = texts.find((x) => x && x.length > 40);
  return text ? clip(text, 90) : null;
}

const LEGAL_FORCE = { active: "https://schema.org/InForce", replaced: "https://schema.org/NotInForce", cancelled: "https://schema.org/NotInForce" };

/**
 * JSON-LD for a document page: WebPage → the document (Legislation for norms,
 * else CreativeWork) → its sections as parts with their #anchors, plus the
 * BreadcrumbList that matches the visible trail. Only facts shown on the page go
 * in: the legal force is stated only for a document whose full text we hold
 * (its status is checked); a registry card does not claim it.
 */
export function kbDocumentJsonLd(doc, t, { clauses = [], spFullText = true, description = null } = {}) {
  const url = abs(kbDocPath(doc.slug));
  const readable = kbFullTextReadable(doc, spFullText) && clauses.length > 0;
  const normative = NORMATIVE_FOLDERS.has(doc.folder);
  const official =
    doc.sourceLinks.find((l) => l.kind === "official") ?? (doc.textLabel === "copy" ? null : doc.sourceLinks[0]) ?? null;

  const work = {
    "@type": normative ? "Legislation" : "CreativeWork",
    "@id": `${url}#document`,
    name: doc.title,
    inLanguage: "ru-RU",
    url,
  };
  if (doc.designation) {
    work.alternateName = doc.designation;
    if (normative) work.legislationIdentifier = doc.designation;
  }
  if (normative && doc.category) work.legislationType = doc.category;
  if (normative && doc.country) work.legislationJurisdiction = doc.country;
  if (doc.publisher) {
    work[normative ? "legislationPassedBy" : "author"] = { "@type": "Organization", name: doc.publisher };
  }
  if (normative && doc.effectiveFrom) work.legislationDate = doc.effectiveFrom;
  if (official) work.isBasedOn = official.url;
  if (doc.applicabilityNote) work.description = doc.applicabilityNote;
  if (readable) {
    if (normative) {
      if (doc.editionDate) work.legislationDateVersion = doc.editionDate;
      work.legislationLegalForce = LEGAL_FORCE[doc.docStatus] ?? LEGAL_FORCE.active;
    }
    if (doc.textPdfUrl && doc.textLabel !== "copy") work.isBasedOn = doc.textPdfUrl;
    const label = kbTextLabel(doc, t);
    const edition = kbEditionLine(doc, t);
    const copy = kbCopyNotice(doc, t);
    if (label || edition || copy) work.version = [label?.text, edition, copy].filter(Boolean).join(". ");
    const parts = clauses
      .filter((c) => c.heading && c.level <= 2 && c.number && /^\d/.test(c.number))
      .map((c) => ({
        "@type": normative ? "Legislation" : "CreativeWork",
        name: `${c.number} ${c.heading}`,
        url: `${url}#${c.anchor}`,
        ...(normative ? { legislationIdentifier: `${doc.designation ?? doc.title}, п. ${c.number}` } : {}),
      }));
    if (parts.length) work.hasPart = parts;
  }

  const page = {
    "@type": "WebPage",
    "@id": url,
    url,
    name: kbDocumentTitle(doc, { spFullText }),
    inLanguage: "ru-RU",
    isPartOf: { "@id": WEBSITE["@id"] },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    mainEntity: { "@id": work["@id"] },
    publisher: { "@id": PUBLISHER["@id"] },
  };
  if (description) page.description = description;
  const modified = (readable && doc.textCheckedAt) || doc.lastCheckedAt;
  if (modified) page.dateModified = modified;

  const crumbs = { ...breadcrumbJsonLd(kbBreadcrumbTrail(t, { doc })), "@id": `${url}#breadcrumb` };
  return { "@context": "https://schema.org", "@graph": [page, work, crumbs, WEBSITE, PUBLISHER] };
}

export function kbIndexTitle() {
  return `${KB_SITE_SECTION}: СП, ГОСТ, СНиП и законы для стройки и ремонта`;
}

export function kbIndexDescription(total) {
  return clip(
    `Строительные нормы в одном месте: своды правил, ГОСТ, СНиП, СанПиН, законы и документы производителей${
      total ? ` — ${total} документов` : ""
    }. Редакция и дата проверки у каждого документа, у СП полный текст со ссылками на пункты.`,
  );
}

export function kbFolderTitle(folder, t, page = 1) {
  const name = t(`home.knowledgeBase.folders.${folder}.title`);
  return `${name}${page > 1 ? `, страница ${page}` : ""} — ${KB_SITE_SECTION}`;
}

export function kbFolderDescription(folder, t, total) {
  const name = t(`home.knowledgeBase.folders.${folder}.title`);
  const desc = t(`home.knowledgeBase.folders.${folder}.description`);
  return clip(`${name}: ${desc}. ${documentsCountText(t, total)} с редакцией, датой проверки и ссылкой на первоисточник.`);
}

/**
 * CollectionPage + ItemList + BreadcrumbList for the index or a folder page; the
 * «Решения» folder passes its own path and trail.
 */
export function kbCollectionJsonLd(t, { folder = null, page = 1, items = [], name, description, path: ownPath = null, trail: ownTrail = null }) {
  const path = ownPath ?? (folder ? kbFolderPath(folder, page) : KB_INDEX_PATH);
  const url = abs(path);
  const trail = ownTrail ?? kbBreadcrumbTrail(t, { folder });
  if (!ownTrail && folder && page > 1) trail[trail.length - 1] = { name: trail[trail.length - 1].name, path };
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": url,
        url,
        name,
        description,
        inLanguage: "ru-RU",
        isPartOf: { "@id": WEBSITE["@id"] },
        breadcrumb: { "@id": `${url}#breadcrumb` },
        publisher: { "@id": PUBLISHER["@id"] },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: items.length,
          itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: abs(item.path),
            name: item.name,
          })),
        },
      },
      { ...breadcrumbJsonLd(trail), "@id": `${url}#breadcrumb` },
      WEBSITE,
      PUBLISHER,
    ],
  };
}

/** Folders with documents, in display order, for the index page. */
export function kbIndexItems(counts, t) {
  return KB_FOLDERS.filter((f) => (counts?.[f] ?? 0) > 0).map((f) => ({
    folder: f,
    name: t(`home.knowledgeBase.folders.${f}.title`),
    description: t(`home.knowledgeBase.folders.${f}.description`),
    count: counts[f],
    path: kbFolderPath(f),
  }));
}

/** A document line of a folder page: link, title, edition or label. */
export function kbFolderItem(doc, t, { spFullText = true } = {}) {
  const readable = kbFullTextReadable(doc, spFullText);
  return {
    path: kbDocPath(doc.slug),
    name: displayTitle(doc),
    note: (readable && kbEditionLine(doc, t)) || doc.edition || null,
    label: readable ? kbTextLabel(doc, t) : null,
    host: doc.sourceLinks[0] ? sourceHost(doc.sourceLinks[0].url) : null,
  };
}

/**
 * A build against the staging backend must not be indexed: the staging site
 * serves the same documents as rovno.ai and would compete with it in search.
 * Decided by the Supabase project the build reads (staging is Cloud project
 * aaycwobhdkrrgfxwcfxg; prod is api.rovno.ai).
 */
export function isStagingBackend(supabaseUrl) {
  return typeof supabaseUrl === "string" && supabaseUrl.includes("aaycwobhdkrrgfxwcfxg");
}

export const STAGING_ROBOTS_TXT = "# Staging build: not for search engines. rovno.ai is the indexed site.\nUser-agent: *\nDisallow: /\n";

function russianPluralForm(count) {
  const n10 = count % 10, n100 = count % 100;
  return n10 === 1 && n100 !== 11 ? "one" : n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14) ? "few" : "many";
}

/** «1 документ», «3 документа», «237 документов»: the locale's _one/_few/_many by Russian rules. */
export function documentsCountText(t, count) {
  return t(`home.knowledgeBase.documentsCount_${russianPluralForm(count)}`, { count });
}

/** «1 решение», «3 решения», «6 решений». */
export function solutionsCountText(t, count) {
  return t(`home.knowledgeBase.solutions.count_${russianPluralForm(count)}`, { count });
}

// ── «Решения» (slice 4, frame 6) ────────────────────────────────────────────

/** Главная › База знаний › Решения [› <card>]: the visible trail and the BreadcrumbList. */
export function kbSolutionsTrail(t, solution = null) {
  const trail = [
    { name: "Главная", path: "/" },
    { name: t("home.knowledgeBase.title"), path: KB_INDEX_PATH },
    { name: t("home.knowledgeBase.solutions.title"), path: KB_SOLUTIONS_PATH },
  ];
  if (solution) trail.push({ name: solution.title, path: kbSolutionPath(solution.slug) });
  return trail;
}

/** The «Решения» line of the /baza/ index, first, only while a card is published. */
export function kbSolutionsIndexItem(count, t) {
  if (!count) return null;
  return {
    name: t("home.knowledgeBase.solutions.title"),
    description: t("home.knowledgeBase.solutions.description"),
    count,
    path: KB_SOLUTIONS_PATH,
  };
}

export function kbSolutionsTitle() {
  return `Решения: как сделать по нормам — ${KB_SITE_SECTION}`;
}

export function kbSolutionsDescription(t, count) {
  return clip(
    `Готовые решения для стройки и ремонта: шаги, числа и что проверить при приёмке, у каждого факта пункт нормы и цитата. ${solutionsCountText(t, count)}.`,
  );
}

export function kbSolutionsItems(solutions) {
  return solutions.map((s) => ({ path: kbSolutionPath(s.slug), name: s.title }));
}

export function kbSolutionsJsonLd(t, solutions) {
  const name = kbSolutionsTitle();
  return kbCollectionJsonLd(t, {
    items: kbSolutionsItems(solutions),
    name,
    description: kbSolutionsDescription(t, solutions.length),
    path: KB_SOLUTIONS_PATH,
    trail: kbSolutionsTrail(t),
  });
}

export function kbSolutionTitle(solution) {
  return `${solution.title}: как сделать по нормам — ${KB_SITE_SECTION}`;
}

/** <meta description>: the summary, then the documents it rests on. */
export function kbSolutionDescription(solution) {
  const docs = kbSolutionDocuments(solution);
  const parts = [solution.summary, docs.length ? `По документам: ${docs.join(", ")}` : null].filter(Boolean);
  return clip(parts.length ? parts.join(" ") : solution.title);
}

/**
 * JSON-LD for a card page: WebPage → Article (our retelling) citing the
 * documents it rests on, with the date it was checked against them, plus the
 * BreadcrumbList that matches the visible trail.
 */
export function kbSolutionJsonLd(solution, t) {
  const url = abs(kbSolutionPath(solution.slug));
  const cited = new Map();
  for (const fact of solution.facts) {
    const name = fact.designation ?? fact.docId;
    if (!name || cited.has(name)) continue;
    cited.set(name, {
      "@type": "CreativeWork",
      name,
      ...(fact.docSlug ? { url: abs(kbDocPath(fact.docSlug)) } : {}),
    });
  }
  const article = {
    "@type": "Article",
    "@id": `${url}#solution`,
    headline: solution.title,
    inLanguage: "ru-RU",
    url,
    publisher: { "@id": PUBLISHER["@id"] },
  };
  if (solution.summary) article.description = solution.summary;
  if (cited.size) article.citation = [...cited.values()];
  if (solution.checkedAt) article.dateModified = solution.checkedAt;

  const page = {
    "@type": "WebPage",
    "@id": url,
    url,
    name: kbSolutionTitle(solution),
    description: kbSolutionDescription(solution),
    inLanguage: "ru-RU",
    isPartOf: { "@id": WEBSITE["@id"] },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    mainEntity: { "@id": article["@id"] },
    publisher: { "@id": PUBLISHER["@id"] },
  };
  if (solution.checkedAt) page.dateModified = solution.checkedAt;
  const crumbs = { ...breadcrumbJsonLd(kbSolutionsTrail(t, solution)), "@id": `${url}#breadcrumb` };
  return { "@context": "https://schema.org", "@graph": [page, article, crumbs, WEBSITE, PUBLISHER] };
}

/** Markdown link text: a bracket or backslash in a title must not end the link. */
function mdLinkText(value) {
  return String(value).replace(/[\\[\]]/g, "\\$&");
}

/** The knowledge-base section appended to /llms.txt. */
export function kbLlmsSection(counts, t, fullTextDocs = [], solutions = []) {
  const lines = ["", `## ${KB_SITE_SECTION} — строительные нормы`, `- [Все разделы](${abs(KB_INDEX_PATH)})`];
  const solutionsItem = kbSolutionsIndexItem(solutions.length, t);
  if (solutionsItem) {
    lines.push(`- [${mdLinkText(solutionsItem.name)}](${abs(solutionsItem.path)}): ${solutionsItem.description}, ${solutionsCountText(t, solutions.length)}`);
  }
  for (const item of kbIndexItems(counts, t)) {
    lines.push(`- [${mdLinkText(item.name)}](${abs(item.path)}): ${item.description}, ${documentsCountText(t, item.count)}`);
  }
  if (fullTextDocs.length) {
    lines.push("", "### Полный текст со ссылками на пункты");
    for (const doc of fullTextDocs) lines.push(`- [${mdLinkText(displayTitle(doc))}](${abs(kbDocPath(doc.slug))})`);
  }
  if (solutions.length) {
    lines.push("", "### Решения: шаги, числа и приёмка со ссылками на пункты");
    for (const s of solutions) lines.push(`- [${mdLinkText(s.title)}](${abs(kbSolutionPath(s.slug))})`);
  }
  return lines.join("\n") + "\n";
}

// ── «Что изменилось» (slice 8, frame 5) ─────────────────────────────────────

/** Главная › База знаний › Что изменилось. */
export function kbChangesTrail(t) {
  return [
    { name: "Главная", path: "/" },
    { name: t("home.knowledgeBase.title"), path: KB_INDEX_PATH },
    { name: t("home.knowledgeBase.changes.title"), path: KB_CHANGES_PATH },
  ];
}

export function kbChangesTitle(t) {
  return `${t("home.knowledgeBase.changes.guestTitle")} — ${KB_SITE_SECTION}`;
}

export function kbChangesDescription(t) {
  return clip(
    `Новые редакции и изменения строительных норм, отменённые и заменённые документы, пересмотренные решения. ${t("home.knowledgeBase.changes.subtitle")}`,
  );
}

export function kbChangesJsonLd(t) {
  return kbCollectionJsonLd(t, {
    items: [],
    name: kbChangesTitle(t),
    description: kbChangesDescription(t),
    path: KB_CHANGES_PATH,
    trail: kbChangesTrail(t),
  });
}
