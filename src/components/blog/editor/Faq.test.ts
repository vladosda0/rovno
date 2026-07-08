// Schema + extraction tests for the FAQ block.
//
// The serialized HTML is what lands in content_html and in front of crawlers;
// the content expressions are what stop a block command from destroying a pair.
// The extraction is what the FAQPage JSON-LD is built from, so it is a contract.

import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { DOMParser as PMDOMParser, DOMSerializer, Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { setBlockType, wrapIn } from "@tiptap/pm/commands";
import { Figcaption, Figure } from "./Figure";
import { FaqAnswer, FaqItem, FaqQuestion } from "./Faq";
import { extractFaqItems, faqPageJsonLd, faqJsonLdFromDoc } from "@/lib/blog/faqConfig.mjs";

// Mirrors RichTextEditor's extension list.
const schema = getSchema([
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Figure, Figcaption, FaqItem, FaqQuestion, FaqAnswer, Image,
]);

interface JsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
}

const faqItem = (q: string, ...answers: string[]): JsonNode => ({
  type: "faqItem",
  content: [
    { type: "faqQuestion", ...(q ? { content: [{ type: "text", text: q }] } : {}) },
    {
      type: "faqAnswer",
      content: answers.length
        ? answers.map((a) => ({ type: "paragraph", content: a ? [{ type: "text", text: a }] : undefined }))
        : [{ type: "paragraph" }],
    },
  ],
});

const doc = (...content: JsonNode[]): JsonNode => ({ type: "doc", content });

function toHtml(json: JsonNode): string {
  const node = PMNode.fromJSON(schema, json);
  const frag = DOMSerializer.fromSchema(schema).serializeFragment(node.content, { document });
  const host = document.createElement("div");
  host.appendChild(frag);
  return host.innerHTML;
}

function toJson(html: string): JsonNode {
  const host = document.createElement("div");
  host.innerHTML = html;
  return PMDOMParser.fromSchema(schema).parse(host).toJSON() as JsonNode;
}

describe("FAQ serialization", () => {
  it("emits div[data-rv-faq-item] > h3[data-rv-faq-q] + div[data-rv-faq-a]", () => {
    const html = toHtml(doc(faqItem("Что такое Rovno?", "Операционная система.")));
    expect(html).toBe(
      '<div data-rv-faq-item=""><h3 data-rv-faq-q="">Что такое Rovno?</h3>' +
        '<div data-rv-faq-a=""><p>Операционная система.</p></div></div>',
    );
  });

  it("renders the question as a real h3 so the anchor pass gives it a #deep-link", () => {
    const host = document.createElement("div");
    host.innerHTML = toHtml(doc(faqItem("Вопрос?", "Ответ.")));
    expect(host.querySelector("h3")).not.toBeNull();
  });

  it("keeps multi-paragraph answers as separate paragraphs", () => {
    const html = toHtml(doc(faqItem("Q?", "Первый.", "Второй.")));
    expect((html.match(/<p>/g) ?? []).length).toBe(2);
  });

  it("round-trips through HTML", () => {
    const original = doc(faqItem("Вопрос?", "Ответ."));
    const back = toJson(toHtml(original));
    expect(back.content![0].type).toBe("faqItem");
    expect(back.content![0].content!.map((n) => n.type)).toEqual(["faqQuestion", "faqAnswer"]);
    expect(back.content![0].content![0].content![0].text).toBe("Вопрос?");
  });

  it("does not let StarterKit's heading rule steal the question on paste", () => {
    // Heading claims a bare `h3` at the default priority. If it wins, the heading
    // cannot sit inside faqItem, PM fills an EMPTY faqQuestion, and the question
    // text is silently lost.
    const back = toJson(
      '<div data-rv-faq-item=""><h3 data-rv-faq-q="">Вопрос?</h3><div data-rv-faq-a=""><p>Ответ.</p></div></div>',
    );
    const question = back.content![0].content![0];
    expect(question.type).toBe("faqQuestion");
    expect(question.content![0].text).toBe("Вопрос?");
  });

  it("still parses an ordinary h3 as a heading", () => {
    const back = toJson("<h3>Обычный подзаголовок</h3>");
    expect(back.content![0].type).toBe("heading");
    expect(back.content![0].attrs).toMatchObject({ level: 3 });
  });
});

describe("FAQ schema safety (block commands cannot destroy a pair)", () => {
  /** Caret inside the question text of a doc whose only child is a faqItem. */
  function caretIn(kind: "question" | "answer") {
    const node = PMNode.fromJSON(schema, doc(faqItem("Вопрос", "Ответ")));
    const state = EditorState.create({ doc: node, schema });
    // faqItem@0, faqQuestion@1, its text@2 ... faqAnswer, paragraph, text
    let pos = 2;
    if (kind === "answer") {
      node.descendants((n, p) => {
        if (n.type.name === "paragraph") { pos = p + 1; return false; }
        return true;
      });
    }
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
  }

  it("faqQuestion is not a doc-level textblock: setBlockType(heading) is inapplicable", () => {
    expect(setBlockType(schema.nodes.heading, { level: 2 })(caretIn("question"), undefined)).toBe(false);
  });

  it("wrapIn(blockquote) is inapplicable inside a question", () => {
    expect(wrapIn(schema.nodes.blockquote)(caretIn("question"), undefined)).toBe(false);
  });

  it("an ANSWER paragraph cannot become a heading (content is paragraph+, not block+)", () => {
    // With block+ a caret in an answer could inject an <h2> into the document
    // outline, polluting the TOC and the anchor namespace from inside an answer.
    expect(setBlockType(schema.nodes.heading, { level: 2 })(caretIn("answer"), undefined)).toBe(false);
    expect(schema.nodes.faqAnswer.spec.content).toBe("paragraph+");
  });

  it("faqItem accepts exactly a question then an answer", () => {
    const item = schema.nodes.faqItem;
    expect(item.spec.content).toBe("faqQuestion faqAnswer");
    expect(item.contentMatch.matchType(schema.nodes.heading)).toBeFalsy();
    expect(item.contentMatch.matchType(schema.nodes.paragraph)).toBeFalsy();
    expect(item.contentMatch.matchType(schema.nodes.faqQuestion)).toBeTruthy();
  });

  it("faqQuestion and faqAnswer cannot sit at the document level", () => {
    expect(schema.nodes.doc.contentMatch.matchType(schema.nodes.faqQuestion)).toBeFalsy();
    expect(schema.nodes.doc.contentMatch.matchType(schema.nodes.faqAnswer)).toBeFalsy();
  });
});

describe("extractFaqItems survives a hand-written content jsonb", () => {
  // The editor only ever writes arrays, but a Studio / service-role row can put anything
  // in `content`. A throw here is NOT contained: articleJsonLd() runs in BlogPostPage's
  // render body with no error boundary above it (the whole SPA unmounts), and
  // prerender-blog.mjs runs it at build time, so one bad row fails `npm run build` and
  // bricks the Timeweb prod deploy.
  const hostile: unknown[] = [
    { type: "doc", content: { type: "faqItem" } },                       // object, not array
    { type: "doc", content: [{ type: "faqItem", content: { a: 1 } }] },  // faqItem.content object
    { type: "doc", content: [{ type: "faqItem", content: "нет" }] },
    { type: "doc", content: [{ type: "faqItem" }] },                     // no content at all
    { type: "doc", content: [{ type: "faqItem", content: [{ type: "faqQuestion", content: [{ type: "text", text: 42 }] }] }] },
    { type: "doc", content: [null, undefined, 7, "s"] },
    null, undefined, 7, "s", true, [],
  ];

  it("never throws, and never invents an FAQ", () => {
    for (const doc of hostile) {
      expect(() => extractFaqItems(doc)).not.toThrow();
      expect(extractFaqItems(doc)).toEqual([]);
      expect(() => faqJsonLdFromDoc(doc)).not.toThrow();
      expect(faqJsonLdFromDoc(doc)).toBeNull();
    }
  });

  it("a numeric `text` does not become part of a question", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "faqItem",
        content: [
          { type: "faqQuestion", content: [{ type: "text", text: 42 }, { type: "text", text: "?" }] },
          { type: "faqAnswer", content: [{ type: "paragraph", content: [{ type: "text", text: "Да" }] }] },
        ],
      }],
    };
    expect(extractFaqItems(doc)).toEqual([{ question: "?", answer: "Да" }]);
  });
});

describe("extractFaqItems", () => {
  it("pulls pairs in document order", () => {
    const items = extractFaqItems(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Частые вопросы" }] },
        faqItem("Первый?", "Раз."),
        faqItem("Второй?", "Два."),
      ),
    );
    expect(items).toEqual([
      { question: "Первый?", answer: "Раз." },
      { question: "Второй?", answer: "Два." },
    ]);
  });

  it("joins a multi-paragraph answer with a blank line", () => {
    const [item] = extractFaqItems(doc(faqItem("Q?", "Первый.", "Второй.")));
    expect(item.answer).toBe("Первый.\n\nВторой.");
  });

  it("concatenates inline marks into the question text", () => {
    const items = extractFaqItems(
      doc({
        type: "faqItem",
        content: [
          {
            type: "faqQuestion",
            content: [
              { type: "text", text: "Чем " },
              { type: "text", text: "Rovno", marks: [{ type: "bold" }] } as JsonNode,
              { type: "text", text: " отличается?" },
            ],
          },
          { type: "faqAnswer", content: [{ type: "paragraph", content: [{ type: "text", text: "Всем." }] }] },
        ],
      }),
    );
    expect(items[0].question).toBe("Чем Rovno отличается?");
  });

  it("drops a pair with an empty question or an empty answer", () => {
    // schema.org Question requires a name and an acceptedAnswer; a blank one is
    // invalid markup on a page that declares FAQPage.
    expect(extractFaqItems(doc(faqItem("", "Ответ.")))).toEqual([]);
    expect(extractFaqItems(doc(faqItem("Вопрос?")))).toEqual([]);
  });

  it("returns [] for a document with no FAQ, and for junk input", () => {
    expect(extractFaqItems(doc({ type: "paragraph", content: [{ type: "text", text: "x" }] }))).toEqual([]);
    expect(extractFaqItems(null)).toEqual([]);
    expect(extractFaqItems(undefined)).toEqual([]);
    expect(extractFaqItems({})).toEqual([]);
  });
});

describe("faqPageJsonLd", () => {
  it("builds a valid FAQPage", () => {
    expect(faqPageJsonLd([{ question: "Q?", answer: "A." }])).toEqual({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        { "@type": "Question", name: "Q?", acceptedAnswer: { "@type": "Answer", text: "A." } },
      ],
    });
  });

  it("returns null when there is no FAQ (never emit an empty FAQPage)", () => {
    expect(faqPageJsonLd([])).toBeNull();
    expect(faqPageJsonLd(null)).toBeNull();
    expect(faqJsonLdFromDoc(doc({ type: "paragraph" }))).toBeNull();
  });
});
