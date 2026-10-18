// @vitest-environment jsdom
//
// The seam between Shurik's door and this editor (CONTRACT-H4 §3.5, §10.2).
//
// rovno-db's blog-shurik-door turns Shurik's article blocks into a TipTap
// document (blog_posts.content) and its HTML (blog_posts.content_html) WITHOUT
// running TipTap: it is a Deno function with no DOM. Two things must hold for
// such a post to behave like one written here:
//
//   1. /blog/admin can open it. The editor runs with enableContentCheck, so a
//      node or attribute this schema does not know freezes the autosave.
//   2. content_html is what this editor's getHTML() would write for that
//      document, byte for byte. Otherwise the first keystroke in the admin
//      silently rewrites the published HTML, and the hash the door showed in
//      the review card stops matching what readers get.
//
// The fixture is the door's own (rovno-db supabase/functions/_shared/
// blogArticleDoc.fixture.json: `content` and `content_html`), copied here by
// the integrator. TipTap is the reference: a mismatch is fixed in the door.
// Until the door's fixture lands, the file holds a document built to the
// §10.1 outline and normalized through this editor, with HTML from getHTML().

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Editor, generateHTML, getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { blogContentExtensions } from "@/components/blog/editor/blogExtensions";
import { sanitizeArticleHtml } from "./sanitize";

interface DoorFixture {
  content: Record<string, unknown>;
  content_html: string;
}

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, "__fixtures__/shurik-door-v1.json"), "utf8"),
) as DoorFixture;

function editorFor(content: unknown): { editor: Editor; contentErrors: Error[] } {
  const contentErrors: Error[] = [];
  const editor = new Editor({
    extensions: blogContentExtensions(),
    content: content as Record<string, unknown>,
    // The same switch RichTextEditor sets: an unknown node must fail, not be
    // swallowed into an empty document.
    enableContentCheck: true,
    onContentError: ({ error }) => {
      contentErrors.push(error);
    },
  });
  return { editor, contentErrors };
}

function nodeTypes(node: Record<string, unknown>, into = new Set<string>()): Set<string> {
  into.add(String(node.type));
  for (const child of (node.content as Record<string, unknown>[] | undefined) ?? []) nodeTypes(child, into);
  return into;
}

describe("Shurik's door output vs the blog editor", () => {
  it("covers every block the door can emit", () => {
    // A fixture that silently lost its table would make the rest vacuous.
    const types = nodeTypes(fixture.content);
    for (const type of [
      "paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote",
      "horizontalRule", "figure", "figcaption", "faqItem", "faqQuestion", "faqAnswer",
      "table", "tableRow", "tableHeader", "tableCell",
    ]) {
      expect(types, type).toContain(type);
    }
  });

  it("is a valid document of the editor's schema", () => {
    const schema = getSchema(blogContentExtensions());

    const doc = PMNode.fromJSON(schema, fixture.content);

    expect(() => doc.check()).not.toThrow();
  });

  it("loads into the editor with the content check on", () => {
    const { editor, contentErrors } = editorFor(fixture.content);
    try {
      expect(contentErrors).toEqual([]);
      expect(editor.isEmpty).toBe(false);
    } finally {
      editor.destroy();
    }
  });

  it("is stored exactly as the editor would store it", () => {
    // The door writes `content`; the admin later saves editor.getJSON() over it.
    // Equal means opening a door post in /blog/admin changes nothing by itself.
    const { editor } = editorFor(fixture.content);
    try {
      expect(editor.getJSON()).toEqual(fixture.content);
    } finally {
      editor.destroy();
    }
  });

  it("carries the HTML the editor's getHTML() gives, byte for byte", () => {
    const { editor } = editorFor(fixture.content);
    try {
      expect(editor.getHTML()).toBe(fixture.content_html);
    } finally {
      editor.destroy();
    }
  });

  it("carries the HTML generateHTML() gives with the same extensions", () => {
    expect(generateHTML(fixture.content, blogContentExtensions())).toBe(fixture.content_html);
  });

  it("survives the sanitizer unchanged (the admin saves sanitizeArticleHtml(getHTML()))", () => {
    expect(sanitizeArticleHtml(fixture.content_html)).toBe(fixture.content_html);
  });
});
