// Proves the input-rule guard actually stops the corruption.
//
// `isolating: true` guards selections and block COMMANDS. It does NOT guard
// `tr.replaceRangeWith`, which is what `nodeInputRule` calls — so typing `---`
// inside a figure caption or an FAQ answer used to tear the node in half, and
// BlogEditorPage autosaved the wreckage into `content` jsonb.
//
// Driven through a real Editor with the exact RichTextEditor extension list,
// because the bug lives in the input-rule plugin, not in the schema.

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Figcaption, Figure } from "./Figure";
import { FaqAnswer, FaqItem, FaqQuestion } from "./Faq";
import { IsolatedInputRules } from "./isolatedInputRules";

const extensions = [
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Figure, Figcaption, FaqItem, FaqQuestion, FaqAnswer, IsolatedInputRules, Image,
];

interface JsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
}

const SRC = "https://x.test/a.jpg";

function makeEditor(doc: JsonNode) {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({ element, extensions, content: doc });
}

/** Type `text` one character at a time at `pos`, exactly as a human would.
 *  `handleTextInput` is the prop the input-rule plugin hooks; going through it is
 *  the only way to exercise the rules rather than just inserting text. */
function typeAt(editor: Editor, pos: number, text: string) {
  editor.commands.focus(pos);
  for (const char of text) {
    const { from, to } = editor.state.selection;
    const fallback = () => editor.state.tr.insertText(char, from, to);
    const handled = editor.view.someProp("handleTextInput", (fn) =>
      fn(editor.view, from, to, char, fallback),
    );
    if (!handled) editor.view.dispatch(fallback());
  }
}

type Hit = { node: import("@tiptap/pm/model").Node; pos: number };

/** An array, not a `let`: TS narrows a closure-assigned `let` back to `null`. */
function firstNode(editor: Editor, name: string): Hit {
  const hits: Hit[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (hits.length > 0) return false;
    if (node.type.name === name) hits.push({ node, pos });
    return true;
  });
  if (hits.length === 0) throw new Error(`no ${name} node in the document`);
  return hits[0];
}

const faqDoc = (): JsonNode => ({
  type: "doc",
  content: [{
    type: "faqItem",
    content: [
      { type: "faqQuestion", content: [{ type: "text", text: "Вопрос" }] },
      { type: "faqAnswer", content: [{ type: "paragraph", content: [{ type: "text", text: "Ответ" }] }] },
    ],
  }],
});

const figureDoc = (): JsonNode => ({
  type: "doc",
  content: [{
    type: "figure",
    attrs: { src: SRC, alt: "А", width: 16, height: 9 },
    content: [{ type: "figcaption", content: [{ type: "text", text: "Подпись" }] }],
  }],
});

function countType(editor: Editor, name: string) {
  let n = 0;
  editor.state.doc.descendants((node) => { if (node.type.name === name) n += 1; });
  return n;
}

describe("horizontal-rule input rule cannot tear an FAQ pair apart", () => {
  for (const typed of ["---", "*** ", "___ "]) {
    it(`typing ${JSON.stringify(typed)} at the start of the QUESTION leaves the pair intact`, () => {
      const editor = makeEditor(faqDoc());
      const q = firstNode(editor, "faqQuestion");
      typeAt(editor, q.pos + 1, typed);

      expect(() => editor.state.doc.check()).not.toThrow();
      expect(countType(editor, "faqItem")).toBe(1);
      expect(countType(editor, "horizontalRule")).toBe(0);
      const item = firstNode(editor, "faqItem").node;
      expect([item.child(0).type.name, item.child(1).type.name]).toEqual(["faqQuestion", "faqAnswer"]);
      editor.destroy();
    });

    it(`typing ${JSON.stringify(typed)} at the start of the ANSWER leaves the pair intact`, () => {
      const editor = makeEditor(faqDoc());
      const a = firstNode(editor, "faqAnswer");
      typeAt(editor, a.pos + 2, typed); // inside the answer's first paragraph

      expect(() => editor.state.doc.check()).not.toThrow();
      expect(countType(editor, "faqItem")).toBe(1);
      expect(countType(editor, "horizontalRule")).toBe(0);
      editor.destroy();
    });
  }

  it("keeps the typed characters as literal text rather than eating them", () => {
    const editor = makeEditor(faqDoc());
    const q = firstNode(editor, "faqQuestion");
    typeAt(editor, q.pos + 1, "---");
    expect(firstNode(editor, "faqQuestion").node.textContent).toBe("---Вопрос");
    editor.destroy();
  });
});

describe("horizontal-rule input rule cannot tear a figure apart", () => {
  it("typing --- in a caption leaves the figure and its image intact", () => {
    // Same escape, in the node that already shipped.
    const editor = makeEditor(figureDoc());
    const caption = firstNode(editor, "figcaption");
    typeAt(editor, caption.pos + 1, "---");

    expect(() => editor.state.doc.check()).not.toThrow();
    expect(countType(editor, "figure")).toBe(1);
    expect(countType(editor, "horizontalRule")).toBe(0);
    expect(firstNode(editor, "figure").node.attrs.src).toBe(SRC);
    editor.destroy();
  });
});

describe("the guard does not break ordinary prose", () => {
  it("--- still becomes a divider in a normal paragraph", () => {
    const editor = makeEditor({ type: "doc", content: [{ type: "paragraph" }] });
    typeAt(editor, 1, "---");
    expect(countType(editor, "horizontalRule")).toBe(1);
    editor.destroy();
  });

  it("the markdown image rule still works in a normal paragraph", () => {
    const editor = makeEditor({ type: "doc", content: [{ type: "paragraph" }] });
    typeAt(editor, 1, `![alt](${SRC})`);
    expect(countType(editor, "image")).toBe(1);
    editor.destroy();
  });

  it("the markdown image rule cannot inject an image into a caption", () => {
    const editor = makeEditor(figureDoc());
    const caption = firstNode(editor, "figcaption");
    typeAt(editor, caption.pos + 1, `![alt](${SRC})`);
    expect(() => editor.state.doc.check()).not.toThrow();
    expect(countType(editor, "figure")).toBe(1);
    expect(countType(editor, "image")).toBe(0);
    editor.destroy();
  });
});
