// Schema-level tests for the figure node.
//
// These exercise renderHTML/parseHTML and the schema's content expression
// directly (no EditorView, no node view). That serialized HTML is exactly what
// BlogEditorPage writes to content_html and what crawlers read off the static
// snapshot, so its shape is a contract — and the content expression is what
// stops a block command from eating the image.

import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { DOMParser as PMDOMParser, DOMSerializer, Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { setBlockType, wrapIn } from "@tiptap/pm/commands";
import { Figcaption, Figure } from "./Figure";

// Mirrors RichTextEditor's extension list (order matters: Figure before Image).
const schema = getSchema([
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Figure,
  Figcaption,
  Image,
]);

const SRC = "https://x.test/dashboard.jpg";

interface JsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  text?: string;
  marks?: { type: string }[];
}

function toHtml(doc: JsonNode): string {
  const node = PMNode.fromJSON(schema, doc);
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(node.content, { document });
  const host = document.createElement("div");
  host.appendChild(fragment);
  return host.innerHTML;
}

function toJson(html: string): JsonNode {
  const host = document.createElement("div");
  host.innerHTML = html;
  return PMDOMParser.fromSchema(schema).parse(host).toJSON() as JsonNode;
}

function figureDoc(attrs: Record<string, unknown>, caption?: string): JsonNode {
  return {
    type: "doc",
    content: [
      {
        type: "figure",
        attrs,
        content: [
          {
            type: "figcaption",
            ...(caption ? { content: [{ type: "text", text: caption }] } : {}),
          },
        ],
      },
    ],
  };
}

function parseFigure(html: string): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host.querySelector("figure") as HTMLElement;
}

describe("Figure serialization", () => {
  it("emits figure > img + figcaption with the caption as content", () => {
    const html = toHtml(
      figureDoc({ src: SRC, alt: "Дашборд Ровно", width: 1600, height: 900 }, "Один экран"),
    );
    const figure = parseFigure(html);

    expect(figure.getAttribute("data-rv-figure")).toBe("");
    const img = figure.querySelector("img")!;
    expect(img.getAttribute("src")).toBe(SRC);
    expect(img.getAttribute("alt")).toBe("Дашборд Ровно");
    expect(img.getAttribute("width")).toBe("1600");
    expect(img.getAttribute("height")).toBe("900");
    expect(figure.querySelector("figcaption")!.textContent).toBe("Один экран");
    // Exactly one figcaption, not a nested pair.
    expect(figure.querySelectorAll("figcaption")).toHaveLength(1);
  });

  it("always marks article images lazy + async so they never block the LCP paint", () => {
    const img = parseFigure(toHtml(figureDoc({ src: SRC }))).querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  it("omits alt rather than declaring the image decorative with alt=''", () => {
    const img = parseFigure(
      toHtml(figureDoc({ src: SRC, alt: null, width: null, height: null })),
    ).querySelector("img")!;
    expect(img.hasAttribute("alt")).toBe(false);
    expect(img.hasAttribute("width")).toBe(false);
    expect(img.hasAttribute("height")).toBe(false);
  });

  it("omits dimensions unless BOTH are known (a lone width shifts nothing)", () => {
    const img = parseFigure(toHtml(figureDoc({ src: SRC, width: 1600 }))).querySelector("img")!;
    expect(img.hasAttribute("width")).toBe(false);
  });

  it("serializes an uncaptioned figure with an empty figcaption", () => {
    // CSS hides figcaption:empty on the public page.
    const figure = parseFigure(toHtml(figureDoc({ src: SRC })));
    expect(figure.querySelector("figcaption")!.textContent).toBe("");
  });

  it("keeps the caption's inline marks", () => {
    const html = toHtml({
      type: "doc",
      content: [
        {
          type: "figure",
          attrs: { src: SRC },
          content: [
            {
              type: "figcaption",
              content: [{ type: "text", text: "жирно", marks: [{ type: "bold" }] }],
            },
          ],
        },
      ],
    });
    expect(parseFigure(html).querySelector("figcaption strong")).not.toBeNull();
  });
});

describe("Figure parsing", () => {
  it("round-trips through HTML without losing attrs or caption", () => {
    const original = figureDoc({ src: SRC, alt: "Альт", width: 1600, height: 900 }, "Подпись");
    const back = toJson(toHtml(original));
    const figure = back.content![0];

    expect(figure.type).toBe("figure");
    expect(figure.attrs).toMatchObject({ src: SRC, alt: "Альт", width: 1600, height: 900 });
    expect(figure.content![0].type).toBe("figcaption");
    expect(figure.content![0].content![0]).toMatchObject({ type: "text", text: "Подпись" });
  });

  it("claims the whole figure, so Image cannot steal the inner <img>", () => {
    const back = toJson(
      `<figure data-rv-figure=""><img src="${SRC}" alt="А"><figcaption>П</figcaption></figure>`,
    );
    expect(back.content!.map((n) => n.type)).toEqual(["figure"]);
    // The <img> must not survive as a sibling `image` node inside the figure.
    expect(back.content![0].content!.map((n) => n.type)).toEqual(["figcaption"]);
  });

  it("does NOT throw on a figure with no figcaption (clipboard round-trip)", () => {
    // Regression: `contentElement: "figcaption"` used to hand prosemirror-model a
    // null contentDOM here and blow up with "Cannot read properties of null".
    // Reachable by copying an uncaptioned published figure (whose empty
    // figcaption is display:none, so Blink omits it) and pasting it back.
    const html = `<figure data-rv-figure=""><img src="${SRC}" alt="А"></figure>`;
    expect(() => toJson(html)).not.toThrow();
    const back = toJson(html);
    expect(back.content![0].type).toBe("figure");
    expect(back.content![0].content![0].type).toBe("figcaption");
  });

  it("drops a figure with no image rather than producing a src-less node", () => {
    const back = toJson('<figure data-rv-figure=""><figcaption>сирота</figcaption></figure>');
    expect(back.content!.some((n) => n.type === "figure")).toBe(false);
  });

  it("treats an empty src as no image (no orphan src=null figure)", () => {
    const back = toJson('<figure data-rv-figure=""><img src=""><figcaption>x</figcaption></figure>');
    expect(back.content!.some((n) => n.type === "figure")).toBe(false);
  });

  it("rejects any non-integer dimension instead of reading its numeric prefix", () => {
    // parseInt would give 1e3 -> 1, 12px -> 12, 3.7 -> 3, stamping a WRONG
    // intrinsic size and reserving the wrong box — worse than omitting it.
    for (const [w, h] of [["abc", "-5"], ["1e3", "1e3"], ["12px", "9px"], ["3.7", "2.4"], ["", "0"]]) {
      const back = toJson(
        `<figure data-rv-figure=""><img src="${SRC}" width="${w}" height="${h}"><figcaption></figcaption></figure>`,
      );
      expect(back.content![0].attrs).toMatchObject({ width: null, height: null });
    }
  });

  it("still accepts plain integer dimensions", () => {
    const back = toJson(
      `<figure data-rv-figure=""><img src="${SRC}" width="1600" height="900"><figcaption></figcaption></figure>`,
    );
    expect(back.content![0].attrs).toMatchObject({ width: 1600, height: 900 });
  });
});

describe("Figure is not a textblock (block commands cannot eat the image)", () => {
  /** Put the caret inside the caption of a doc whose only child is a figure. */
  function stateWithCaretInCaption() {
    const doc = PMNode.fromJSON(schema, figureDoc({ src: SRC, alt: "А", width: 16, height: 9 }, "подпись"));
    const state = EditorState.create({ doc, schema });
    // figure starts at 0; figcaption at 1; its text at 2.
    return state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 3)),
    );
  }

  it("setBlockType(heading) is inapplicable inside a caption", () => {
    // Regression for the bug that replaced the entire <figure> with an <h2>
    // containing only the caption text, then autosaved the loss.
    const state = stateWithCaretInCaption();
    const applied = setBlockType(schema.nodes.heading, { level: 2 })(state, undefined);
    expect(applied).toBe(false);
  });

  it("wrapIn(blockquote) is inapplicable inside a caption", () => {
    const state = stateWithCaretInCaption();
    expect(wrapIn(schema.nodes.blockquote)(state, undefined)).toBe(false);
  });

  it("figure accepts only a figcaption as its content", () => {
    expect(schema.nodes.figure.spec.content).toBe("figcaption");
    const figure = schema.nodes.figure;
    expect(figure.contentMatch.matchType(schema.nodes.heading)).toBeFalsy();
    expect(figure.contentMatch.matchType(schema.nodes.paragraph)).toBeFalsy();
    expect(figure.contentMatch.matchType(schema.nodes.figcaption)).toBeTruthy();
  });

  it("figcaption cannot sit at the document level", () => {
    // No `group`, so doc's "block+" never matches it.
    expect(schema.nodes.doc.contentMatch.matchType(schema.nodes.figcaption)).toBeFalsy();
  });
});

describe("legacy image nodes", () => {
  // Posts written before the figure node hold plain `image` nodes. Dropping the
  // Image extension would make TipTap discard them on hydrate, and the editor's
  // autosave would then write that loss back to the DB.
  it("still hydrates a legacy image node", () => {
    const html = toHtml({
      type: "doc",
      content: [{ type: "image", attrs: { src: SRC, alt: null, title: null } }],
    });
    expect(parseFigure(html)).toBeNull();
    expect(html).toContain(`<img src="${SRC}"`);
  });

  it("parses a bare <img> as an image node, not a figure", () => {
    const back = toJson(`<p>текст</p><img src="${SRC}">`);
    expect(back.content!.map((n) => n.type)).toContain("image");
    expect(back.content!.map((n) => n.type)).not.toContain("figure");
  });
});
