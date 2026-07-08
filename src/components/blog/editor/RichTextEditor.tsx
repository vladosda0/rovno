// Medium-style rich-text editor for blog articles (TipTap v3).
//
// UX surface:
//  - bubble menu on selection: bold / italic / underline / strike / inline
//    code / link (inline URL input, ⌘K) / H2 / H3 / quote;
//  - floating "+" menu on an empty paragraph: image upload, YouTube embed,
//    bullet/ordered list, code block, divider;
//  - drag-drop and paste of image files uploads to the blog-images bucket and
//    inserts a <figure> (image + caption) at the drop/caret position.
//
// The content area is rendered with the SAME .rv-article classes the public
// page uses — the editor is WYSIWYG against blog.css.

import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu, FloatingMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { CharacterCount, Placeholder } from "@tiptap/extensions";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Link2, Link2Off,
  Heading2, Heading3, Quote, ImagePlus, ListOrdered, List, Minus, Plus, SquareCode, X,
  Youtube as YoutubeIcon,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadBlogImage } from "@/lib/blog/api";
import { isInternalHref, normalizeHref } from "@/lib/blog/link-href";
import { Figure } from "./Figure";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import "./editor.css";

export interface RichTextEditorProps {
  /** TipTap JSON to hydrate with (once, when the editor mounts or post loads). */
  initialContent: unknown | null;
  placeholder: string;
  onReady: (editor: Editor) => void;
  onChange: () => void;
}

function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function RichTextEditor({ initialContent, placeholder, onReady, onChange }: RichTextEditorProps) {
  const { toast } = useToast();
  const [linkMode, setLinkMode] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  // Two-stage "+" menu (Medium-style): an empty focused line shows only a
  // small plus button; the block panel opens on click.
  const [plusOpen, setPlusOpen] = useState(false);
  const plusOpenRef = useRef(false);
  plusOpenRef.current = plusOpen;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedRef = useRef(false);
  // editorProps closes over the FIRST render, so ⌘K reaches the live callback
  // through a ref rather than a stale copy of it.
  const openLinkEditorRef = useRef<(() => void) | null>(null);

  const uploadAndInsert = useCallback(
    async (editor: Editor, files: File[], position?: number) => {
      const images = files.filter(isImageFile);
      if (images.length === 0) return;
      for (const file of images) {
        try {
          const { url, width, height } = await uploadBlogImage(file);
          const attrs = { src: url, alt: null, width, height };
          const chain = editor.chain().focus();
          if (position !== undefined) {
            chain.insertContentAt(position, { type: "figure", attrs }).run();
          } else {
            chain.setFigure(attrs).run();
          }
        } catch (error) {
          toast({
            title: "Не удалось загрузить изображение",
            description: error instanceof Error ? error.message : String(error),
            variant: "destructive",
          });
        }
      }
    },
    [toast],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          defaultProtocol: "https",
          // Defaults for autolinked (always outbound) URLs. applyLink overrides
          // both to null on internal links so they open in the same tab.
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      Figure,
      // Legacy: articles written before the figure node still hold plain `image`
      // nodes. Unregistering Image would make TipTap drop them on hydrate, and
      // the autosave would then write the loss back to the DB.
      Image,
      Youtube.configure({ nocookie: true, width: 0, height: 0, HTMLAttributes: {} }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: (initialContent as object | null) ?? "",
    editorProps: {
      attributes: { class: "rv-article rv-editor-content" },
      handleKeyDown: (view, event) => {
        if (event.key === "Escape" && plusOpenRef.current) {
          setPlusOpen(false);
          return true;
        }
        // ⌘K / Ctrl+K — the shortcut every writer reaches for. The bubble menu
        // is already on screen (it shows on any non-empty selection), so this
        // only has to flip it into link-input mode.
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
          if (view.state.selection.empty) return false;
          event.preventDefault();
          openLinkEditorRef.current?.();
          return true;
        }
        return false;
      },
      handleDrop: (view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.some(isImageFile)) {
          event.preventDefault();
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (editorRef.current) {
            void uploadAndInsert(editorRef.current, files, coords?.pos);
          }
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.some(isImageFile)) {
          event.preventDefault();
          if (editorRef.current) {
            void uploadAndInsert(editorRef.current, files);
          }
          return true;
        }
        return false;
      },
    },
    onUpdate: () => onChange(),
  });

  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  // Collapse the "+" panel back to the bare plus whenever the context that
  // opened it goes away: content changed, caret moved, or the editor blurred.
  useEffect(() => {
    if (!editor) return;
    const close = () => setPlusOpen(false);
    editor.on("update", close);
    editor.on("selectionUpdate", close);
    editor.on("blur", close);
    return () => {
      editor.off("update", close);
      editor.off("selectionUpdate", close);
      editor.off("blur", close);
    };
  }, [editor]);

  // The bubble menu stays mounted while hidden, so link mode would otherwise
  // survive: open the URL input, click elsewhere, select other text — and the
  // menu reappears as an input still holding the previous link.
  //
  // selectionUpdate only, NOT blur: focusing the autoFocus'd URL input blurs
  // the editor, which would close the input the instant it opened.
  useEffect(() => {
    if (!editor) return;
    const close = () => setLinkMode(false);
    editor.on("selectionUpdate", close);
    return () => {
      editor.off("selectionUpdate", close);
    };
  }, [editor]);

  // Hydrate once when async post data arrives after mount (edit flow).
  useEffect(() => {
    if (!editor || hydratedRef.current) return;
    if (initialContent && Object.keys(initialContent as object).length > 0) {
      hydratedRef.current = true;
      editor.commands.setContent(initialContent as object, { emitUpdate: false });
    }
  }, [editor, initialContent]);

  const openLinkEditor = useCallback(() => {
    if (!editor) return;
    setLinkValue((editor.getAttributes("link").href as string | undefined) ?? "");
    setLinkMode(true);
  }, [editor]);
  openLinkEditorRef.current = openLinkEditor;

  const applyLink = useCallback(() => {
    if (!editor) return;

    // Empty input on an existing link means "remove it".
    if (!linkValue.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkMode(false);
      return;
    }

    const href = normalizeHref(linkValue);
    if (!href) {
      toast({
        title: "Не удалось распознать ссылку",
        description: "Укажите адрес вида https://example.com, /blog/statya или #razdel.",
        variant: "destructive",
      });
      return;
    }

    const internal = isInternalHref(href);
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href,
        // null clears the extension-level default (mergeAttributes lets the node
        // attribute win, and ProseMirror omits null attributes on serialize).
        target: internal ? null : "_blank",
        rel: internal ? null : "noopener noreferrer",
      })
      .run();
    setLinkMode(false);
  }, [editor, linkValue, toast]);

  const insertYoutube = useCallback(() => {
    if (!editor) return;
    const src = youtubeUrl.trim();
    if (src) {
      editor.commands.setYoutubeVideo({ src });
    }
    setYoutubeOpen(false);
    setYoutubeUrl("");
  }, [editor, youtubeUrl]);

  if (!editor) return null;

  return (
    <>
      <BubbleMenu
        editor={editor}
        pluginKey="blogBubbleMenu"
        shouldShow={({ editor: e, state }) => {
          if (e.isActive("image") || e.isActive("youtube") || e.isActive("codeBlock")) return false;
          // A NodeSelection (clicked image / figure / divider) reports a
          // non-empty selection but has no text to format. Text *inside* a
          // figure caption is a TextSelection and still gets the menu.
          if ("node" in state.selection && state.selection.node) return false;
          return !state.selection.empty;
        }}
      >
        <div className="rv-editor-menu" onMouseDown={(e) => e.preventDefault()}>
          {linkMode ? (
            <>
              <input
                autoFocus
                value={linkValue}
                onChange={(e) => setLinkValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                  if (e.key === "Escape") setLinkMode(false);
                }}
                placeholder="https://…"
              />
              <button type="button" onClick={applyLink} title="Сохранить ссылку">✓</button>
              <button type="button" onClick={() => setLinkMode(false)} title="Отмена">✕</button>
            </>
          ) : (
            <>
              <button type="button" className={editor.isActive("bold") ? "active" : ""} onClick={() => editor.chain().focus().toggleBold().run()} title="Полужирный">
                <Bold size={15} />
              </button>
              <button type="button" className={editor.isActive("italic") ? "active" : ""} onClick={() => editor.chain().focus().toggleItalic().run()} title="Курсив">
                <Italic size={15} />
              </button>
              <button type="button" className={editor.isActive("underline") ? "active" : ""} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Подчёркнутый">
                <UnderlineIcon size={15} />
              </button>
              <button type="button" className={editor.isActive("strike") ? "active" : ""} onClick={() => editor.chain().focus().toggleStrike().run()} title="Зачёркнутый">
                <Strikethrough size={15} />
              </button>
              <button type="button" className={editor.isActive("code") ? "active" : ""} onClick={() => editor.chain().focus().toggleCode().run()} title="Код">
                <Code size={15} />
              </button>
              <span className="rv-editor-menu__divider" />
              <button type="button" className={editor.isActive("link") ? "active" : ""} onClick={openLinkEditor} title="Ссылка">
                <Link2 size={15} />
              </button>
              {editor.isActive("link") && (
                <button type="button" onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} title="Убрать ссылку">
                  <Link2Off size={15} />
                </button>
              )}
              <span className="rv-editor-menu__divider" />
              <button type="button" className={editor.isActive("heading", { level: 2 }) ? "active" : ""} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Заголовок">
                <Heading2 size={15} />
              </button>
              <button type="button" className={editor.isActive("heading", { level: 3 }) ? "active" : ""} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Подзаголовок">
                <Heading3 size={15} />
              </button>
              <button type="button" className={editor.isActive("blockquote") ? "active" : ""} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Цитата">
                <Quote size={15} />
              </button>
            </>
          )}
        </div>
      </BubbleMenu>

      <FloatingMenu
        editor={editor}
        pluginKey="blogFloatingMenu"
        options={{ placement: "right-start", offset: { mainAxis: -38, crossAxis: 0 }, flip: false, shift: false }}
        shouldShow={({ editor: e, state }) => {
          // Focus check matters: without it the (empty) editor kept the menu
          // on screen while the user clicked into the title/subtitle fields.
          if (!e.isFocused) return false;
          const { $anchor, empty } = state.selection;
          if (!empty) return false;
          const isRootParagraph = $anchor.depth === 1 && $anchor.parent.type.name === "paragraph";
          return isRootParagraph && $anchor.parent.content.size === 0;
        }}
      >
        <div className="rv-editor-pluswrap" onMouseDown={(e) => e.preventDefault()}>
          <button
            type="button"
            className={`rv-editor-plusbtn${plusOpen ? " open" : ""}`}
            title={plusOpen ? "Закрыть" : "Добавить блок"}
            aria-label={plusOpen ? "Закрыть меню вставки" : "Добавить блок"}
            aria-expanded={plusOpen}
            onClick={() => setPlusOpen((v) => !v)}
          >
            {plusOpen ? <X size={16} /> : <Plus size={16} />}
          </button>
          {plusOpen && (
            <div className="rv-editor-plus">
              <button type="button" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus size={14} /> Фото
              </button>
              <button type="button" onClick={() => setYoutubeOpen(true)}>
                <YoutubeIcon size={14} /> Видео
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>
                <List size={14} /> Список
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                <ListOrdered size={14} /> Нумерация
              </button>
              <button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
                <SquareCode size={14} /> Код
              </button>
              <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
                <Minus size={14} /> Разделитель
              </button>
            </div>
          )}
        </div>
      </FloatingMenu>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length > 0) void uploadAndInsert(editor, files);
        }}
      />

      <Dialog open={youtubeOpen} onOpenChange={setYoutubeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Вставить видео</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Ссылка на YouTube"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                insertYoutube();
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setYoutubeOpen(false)}>Отмена</Button>
            <Button onClick={insertYoutube}>Вставить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditorContent editor={editor} />
    </>
  );
}
