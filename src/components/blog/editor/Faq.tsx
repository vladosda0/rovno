// FAQ block: a question + its answer, as first-class nodes.
//
// Why nodes rather than "an <h3> followed by a <p>, by convention": the FAQPage
// JSON-LD is generated from these nodes (see faqConfig.mjs). Convention-based
// extraction has to guess where an answer stops and the next section begins, and
// it silently emits wrong structured data the moment prose is reordered.
//
// SCHEMA SHAPE — the two lessons from Figure:
//   faqItem   content:"faqQuestion faqAnswer"  — the question is nested, so it is
//             not a doc-level textblock and setBlockType/wrapIn cannot replace
//             the whole item with a heading.
//   faqAnswer content:"paragraph+"  — NOT "block+". With block+ a caret in an
//             answer could run toggleHeading and inject an <h2> into the document
//             outline, polluting the table of contents and the anchor namespace
//             from inside an answer.
//
// The question renders as a real <h3>, so the shared anchor pass gives every
// question a #deep-link while the TOC (h2-only) stays uncluttered.

import { Node } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    faq: {
      /** Insert an empty question/answer pair at the current selection. */
      setFaqItem: () => ReturnType;
    };
  }
}

/** A fresh empty FAQ pair. A factory, not a shared literal: insertContent may
 *  mutate what it is handed, and two inserts must never alias one object. */
function emptyFaqItem() {
  return {
    type: "faqItem",
    content: [
      { type: "faqQuestion" },
      { type: "faqAnswer", content: [{ type: "paragraph" }] },
    ],
  };
}

export const FaqQuestion = Node.create({
  name: "faqQuestion",
  content: "inline*",
  // Backspace at the start must not lift the question text out of the item.
  isolating: true,
  // No `group`: doc's "block+" can never match it, so a stray pasted question
  // cannot become a top-level node (nor be findWrapping'd into a fresh faqItem,
  // the way an orphan <figcaption> once was).

  parseHTML() {
    return [
      {
        tag: "h3[data-rv-faq-q]",
        // StarterKit's Heading claims a bare `h3` at the default priority. Without
        // this, that rule wins, the heading cannot be placed inside faqItem
        // (content is "faqQuestion faqAnswer"), ProseMirror fills an EMPTY
        // faqQuestion instead, and the question text is silently lost on paste.
        priority: 100,
      },
    ];
  },
  renderHTML() {
    return ["h3", { "data-rv-faq-q": "" }, 0];
  },
});

export const FaqAnswer = Node.create({
  name: "faqAnswer",
  content: "paragraph+",
  isolating: true,
  parseHTML() {
    return [{ tag: "div[data-rv-faq-a]" }];
  },
  renderHTML() {
    return ["div", { "data-rv-faq-a": "" }, 0];
  },
});

export const FaqItem = Node.create({
  name: "faqItem",
  group: "block",
  content: "faqQuestion faqAnswer",
  // Keep the pair atomic when dragged or when a selection spans it.
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: "div[data-rv-faq-item]" }];
  },

  renderHTML() {
    return ["div", { "data-rv-faq-item": "" }, 0];
  },

  addCommands() {
    return {
      setFaqItem:
        () =>
        ({ commands }) =>
          commands.insertContent(emptyFaqItem()),
    };
  },
});
