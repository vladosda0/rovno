// The document extensions of the blog editor: everything that shapes the
// schema (which nodes and marks exist), the JSON the editor stores in
// blog_posts.content and the HTML getHTML() hands to content_html.
//
// One list for two callers, so they cannot drift: RichTextEditor adds only UI
// on top (Placeholder, CharacterCount), and shurikDoorContract.test.ts loads
// the door's fixture through exactly this list to prove that what Shurik's
// door (rovno-db blog-shurik-door) writes is what this editor would write.
//
// A function, not a constant: every Editor gets fresh extension instances.

import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Figcaption, Figure } from "./Figure";
import { FaqAnswer, FaqItem, FaqQuestion } from "./Faq";
import { IsolatedInputRules } from "./isolatedInputRules";

export function blogContentExtensions(): AnyExtension[] {
  return [
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
    Figcaption,
    FaqItem,
    FaqQuestion,
    FaqAnswer,
    // Must be registered: `isolating` guards commands, not input rules. Typing
    // `---` in a caption or an FAQ answer otherwise tears the node apart.
    IsolatedInputRules,
    // Legacy: articles written before the figure node still hold plain `image`
    // nodes. Unregistering Image would make TipTap drop them on hydrate, and
    // the autosave would then write the loss back to the DB.
    Image,
    Youtube.configure({ nocookie: true, width: 0, height: 0, HTMLAttributes: {} }),
    // Tables arrive from Shurik's door (blog-shurik-door builds the same
    // table > tableRow > tableHeader/tableCell > paragraph JSON). There is no
    // "insert table" button: the editor only has to load them and let cell
    // text be edited. Without these four, the editor's enableContentCheck would
    // refuse every article that carries a table. Not resizable: column widths
    // would land in the HTML as inline styles the public page then obeys.
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ];
}
