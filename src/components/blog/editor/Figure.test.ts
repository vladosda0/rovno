// Schema-level tests for the figure node.
//
// These exercise renderHTML/parseHTML directly (no EditorView, no node view):
// that serialized HTML is exactly what BlogEditorPage writes to content_html
// and what crawlers read off the static snapshot, so its shape is a contract.

import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { DOMParser as PMDOMParser, DOMSerializer, Node as PMNode } from "@tiptap/pm/model";
import { Figure } from "./Figure";

// Mirrors RichTextEditor's extension list (order matters: Figure before Image).
const schema = getSchema([
  StarterKit.configure({ heading: { levels: [2, 3] } }),
  Figure,
  Image,
]);

const SRC = "https://x.test/dashboard.jpg";

interface JsonNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
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
        ...(caption ? { content: [{ type: "text", text: caption } as JsonNode] } : {}),
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
  });

  it("always marks article images lazy + async so they never block the LCP paint", () => {
    const img = parseFigure(toHtml(figureDoc({ src: SRC }))).querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
  });

  it("omits alt and dimensions rather than emitting empty ones", () => {
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
          content: [{ type: "text", text: "жирно", marks: [{ type: "bold" }] } as JsonNode],
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
    expect(figure.content![0]).toMatchObject({ type: "text", text: "Подпись" });
  });

  it("claims the whole figure, so Image cannot steal the inner <img>", () => {
    const back = toJson(
      `<figure data-rv-figure=""><img src="${SRC}" alt="А"><figcaption>П</figcaption></figure>`,
    );
    expect(back.content!.map((n) => n.type)).toEqual(["figure"]);
  });

  it("drops a figure with no image rather than producing a src-less node", () => {
    const back = toJson('<figure data-rv-figure=""><figcaption>сирота</figcaption></figure>');
    expect(back.content!.some((n) => n.type === "figure")).toBe(false);
  });

  it("coerces junk dimensions to null instead of emitting width='abc'", () => {
    const back = toJson(
      `<figure data-rv-figure=""><img src="${SRC}" width="abc" height="-5"><figcaption></figcaption></figure>`,
    );
    expect(back.content![0].attrs).toMatchObject({ width: null, height: null });
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
