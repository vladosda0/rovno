// FAQPage schema.org extraction for blog articles.
//
// Reads the FAQ pairs straight out of the TipTap document JSON (`content`
// jsonb), NOT out of the rendered HTML. Scraping prose with a regex — "find the
// h2 titled Частые вопросы, then pair the h3s with the paragraphs after them" —
// couples the structured data to a heading's literal wording and silently emits
// the wrong schema the day someone renames or reorders a section. A dedicated
// faqItem node makes the extraction exact.
//
// Plain ESM so the build-time prerenderer and the live SPA share ONE
// implementation, the same way sanitizeConfig.mjs and anchorsConfig.mjs do. The
// static snapshot and the hydrated page must not disagree about what schema the
// page declares.
//
// Reality check on the payoff: Google restricted FAQ rich results to
// well-known government and health sites in August 2023, so this earns rovno.ai
// no Google snippet. It is read by Yandex, Bing and the LLM answer engines that
// already fetch /llms.txt — which is exactly the traffic this blog is aimed at.

/**
 * A node's children, or none.
 *
 * `content` is whatever sits in the `content` jsonb column. The editor only ever writes
 * an array, but a hand-written or service-role row can put an object there, and `.map`
 * or a destructure on that throws. The throw is NOT contained: articleJsonLd() runs in
 * BlogPostPage's render body with no error boundary above it (the SPA unmounts), and
 * prerender-blog.mjs runs it at build time, so one bad row fails `npm run build` and
 * bricks the Timeweb prod deploy. Likewise `text` is coerced: a numeric `text` would
 * survive the join and blow up on the caller's `.trim()`.
 */
function children(node) {
  return Array.isArray(node?.content) ? node.content : [];
}

/** Concatenate the inline content of a node into plain text. */
function inlineText(node) {
  if (!node) return "";
  if (node.type === "text") return typeof node.text === "string" ? node.text : "";
  if (node.type === "hardBreak") return "\n";
  return children(node).map(inlineText).join("");
}

/** An answer is one or more paragraphs; keep the paragraph boundaries. */
function answerText(node) {
  if (!node) return "";
  return children(node)
    .map((block) => inlineText(block).trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Pull every FAQ pair out of a TipTap document, in document order.
 *
 * A pair with an empty question or an empty answer is dropped: schema.org
 * Question requires a name and an acceptedAnswer, and emitting a blank one is
 * worse than emitting nothing (invalid markup on a page that declares FAQPage).
 *
 * @param {unknown} doc TipTap document JSON (blog_posts.content).
 * @returns {Array<{question: string, answer: string}>}
 */
export function extractFaqItems(doc) {
  const items = [];

  function walk(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "faqItem") {
      const [question, answer] = children(node);
      const q = inlineText(question).trim();
      const a = answerText(answer).trim();
      if (q && a) items.push({ question: q, answer: a });
      return; // faqItems never nest
    }
    for (const child of children(node)) walk(child);
  }

  walk(doc);
  return items;
}

/** schema.org FAQPage, or null when the article has no FAQ. */
export function faqPageJsonLd(items) {
  if (!items || items.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** Convenience: doc -> FAQPage or null. */
export function faqJsonLdFromDoc(doc) {
  return faqPageJsonLd(extractFaqItems(doc));
}
