// <figure> node: an image plus an inline-editable <figcaption>.
//
// Why a custom node instead of configuring @tiptap/extension-image: the caption
// is *content*, not an attribute. Modelling it as editable content gives it the
// normal editing surface for free (typing, marks, links inside the caption) and
// serializes to the semantic <figure>/<figcaption> pair that blog.css has
// styled since day one and that search engines read as an image caption.
//
// `alt` stays an attribute: it is metadata for crawlers and screen readers, is
// never rendered visually, and must survive a caption being deleted.
//
// SCHEMA SHAPE — figure > figcaption, NOT figure{content:"inline*"}.
// The obvious modelling (figure holding inline content directly) makes the
// figure a doc-level TEXTBLOCK. Every block command then *applies* to it:
// clicking H2 with the caret in the caption ran setBlockType and replaced the
// whole figure (image, alt, dimensions and all) with an <h2> holding the caption
// text, and autosave persisted the loss 1.5s later. Gating the toolbar is not
// enough — Mod-Alt-2 and the "## " input rule reach the same command.
// Nesting the caption in its own node fixes it at the schema level: figure's
// content expression is exactly "figcaption", so canReplaceWith(heading) is
// false and every block command becomes inapplicable rather than destructive.
//
// Back-compat: the plain `image` node stays registered in RichTextEditor. Posts
// written before this extension existed still hold `image` nodes in their
// content jsonb, and dropping the extension would make TipTap discard them.

import { useEffect, useRef, useState } from "react";
import { Node } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { Repeat2, Text as TextIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadBlogImage } from "@/lib/blog/api";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface FigureAttrs {
  src: string;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    figure: {
      /** Insert a figure (image + empty caption) at the current selection. */
      setFigure: (attrs: FigureAttrs) => ReturnType;
    };
  }
}

/**
 * A dimension is a whole number of pixels or nothing.
 *
 * parseInt would happily read "1e3" as 1, "12px" as 12 and "3.7" as 3, stamping
 * a WRONG intrinsic size onto the <img> and reserving the wrong box. That is the
 * exact layout shift width/height exists to prevent, and it is worse than
 * omitting the attributes entirely.
 */
function toDimension(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value.trim())) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** The caption. Only ever a child of `figure`: no `group`, so doc's "block+"
 * never matches it. */
export const Figcaption = Node.create({
  name: "figcaption",
  content: "inline*",
  // A Backspace at the caption start must not lift its text into the document.
  isolating: true,
  parseHTML() {
    // Scoped to a figcaption inside one of our figures, AND only when that
    // figure actually has an image.
    //
    // Without the getAttrs guard, a figure whose <img> is missing (so Figure's
    // own getAttrs returned false, declining the element) still exposes its
    // figcaption. ProseMirror cannot place a figcaption at doc level, so
    // findWrapping() invents a fresh `figure` around it — with src=null, which
    // renders as a broken <img> and round-trips into the DB. Returning false
    // declines the match, and the caption text degrades into a paragraph.
    return [
      {
        tag: "figure[data-rv-figure] > figcaption",
        // Require a NON-EMPTY src: `img[src]` also matches <img src="">, which
        // would let this caption keep a figure whose own getAttrs declined it
        // (src falsy) and leave an orphan src=null figure.
        getAttrs: (element) => {
          const img = element.parentElement?.querySelector("img");
          return img?.getAttribute("src") ? null : false;
        },
      },
    ];
  },
  renderHTML() {
    return ["figcaption", {}, 0];
  },
});

function AltTextDialog({
  open, onOpenChange, value, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // Reset on open. Radix never calls onOpenChange(true) here (the dialog is
  // opened imperatively), so seeding the draft there left an abandoned draft
  // alive across a cancel: type, Esc, reopen, Save — and the discarded text
  // landed in `alt`.
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Альтернативный текст</DialogTitle>
          <DialogDescription>
            Опишите, что изображено. Alt читают поисковые системы и скринридеры —
            он не виден на странице, в отличие от подписи.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Дашборд Ровно: список объектов с этапами и бюджетом"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave(draft.trim());
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button onClick={() => onSave(draft.trim())}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FigureNodeView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const { toast } = useToast();
  const [altOpen, setAltOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const src = node.attrs.src as string;
  const alt = (node.attrs.alt as string | null) ?? "";
  const captionEmpty = (node.firstChild?.content.size ?? 0) === 0;

  // Swap the photo in place. Deleting and re-inserting the figure would take
  // the caption and the alt text with it — which is exactly what you don't want
  // when replacing a placeholder with the real screenshot.
  async function replaceImage(file: File) {
    setReplacing(true);
    try {
      const { url, width, height } = await uploadBlogImage(file);
      updateAttributes({ src: url, width, height });
    } catch (error) {
      toast({
        title: "Не удалось заменить изображение",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setReplacing(false);
    }
  }

  return (
    <NodeViewWrapper
      as="figure"
      data-rv-figure=""
      className={`rv-figure${selected ? " is-selected" : ""}${captionEmpty ? " caption-empty" : ""}`}
    >
      {/* Not editable: ProseMirror must select the node, not place a caret in it. */}
      <div className="rv-figure__media" contentEditable={false}>
        <img src={src} alt={alt} />
        {editor.isEditable && (
          <div className="rv-figure__tools">
            <button
              type="button"
              className="rv-figure__tool"
              title="Заменить изображение (подпись и alt сохранятся)"
              disabled={replacing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Repeat2 size={12} />
              {replacing ? "…" : "ЗАМЕНИТЬ"}
            </button>
            <button
              type="button"
              className={`rv-figure__tool rv-figure__alt${alt ? " has-alt" : ""}`}
              title={alt ? `Alt: ${alt}` : "Добавить alt-текст (для SEO и скринридеров)"}
              onClick={() => setAltOpen(true)}
            >
              <TextIcon size={12} />
              {alt ? "ALT" : "ALT?"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void replaceImage(file);
              }}
            />
          </div>
        )}
      </div>

      {/* A plain div, not <figcaption>: the child figcaption NODE renders itself
          in here, and `as="figcaption"` would nest one inside the other. */}
      <NodeViewContent as="div" className="rv-figure__caption" />

      {editor.isEditable && (
        <AltTextDialog
          open={altOpen}
          onOpenChange={setAltOpen}
          value={alt}
          onSave={(next) => {
            updateAttributes({ alt: next || null });
            setAltOpen(false);
          }}
        />
      )}
    </NodeViewWrapper>
  );
}

export const Figure = Node.create({
  name: "figure",
  group: "block",
  content: "figcaption",
  draggable: true,
  isolating: true,

  addAttributes() {
    // rendered:false — these describe the inner <img>, not the <figure>, so we
    // place them by hand in renderHTML instead of letting TipTap spread them
    // onto the wrapper.
    return {
      src: { default: null, rendered: false },
      alt: { default: null, rendered: false },
      width: { default: null, rendered: false },
      height: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [
      // The <img> is read into attrs by getAttrs below; it must not also be
      // parsed as a sibling `image` node. Explicit + high priority so this wins
      // over @tiptap/extension-image's `img[src]` rule regardless of load order.
      { tag: "figure[data-rv-figure] > img", ignore: true, priority: 100 },
      {
        tag: "figure[data-rv-figure]",
        getAttrs: (element) => {
          const img = element.querySelector("img");
          const src = img?.getAttribute("src");
          if (!src) return false;
          return {
            src,
            alt: img?.getAttribute("alt") || null,
            width: toDimension(img?.getAttribute("width") ?? null),
            height: toDimension(img?.getAttribute("height") ?? null),
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const { src, alt, width, height } = node.attrs;

    // Built by hand rather than as an array spec: ProseMirror requires the
    // content hole (`0`) to be the ONLY child of its parent array, so
    // ["figure", attrs, ["img", …], 0] is rejected. Returning {dom, contentDOM}
    // lets the <figcaption> land inside the same <figure> as the <img>, which is
    // the markup the HTML spec (and every crawler) expects.
    const figure = document.createElement("figure");
    figure.setAttribute("data-rv-figure", "");

    const img = document.createElement("img");
    img.setAttribute("src", src);
    // Below-the-fold article images: never block the LCP paint, and reserve
    // their box up front so late-decoding photos can't shove text around.
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    // Deliberately omit alt when unset rather than emitting alt="": an empty alt
    // declares the image DECORATIVE and drops it from image search. A missing
    // one is flagged by a11y/SEO audits, which is the signal we want while the
    // editor is still shouting "ALT?" about it.
    if (alt) img.setAttribute("alt", alt);
    if (width && height) {
      img.setAttribute("width", String(width));
      img.setAttribute("height", String(height));
    }
    figure.appendChild(img);

    // contentDOM === figure: the child figcaption node is appended after the img.
    return { dom: figure, contentDOM: figure };
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureNodeView);
  },

  addCommands() {
    return {
      setFigure:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs,
            content: [{ type: "figcaption" }],
          }),
    };
  },
});
