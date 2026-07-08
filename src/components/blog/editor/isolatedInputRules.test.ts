// Proves the input-rule guard actually stops the corruption.
//
// `isolating: true` guards selections and block COMMANDS. It does NOT guard
// `tr.replaceRangeWith`, which is what `nodeInputRule` calls — so typing `---`
// inside a figure caption or an FAQ answer used to tear the node in half, and
// BlogEditorPage autosaved the wreckage into `content` jsonb.
//
// Driven through a real Editor with the exact RichTextEditor extension list,
// because the bug lives in the input-rule plugin, not in the schema.

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { Figcaption, Figure } from "./Figure";
import { FaqAnswer, FaqItem, FaqQuestion } from "./Faq";
import { TextSelection } from "@tiptap/pm/state";
import {
  boundedSelectionBetween,
  insertBlockNodesHoisted,
  HORIZONTAL_RULE_FIND_FOR_TEST,
  IsolatedInputRules,
  isInsideIsolatedNode,
  isolatedEditorProps,
  positionAfterIsolatedContainer,
} from "./isolatedInputRules";

// Youtube is in the real list, and it registers a nodePasteRule — the third caller of
// tr.replaceWith, and the one the input-rule guard does not shadow.
const extensions = [
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Figure, Figcaption, FaqItem, FaqQuestion, FaqAnswer, IsolatedInputRules, Image,
  Youtube.configure({ nocookie: true, width: 0, height: 0, HTMLAttributes: {} }),
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

/** An author clicks into a fresh FAQ answer and pastes. The paste rule needs the URL to
 *  be the whole textblock (its regex is `^…$`), which an empty answer supplies. */
const emptyAnswerFaqDoc = (): JsonNode => ({
  type: "doc",
  content: [{
    type: "faqItem",
    content: [
      { type: "faqQuestion", content: [{ type: "text", text: "Вопрос" }] },
      { type: "faqAnswer", content: [{ type: "paragraph" }] },
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

// An input rule was one of THREE callers of tr.replaceWith. These cover the other two.

describe("isInsideIsolatedNode / positionAfterIsolatedContainer", () => {
  it("recognises the three guarded nodes and nothing else", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        faqDoc().content![0],
        figureDoc().content![0],
        { type: "paragraph", content: [{ type: "text", text: "проза" }] },
        { type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "цитата" }] }] },
      ],
    });
    const inside = (name: string, offset: number) =>
      isInsideIsolatedNode(editor.state.doc.resolve(firstNode(editor, name).pos + offset));

    expect(inside("faqQuestion", 1)).toBe(true);
    expect(inside("faqAnswer", 2)).toBe(true); // inside its paragraph
    expect(inside("figcaption", 1)).toBe(true);
    expect(inside("blockquote", 2)).toBe(false);
    editor.destroy();
  });

  it("hoists to just after the enclosing figure / faqItem, and to null in prose", () => {
    const editor = makeEditor(figureDoc());
    const caption = firstNode(editor, "figcaption");
    const figure = firstNode(editor, "figure");
    const after = positionAfterIsolatedContainer(editor.state.doc.resolve(caption.pos + 1));
    expect(after).toBe(figure.pos + figure.node.nodeSize);
    editor.destroy();

    const prose = makeEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] });
    expect(positionAfterIsolatedContainer(prose.state.doc.resolve(1))).toBe(null);
    prose.destroy();
  });
});

describe("inserting a block at a caret inside a guarded node (uploadAndInsert)", () => {
  const newFigure = { type: "figure", attrs: { src: "https://x.test/b.jpg", alt: null, width: 4, height: 3 }, content: [{ type: "figcaption" }] };

  it("UNHOISTED, it tears the figure in half — this is the bug", () => {
    // Reproduces what `insertContentAt(caretPos, figure)` did. `isolating: true` does not
    // stop tr.replaceWith, and the resulting doc is VALID, so autosave persisted it.
    const editor = makeEditor(figureDoc());
    const caret = firstNode(editor, "figcaption").pos + 4; // mid-caption: "Под|пись"
    editor.chain().insertContentAt(caret, newFigure).run();

    expect(() => editor.state.doc.check()).not.toThrow(); // valid, and wrong
    expect(countType(editor, "figure")).toBe(3); // original DUPLICATED + the new one
    editor.destroy();
  });

  it("HOISTED, the figure lands after the container and the caption survives whole", () => {
    const editor = makeEditor(figureDoc());
    const caret = firstNode(editor, "figcaption").pos + 4;
    const target = positionAfterIsolatedContainer(editor.state.doc.resolve(caret))!;
    editor.chain().insertContentAt(target, newFigure).run();

    expect(() => editor.state.doc.check()).not.toThrow();
    expect(countType(editor, "figure")).toBe(2); // the original, plus the new one
    const original = firstNode(editor, "figure").node;
    expect(original.attrs.src).toBe(SRC);
    expect(original.textContent).toBe("Подпись");
    editor.destroy();
  });

  it("HOISTED out of an FAQ answer, the pair stays intact", () => {
    const editor = makeEditor(faqDoc());
    const caret = firstNode(editor, "faqAnswer").pos + 3;
    const target = positionAfterIsolatedContainer(editor.state.doc.resolve(caret))!;
    editor.chain().insertContentAt(target, newFigure).run();

    expect(() => editor.state.doc.check()).not.toThrow();
    expect(countType(editor, "faqItem")).toBe(1);
    const item = firstNode(editor, "faqItem").node;
    expect([item.child(0).textContent, item.child(1).textContent]).toEqual(["Вопрос", "Ответ"]);
    editor.destroy();
  });
});

describe("@tiptap/extension-youtube's nodePasteRule reaches the same tr.replaceWith", () => {
  const URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  /** Exactly the meta prosemirror-view's doPaste sets; pasteRulesPlugin keys off it. */
  function pasteAt(editor: Editor, pos: number, text: string) {
    editor.view.dispatch(editor.state.tr.insertText(text, pos).setMeta("uiEvent", "paste"));
  }

  it("pasting a YouTube URL into an empty FAQ answer guts the pair — the hazard is real", () => {
    const editor = makeEditor(emptyAnswerFaqDoc());
    pasteAt(editor, firstNode(editor, "faqAnswer").pos + 2, URL);

    // The resulting doc is VALID, so autosave writes it straight to `content` jsonb.
    expect(() => editor.state.doc.check()).not.toThrow();
    // The video escaped the isolating node entirely and landed at DOC level, outside the
    // faqItem — a video that answers nothing, under a question with no answer.
    expect(countType(editor, "youtube")).toBe(1);
    const topLevel = editor.state.doc.children.map((n) => n.type.name);
    expect(topLevel).toContain("youtube");
    expect(topLevel.indexOf("youtube")).toBeGreaterThan(topLevel.indexOf("faqItem"));
    // ...leaving the answer EMPTY. extractFaqItems requires `question && answer`, so the
    // article still SHOWS the question while emitting no FAQPage entry for it. That is
    // the silent half of this bug: nothing looks broken until Search Console does.
    expect(firstNode(editor, "faqAnswer").node.textContent).toBe("");
    editor.destroy();
  });

  it("RichTextEditor's remedy — handle the paste as plain text — leaves the pair intact", () => {
    // handlePaste returns true BEFORE prosemirror-view dispatches `uiEvent: "paste"`,
    // so no paste rule ever runs. Modelled here by inserting the text without that meta.
    const editor = makeEditor(emptyAnswerFaqDoc());
    const pos = firstNode(editor, "faqAnswer").pos + 2;
    editor.view.dispatch(editor.state.tr.insertText(URL, pos));

    expect(() => editor.state.doc.check()).not.toThrow();
    expect(countType(editor, "youtube")).toBe(0);
    expect(countType(editor, "faqItem")).toBe(1);
    expect(firstNode(editor, "faqAnswer").node.textContent).toBe(URL);
    editor.destroy();
  });
});

describe("the copied horizontal-rule regex has not drifted from the package", () => {
  it("matches exactly what @tiptap/extension-horizontal-rule matches", async () => {
    // extension-image EXPORTS its inputRegex, so isolatedInputRules imports it and cannot
    // drift. horizontal-rule exports nothing, so its regex is hand-copied — pin it here.
    // A package update that widens the rule would otherwise silently reopen the tear.
    const source = await readFile(
      "node_modules/@tiptap/extension-horizontal-rule/dist/index.js",
      "utf8",
    );
    const found = /find:\s*(\/\^.*?\/)[,\s]/.exec(source)?.[1];
    expect(found).toBe(String(HORIZONTAL_RULE_FIND_FOR_TEST));
  });
});

// ---------------------------------------------------------------------------
// The FOURTH door: a selection that starts outside a guarded node and ends inside it.
// Not a caller of tr.replaceWith at all — but every edit goes through the selection.
// ---------------------------------------------------------------------------

/** A doc with prose BEFORE a figure, so a selection can start outside and end inside. */
const proseThenFigureDoc = (): JsonNode => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "проза" }] },
    {
      type: "figure",
      attrs: { src: SRC, alt: "А", width: 16, height: 9 },
      content: [{ type: "figcaption", content: [{ type: "text", text: "Подпись" }] }],
    },
  ],
});

const proseThenFaqDoc = (): JsonNode => ({
  type: "doc",
  content: [
    { type: "paragraph", content: [{ type: "text", text: "проза" }] },
    faqDoc().content![0],
  ],
});

/** Exactly what prosemirror-view builds from a shift-click or a drag. */
function crossingSelection(editor: Editor, anchorPos: number, headPos: number) {
  const { doc } = editor.state;
  return TextSelection.between(doc.resolve(anchorPos), doc.resolve(headPos));
}

/** Install the selection guard as prosemirror-view does: through `createSelectionBetween`. */
function guarded(editor: Editor, anchorPos: number, headPos: number) {
  const { doc } = editor.state;
  const $a = doc.resolve(anchorPos);
  const $h = doc.resolve(headPos);
  return boundedSelectionBetween(doc, $a, $h) ?? TextSelection.between($a, $h);
}

describe("a selection crossing an isolating boundary destroys the container", () => {
  it("UNGUARDED, deleting such a selection removes the whole figure — this is the bug", () => {
    const editor = makeEditor(proseThenFigureDoc());
    const caption = firstNode(editor, "figcaption");
    const sel = crossingSelection(editor, 3, caption.pos + 4); // "про|за" .. "Под|пись"
    editor.view.dispatch(editor.state.tr.setSelection(sel).deleteSelection());

    expect(() => editor.state.doc.check()).not.toThrow(); // valid, and the image is gone
    expect(countType(editor, "figure")).toBe(0);
    editor.destroy();
  });

  it("UNGUARDED, typing over such a selection removes the whole figure", () => {
    const editor = makeEditor(proseThenFigureDoc());
    const caption = firstNode(editor, "figcaption");
    const sel = crossingSelection(editor, 3, caption.pos + 4);
    editor.view.dispatch(editor.state.tr.setSelection(sel).insertText("x"));

    expect(() => editor.state.doc.check()).not.toThrow();
    expect(countType(editor, "figure")).toBe(0);
    editor.destroy();
  });

  it("UNGUARDED, it empties the FAQ question, so the FAQPage silently disappears", () => {
    const editor = makeEditor(proseThenFaqDoc());
    const q = firstNode(editor, "faqQuestion");
    const sel = crossingSelection(editor, 3, q.pos + 4);
    editor.view.dispatch(editor.state.tr.setSelection(sel).insertText("x"));

    expect(() => editor.state.doc.check()).not.toThrow();
    // The pair survives structurally; extractFaqItems' `question && answer` gate drops it.
    expect(firstNode(editor, "faqQuestion").node.textContent).toBe("");
    editor.destroy();
  });
});

describe("boundedSelectionBetween makes that selection unrepresentable", () => {
  it("clamps a prose -> caption selection to stop before the figure", () => {
    const editor = makeEditor(proseThenFigureDoc());
    const figure = firstNode(editor, "figure");
    const caption = firstNode(editor, "figcaption");
    const sel = guarded(editor, 3, caption.pos + 4);

    expect(sel.to).toBeLessThanOrEqual(figure.pos);
    editor.view.dispatch(editor.state.tr.setSelection(sel).deleteSelection());
    expect(countType(editor, "figure")).toBe(1);
    expect(firstNode(editor, "figure").node.attrs.src).toBe(SRC);
    expect(firstNode(editor, "figcaption").node.textContent).toBe("Подпись");
    editor.destroy();
  });

  it("clamps a caption -> prose selection to stay inside the figure", () => {
    const editor = makeEditor(proseThenFigureDoc());
    const figure = firstNode(editor, "figure");
    const caption = firstNode(editor, "figcaption");
    const sel = guarded(editor, caption.pos + 4, 3); // anchor inside, head backwards into prose

    expect(sel.from).toBeGreaterThanOrEqual(figure.pos);
    editor.view.dispatch(editor.state.tr.setSelection(sel).deleteSelection());
    expect(countType(editor, "figure")).toBe(1);
    expect(editor.state.doc.firstChild!.textContent).toBe("проза");
    editor.destroy();
  });

  it("typing and Backspace over the clamped range leave the figure whole", () => {
    for (const edit of ["type", "delete"] as const) {
      const editor = makeEditor(proseThenFigureDoc());
      const caption = firstNode(editor, "figcaption");
      const sel = guarded(editor, 3, caption.pos + 4);
      const tr = editor.state.tr.setSelection(sel);
      editor.view.dispatch(edit === "type" ? tr.insertText("x") : tr.deleteSelection());
      expect(countType(editor, "figure")).toBe(1);
      expect(() => editor.state.doc.check()).not.toThrow();
      editor.destroy();
    }
  });

  it("leaves ordinary selections alone (both outside, or both in the same container)", () => {
    const editor = makeEditor(proseThenFigureDoc());
    const caption = firstNode(editor, "figcaption");
    const { doc } = editor.state;
    expect(boundedSelectionBetween(doc, doc.resolve(1), doc.resolve(5))).toBeNull();
    expect(boundedSelectionBetween(doc, doc.resolve(caption.pos + 1), doc.resolve(caption.pos + 5))).toBeNull();
    editor.destroy();
  });
});

// ---------------------------------------------------------------------------
// The CALL SITES, not the helpers. Deleting every guard used to leave the suite green.
// ---------------------------------------------------------------------------

/** A ClipboardEvent good enough for handlePaste; jsdom's has no writable clipboardData. */
function fakePaste(text: string) {
  let prevented = false;
  return {
    event: {
      preventDefault() { prevented = true; },
      clipboardData: { files: [], getData: (t: string) => (t === "text/plain" ? text : "") },
    } as unknown as ClipboardEvent,
    wasPrevented: () => prevented,
  };
}

describe("isolatedEditorProps.handlePaste — the real call site", () => {
  const YT = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  it("inside an FAQ answer it handles the paste itself, so no paste rule can run", () => {
    const editor = makeEditor(emptyAnswerFaqDoc());
    editor.commands.focus(firstNode(editor, "faqAnswer").pos + 2);
    const { event, wasPrevented } = fakePaste(YT);

    expect(isolatedEditorProps.handlePaste(editor.view, event)).toBe(true);
    expect(wasPrevented()).toBe(true);
    expect(countType(editor, "youtube")).toBe(0);
    expect(countType(editor, "faqItem")).toBe(1);
    expect(firstNode(editor, "faqAnswer").node.textContent).toBe(YT);
    editor.destroy();
  });

  it("inside a caption it inserts text and collapses newlines", () => {
    const editor = makeEditor(figureDoc());
    editor.commands.focus(firstNode(editor, "figcaption").pos + 1);
    const { event } = fakePaste("две\nстроки");

    expect(isolatedEditorProps.handlePaste(editor.view, event)).toBe(true);
    expect(firstNode(editor, "figcaption").node.textContent).toBe("две строкиПодпись");
    expect(countType(editor, "figure")).toBe(1);
    editor.destroy();
  });

  it("in ordinary prose it declines, so ProseMirror and extension-link still run", () => {
    const editor = makeEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] });
    editor.commands.focus(1);
    const { event, wasPrevented } = fakePaste(YT);

    expect(isolatedEditorProps.handlePaste(editor.view, event)).toBe(false);
    expect(wasPrevented()).toBe(false);
    editor.destroy();
  });

  it("an empty clipboard over a selection deletes it, as a native paste does", () => {
    const editor = makeEditor(figureDoc());
    const caption = firstNode(editor, "figcaption");
    editor.commands.setTextSelection({ from: caption.pos + 1, to: caption.pos + 4 });
    const { event } = fakePaste("");

    expect(isolatedEditorProps.handlePaste(editor.view, event)).toBe(true);
    expect(firstNode(editor, "figcaption").node.textContent).toBe("пись");
    editor.destroy();
  });
});

describe("insertBlockNodesHoisted — the uploadAndInsert call site", () => {
  const newFig = { type: "figure", attrs: { src: "https://x.test/b.jpg", alt: null, width: 4, height: 3 }, content: [{ type: "figcaption" }] };

  it("a figure dropped into a caption lands AFTER the figure, which survives whole", () => {
    const editor = makeEditor(figureDoc());
    insertBlockNodesHoisted(editor, [newFig], firstNode(editor, "figcaption").pos + 4);

    expect(() => editor.state.doc.check()).not.toThrow();
    expect(countType(editor, "figure")).toBe(2); // original + new, NOT the torn 3
    const original = firstNode(editor, "figure").node;
    expect(original.attrs.src).toBe(SRC);
    expect(original.textContent).toBe("Подпись");
    editor.destroy();
  });

  it("a figure dropped into an FAQ answer lands after the pair, which stays intact", () => {
    const editor = makeEditor(faqDoc());
    insertBlockNodesHoisted(editor, [newFig], firstNode(editor, "faqAnswer").pos + 3);

    expect(() => editor.state.doc.check()).not.toThrow();
    expect(countType(editor, "faqItem")).toBe(1);
    const item = firstNode(editor, "faqItem").node;
    expect([item.child(0).textContent, item.child(1).textContent]).toEqual(["Вопрос", "Ответ"]);
    editor.destroy();
  });

  it("in ordinary prose it inserts exactly where asked, and clamps a stale position", () => {
    const editor = makeEditor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "проза" }] }] });
    insertBlockNodesHoisted(editor, [newFig], 9_999); // the doc shrank while the upload awaited
    expect(() => editor.state.doc.check()).not.toThrow();
    expect(countType(editor, "figure")).toBe(1);
    editor.destroy();
  });
});

describe("boundedSelectionBetween: exhaustive sweep and normal-editing sanity", () => {
  const CONTAINERS = ["figure", "faqItem"];
  const keyOf = ($pos: import("@tiptap/pm/model").ResolvedPos) => {
    for (let d = $pos.depth; d > 0; d -= 1) if (CONTAINERS.includes($pos.node(d).type.name)) return $pos.before(d);
    return -1;
  };
  const fig = (cap: string) => ({ type: "figure", attrs: { src: SRC, alt: "А", width: 4, height: 3 },
    content: [{ type: "figcaption", content: cap ? [{ type: "text", text: cap }] : [] }] });
  const para = (t: string) => ({ type: "paragraph", content: [{ type: "text", text: t }] });

  const DOCS: [string, JsonNode[]][] = [
    ["figure FIRST", [fig("Подпись"), para("после")]],
    ["figure LAST", [para("до"), fig("Подпись")]],
    ["adjacent figures", [fig("А"), fig("Б")]],
    ["figure only", [fig("Подпись")]],
    ["empty caption", [para("до"), fig(""), para("после")]],
    ["faq between prose", [para("до"), faqDoc().content![0], para("после")]],
    ["adjacent faq + figure", [faqDoc().content![0], fig("Подпись")]],
    ["prose figure prose faq prose", [para("до"), fig("П"), para("между"), faqDoc().content![0], para("после")]],
  ] as [string, JsonNode[]][];

  for (const [label, content] of DOCS) {
    it(`${label}: no (anchor, head) pair yields a boundary-crossing selection`, () => {
      // Exhaustive, because the interesting cases are the ones nobody thinks to write down.
      // A doc-level endpoint (pos 0, just before a leading <figure>) arrives with both keys
      // -1, and `TextSelection.between` then resolves the anchor INSIDE the caption — so an
      // input-only guard waved it through. This sweep is what found that.
      const editor = makeEditor({ type: "doc", content });
      const { doc } = editor.state;
      const bad: string[] = [];
      for (let a = 0; a <= doc.content.size; a += 1) {
        for (let h = 0; h <= doc.content.size; h += 1) {
          const $a = doc.resolve(a), $h = doc.resolve(h);
          const sel = boundedSelectionBetween(doc, $a, $h) ?? TextSelection.between($a, $h);
          if (keyOf(sel.$from) !== keyOf(sel.$to)) bad.push(`${a}->${h} => ${sel.from}..${sel.to}`);
        }
      }
      expect(bad).toEqual([]);
      editor.destroy();
    });
  }

  it("still lets a selection SPAN a figure — prose -> figure -> prose is normal editing", () => {
    const editor = makeEditor({ type: "doc", content: [para("до"), fig("П"), para("после")] as JsonNode[] });
    const { doc } = editor.state;
    const figure = firstNode(editor, "figure");
    const last = doc.child(2);
    const anchor = 1;                        // inside "до"
    const head = doc.content.size - 1;       // inside "после"
    expect(boundedSelectionBetween(doc, doc.resolve(anchor), doc.resolve(head))).toBeNull();

    // ...and deleting it really does remove the figure, which is what the author asked for.
    editor.view.dispatch(editor.state.tr
      .setSelection(TextSelection.between(doc.resolve(anchor), doc.resolve(head)))
      .deleteSelection());
    expect(countType(editor, "figure")).toBe(0);
    expect(() => editor.state.doc.check()).not.toThrow();
    void figure; void last;
    editor.destroy();
  });

  it("Ctrl+A (AllSelection) is untouched: it never consults createSelectionBetween", () => {
    const editor = makeEditor({ type: "doc", content: [para("до"), fig("П")] as JsonNode[] });
    editor.commands.selectAll();
    editor.commands.deleteSelection();
    expect(countType(editor, "figure")).toBe(0);
    expect(() => editor.state.doc.check()).not.toThrow();
    editor.destroy();
  });
});
