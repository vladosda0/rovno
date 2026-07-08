// <figure> node: an image plus an inline-editable <figcaption>.
//
// Why a custom node instead of configuring @tiptap/extension-image: the caption
// is *content*, not an attribute. Modelling it as `content: "inline*"` gives it
// the normal editing surface for free (typing, marks, links inside the caption)
// and serializes to the semantic <figure>/<figcaption> pair that blog.css has
// styled since day one and that search engines read as an image caption.
//
// `alt` stays an attribute: it is metadata for crawlers and screen readers, is
// never rendered visually, and must survive a caption being deleted.
//
// Back-compat: the plain `image` node stays registered in RichTextEditor. Posts
// written before this extension existed still hold `image` nodes in their
// content jsonb, and dropping the extension would make TipTap silently discard
// them on hydrate — then autosave would persist the loss.

import { useRef, useState } from "react";
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

function toDimension(value: string | null): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function AltTextDialog({
  open, onOpenChange, value, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value);
        onOpenChange(next);
      }}
    >
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
  const captionEmpty = node.content.size === 0;

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
      className={`rv-figure${selected ? " is-selected" : ""}`}
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

      {/* Explicit type arg: NodeViewContent's `as` is NoInfer<T>, so without it
          T falls back to the 'div' default and rejects "figcaption". */}
      <NodeViewContent<"figcaption">
        as="figcaption"
        className={captionEmpty ? "is-empty" : undefined}
        data-placeholder="Подпись к изображению"
      />

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
  content: "inline*",
  draggable: true,
  // isolating: a Backspace at the caption start must not lift text out of the
  // figure into the surrounding document.
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
      {
        tag: "figure[data-rv-figure]",
        // Content comes from the caption; the <img> is read into attrs. Without
        // this, ProseMirror would descend into the figure and let the Image
        // extension claim the <img> as a sibling block.
        contentElement: "figcaption",
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
    const img: Record<string, unknown> = {
      src,
      // Below-the-fold article images: never block the LCP paint, and reserve
      // their box up front so late-decoding photos can't shove text around.
      loading: "lazy",
      decoding: "async",
    };
    if (alt) img.alt = alt;
    if (width && height) {
      img.width = width;
      img.height = height;
    }
    // 0 = the content hole: the caption's inline content lands in <figcaption>.
    return ["figure", { "data-rv-figure": "" }, ["img", img], ["figcaption", {}, 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FigureNodeView);
  },

  addCommands() {
    return {
      setFigure:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});
